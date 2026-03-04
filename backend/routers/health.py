"""
GET /health — DB ping + row counts
"""

from fastapi import APIRouter, Request

router = APIRouter()


@router.get("/health")
def health_check(request: Request):
    pool = request.app.state.pool
    conn = pool.getconn()
    try:
        cur = conn.cursor()
        cur.execute("SELECT COUNT(*) FROM proc.quote_lines")
        quote_count = cur.fetchone()[0]
        cur.execute("SELECT COUNT(*) FROM proc.vendors")
        vendor_count = cur.fetchone()[0]
        cur.close()
        return {
            "data": {
                "status": "ok",
                "db": "connected",
                "quote_lines": quote_count,
                "vendors": vendor_count,
            },
            "meta": {"count": 1},
        }
    except Exception as e:
        return {"data": {"status": "error", "detail": str(e)}, "meta": {"count": 0}}
    finally:
        pool.putconn(conn)
