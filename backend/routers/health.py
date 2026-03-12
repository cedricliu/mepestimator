"""
GET /health — DB ping + row counts
"""

from fastapi import APIRouter, Depends, Request

from auth_utils import require_estimator

router = APIRouter()


@router.get("/health")
def health_check(request: Request, _: dict = Depends(require_estimator)):
    pool = request.app.state.pool
    conn = pool.getconn()
    try:
        cur = conn.cursor()
        cur.execute("SELECT COUNT(*) FROM proc.quote_lines")
        quote_count = cur.fetchone()[0]
        cur.execute("SELECT COUNT(*) FROM proc.vendors")
        vendor_count = cur.fetchone()[0]
        cur.execute(
            "SELECT parse_status, COUNT(*) FROM stg.raw_quote_lines GROUP BY parse_status ORDER BY parse_status"
        )
        parse_status_rows = cur.fetchall()
        parse_status_breakdown = {r[0]: r[1] for r in parse_status_rows}
        cur.execute("SELECT COUNT(*) FROM proc.users")
        users_count = cur.fetchone()[0]
        cur.execute("SELECT email FROM proc.users WHERE role = 'admin' LIMIT 1")
        admin_row = cur.fetchone()
        admin_email = admin_row[0] if admin_row else None
        cur.close()
        return {
            "data": {
                "status": "ok",
                "db": "connected",
                "quote_lines": quote_count,
                "vendors": vendor_count,
                "parse_status_breakdown": parse_status_breakdown,
                "users_count": users_count,
                "admin_email": admin_email,
            },
            "meta": {"count": 1},
        }
    except Exception as e:
        return {"data": {"status": "error", "detail": str(e)}, "meta": {"count": 0}}
    finally:
        pool.putconn(conn)
