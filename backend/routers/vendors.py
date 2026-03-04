"""
GET /vendors — list active vendors
"""

from fastapi import APIRouter, Request

router = APIRouter()


@router.get("")
def list_vendors(request: Request):
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
