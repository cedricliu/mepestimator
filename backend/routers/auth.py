"""
backend/routers/auth.py — JWT login, refresh, logout
POST /auth/login   → access_token (JSON) + refresh_token (httpOnly cookie)
POST /auth/refresh → rotate refresh token, return new access_token
POST /auth/logout  → revoke refresh token, clear cookie
"""

import hashlib
import os
import secrets
from datetime import datetime, timedelta, timezone

import psycopg2.extras
from dotenv import load_dotenv
from fastapi import APIRouter, Cookie, HTTPException, Request, Response, status
from pydantic import BaseModel

from auth_utils import create_access_token, verify_password

load_dotenv()

REFRESH_TOKEN_EXPIRE_DAYS = int(os.getenv("REFRESH_TOKEN_EXPIRE_DAYS", "7"))
COOKIE_NAME = "refresh_token"

router = APIRouter()


def _hash_token(raw: str) -> str:
    return hashlib.sha256(raw.encode()).hexdigest()


def _set_refresh_cookie(response: Response, raw_token: str) -> None:
    response.set_cookie(
        key=COOKIE_NAME,
        value=raw_token,
        httponly=True,
        samesite="lax",
        secure=False,          # set True in prod behind HTTPS
        max_age=REFRESH_TOKEN_EXPIRE_DAYS * 86400,
        path="/auth",
    )


def _clear_refresh_cookie(response: Response) -> None:
    response.set_cookie(
        key=COOKIE_NAME,
        value="",
        httponly=True,
        samesite="lax",
        secure=False,
        max_age=0,
        path="/auth",
    )


class LoginBody(BaseModel):
    email: str
    password: str


@router.post("/login")
def login(body: LoginBody, request: Request, response: Response):
    pool = request.app.state.pool
    conn = pool.getconn()
    try:
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute(
            "SELECT user_id, email, hashed_password, role, display_name, active "
            "FROM proc.users WHERE email = %s",
            (body.email,),
        )
        user = cur.fetchone()
        if not user or not user["active"]:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")
        if not verify_password(body.password, user["hashed_password"]):
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")

        # Issue access token
        access_token = create_access_token({
            "sub": str(user["user_id"]),
            "email": user["email"],
            "role": user["role"],
        })

        # Issue refresh token
        raw_refresh = secrets.token_urlsafe(32)
        token_hash = _hash_token(raw_refresh)
        expires_at = datetime.now(timezone.utc) + timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS)
        user_agent = request.headers.get("user-agent", "")[:255]

        cur.execute(
            """
            INSERT INTO proc.refresh_tokens (user_id, token_hash, expires_at, user_agent)
            VALUES (%s, %s, %s, %s)
            """,
            (user["user_id"], token_hash, expires_at, user_agent),
        )

        # Update last_login
        cur.execute(
            "UPDATE proc.users SET last_login = now() WHERE user_id = %s",
            (user["user_id"],),
        )
        conn.commit()
        cur.close()

        _set_refresh_cookie(response, raw_refresh)
        return {
            "access_token": access_token,
            "token_type": "bearer",
            "role": user["role"],
            "display_name": user["display_name"],
            "expires_in": 28800,
        }
    except HTTPException:
        raise
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        pool.putconn(conn)


@router.post("/refresh")
def refresh(request: Request, response: Response, refresh_token: str = Cookie(default=None)):
    if not refresh_token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="No refresh token")

    token_hash = _hash_token(refresh_token)
    pool = request.app.state.pool
    conn = pool.getconn()
    try:
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute(
            """
            SELECT rt.token_id, rt.user_id, rt.expires_at, rt.revoked,
                   u.email, u.role, u.display_name, u.active
            FROM proc.refresh_tokens rt
            JOIN proc.users u ON u.user_id = rt.user_id
            WHERE rt.token_hash = %s
            """,
            (token_hash,),
        )
        rt = cur.fetchone()

        if not rt:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid refresh token")
        if rt["revoked"]:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Refresh token revoked")
        if rt["expires_at"] < datetime.now(timezone.utc):
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Refresh token expired")
        if not rt["active"]:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User inactive")

        # Revoke old token
        cur.execute(
            "UPDATE proc.refresh_tokens SET revoked = true WHERE token_id = %s",
            (rt["token_id"],),
        )

        # Issue new refresh token
        new_raw = secrets.token_urlsafe(32)
        new_hash = _hash_token(new_raw)
        new_expires = datetime.now(timezone.utc) + timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS)
        user_agent = request.headers.get("user-agent", "")[:255]

        cur.execute(
            """
            INSERT INTO proc.refresh_tokens (user_id, token_hash, expires_at, user_agent)
            VALUES (%s, %s, %s, %s)
            """,
            (rt["user_id"], new_hash, new_expires, user_agent),
        )
        conn.commit()
        cur.close()

        # New access token
        access_token = create_access_token({
            "sub": str(rt["user_id"]),
            "email": rt["email"],
            "role": rt["role"],
        })

        _set_refresh_cookie(response, new_raw)
        return {
            "access_token": access_token,
            "token_type": "bearer",
            "role": rt["role"],
            "display_name": rt["display_name"],
            "expires_in": 28800,
        }
    except HTTPException:
        raise
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        pool.putconn(conn)


@router.post("/logout")
def logout(request: Request, response: Response, refresh_token: str = Cookie(default=None)):
    if refresh_token:
        token_hash = _hash_token(refresh_token)
        pool = request.app.state.pool
        conn = pool.getconn()
        try:
            cur = conn.cursor()
            cur.execute(
                "UPDATE proc.refresh_tokens SET revoked = true WHERE token_hash = %s",
                (token_hash,),
            )
            conn.commit()
            cur.close()
        except Exception:
            conn.rollback()
        finally:
            pool.putconn(conn)

    _clear_refresh_cookie(response)
    return {"data": {"message": "Logged out"}, "meta": {}}
