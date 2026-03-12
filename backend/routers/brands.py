"""
GET /brands  — list all brands (estimator+)
POST /brands — create a new brand (admin only)
"""

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel

from auth_utils import require_admin, require_estimator

router = APIRouter()


@router.get("")
def list_brands(request: Request, _: dict = Depends(require_estimator)):
    pool = request.app.state.pool
    conn = pool.getconn()
    try:
        cur = conn.cursor()
        cur.execute(
            """
            SELECT brand_id, brand_code, brand_name, brand_name_en,
                   country_of_origin, notes
            FROM proc.brands
            ORDER BY brand_name
            """
        )
        rows = cur.fetchall()
        cols = [d[0] for d in cur.description]
        data = []
        for r in rows:
            row = dict(zip(cols, r))
            row["brand_id"] = str(row["brand_id"])
            data.append(row)
        cur.close()
        return {"data": data, "meta": {"count": len(data)}}
    except Exception as e:
        return {"data": [], "meta": {"count": 0, "errors": [str(e)]}}
    finally:
        pool.putconn(conn)


class BrandCreate(BaseModel):
    brand_code: str
    brand_name: str
    brand_name_en: Optional[str] = None
    country_of_origin: Optional[str] = None
    notes: Optional[str] = None


@router.post("")
def create_brand(
    body: BrandCreate,
    request: Request,
    _: dict = Depends(require_admin),
):
    pool = request.app.state.pool
    conn = pool.getconn()
    try:
        cur = conn.cursor()
        cur.execute(
            """
            INSERT INTO proc.brands
                (brand_code, brand_name, brand_name_en, country_of_origin, notes)
            VALUES (%s, %s, %s, %s, %s)
            ON CONFLICT (brand_code) DO UPDATE SET
                brand_name        = EXCLUDED.brand_name,
                brand_name_en     = EXCLUDED.brand_name_en,
                country_of_origin = EXCLUDED.country_of_origin,
                notes             = EXCLUDED.notes
            RETURNING brand_id, brand_code, brand_name, brand_name_en,
                      country_of_origin, notes
            """,
            (
                body.brand_code.strip().upper(),
                body.brand_name.strip(),
                body.brand_name_en,
                body.country_of_origin,
                body.notes,
            ),
        )
        row = cur.fetchone()
        cols = [d[0] for d in cur.description]
        brand = dict(zip(cols, row))
        brand["brand_id"] = str(brand["brand_id"])
        conn.commit()
        cur.close()
        return {"data": brand, "meta": {}}
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        pool.putconn(conn)
