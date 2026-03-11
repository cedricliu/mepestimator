"""
GET /vendors  — list active vendors (estimator+)
POST /vendors — create a new vendor (admin only)
"""

from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel

from auth_utils import require_admin, require_estimator

router = APIRouter()


@router.get("")
def list_vendors(request: Request, _: dict = Depends(require_estimator)):
    pool = request.app.state.pool
    conn = pool.getconn()
    try:
        cur = conn.cursor()
        cur.execute(
            """
            SELECT vendor_id, vendor_code, vendor_name, discipline_codes,
                   contact_name, contact_phone, contact_email
            FROM proc.vendors
            WHERE is_active = true
            ORDER BY vendor_name
            """
        )
        rows = cur.fetchall()
        cols = [d[0] for d in cur.description]
        data = []
        for r in rows:
            row = dict(zip(cols, r))
            row["vendor_id"] = str(row["vendor_id"])
            data.append(row)
        cur.close()
        return {"data": data, "meta": {"count": len(data)}}
    except Exception as e:
        return {"data": [], "meta": {"count": 0, "errors": [str(e)]}}
    finally:
        pool.putconn(conn)


class VendorCreate(BaseModel):
    vendor_code: str
    vendor_name: str
    discipline_codes: Optional[List[str]] = []
    contact_name: Optional[str] = None
    contact_phone: Optional[str] = None
    contact_email: Optional[str] = None


@router.post("")
def create_vendor(
    body: VendorCreate,
    request: Request,
    _: dict = Depends(require_admin),
):
    pool = request.app.state.pool
    conn = pool.getconn()
    try:
        cur = conn.cursor()
        cur.execute(
            """
            INSERT INTO proc.vendors
                (vendor_code, vendor_name, discipline_codes,
                 contact_name, contact_phone, contact_email)
            VALUES (%s, %s, %s, %s, %s, %s)
            ON CONFLICT (vendor_code) DO UPDATE SET
                vendor_name      = EXCLUDED.vendor_name,
                discipline_codes = EXCLUDED.discipline_codes,
                contact_name     = EXCLUDED.contact_name,
                contact_phone    = EXCLUDED.contact_phone,
                contact_email    = EXCLUDED.contact_email
            RETURNING vendor_id, vendor_code, vendor_name, discipline_codes,
                      contact_name, contact_phone, contact_email
            """,
            (
                body.vendor_code.strip().upper(),
                body.vendor_name.strip(),
                body.discipline_codes or [],
                body.contact_name,
                body.contact_phone,
                body.contact_email,
            ),
        )
        row = cur.fetchone()
        cols = [d[0] for d in cur.description]
        vendor = dict(zip(cols, row))
        vendor["vendor_id"] = str(vendor["vendor_id"])
        conn.commit()
        cur.close()
        return {"data": vendor, "meta": {}}
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        pool.putconn(conn)
