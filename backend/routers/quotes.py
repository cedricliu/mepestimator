"""
GET /quotes/search  — full-text + ILIKE search on proc.vw_quick_search
GET /quotes/estimate — GFA-based cost estimate from proc.mv_price_stats
"""

from typing import Optional

from fastapi import APIRouter, Query, Request

router = APIRouter()


def _row_to_dict(cur, row):
    cols = [d[0] for d in cur.description]
    d = dict(zip(cols, row))
    for k, v in d.items():
        if hasattr(v, "__float__"):
            d[k] = float(v)
        elif hasattr(v, "isoformat"):
            d[k] = str(v)
    return d


@router.get("/search")
def search_quotes(
    request: Request,
    q: str = Query(default="", description="Search keyword"),
    discipline: Optional[str] = Query(default=None),
    min_confidence: float = Query(default=0.7),
):
    pool = request.app.state.pool
    conn = pool.getconn()
    try:
        cur = conn.cursor()
        conditions = []
        params: list = []

        if q:
            conditions.append(
                "(to_tsvector('simple', description) @@ plainto_tsquery('simple', %s)"
                " OR description ILIKE %s)"
            )
            params.extend([q, f"%{q}%"])

        if discipline:
            conditions.append("discipline = %s")
            params.append(discipline.upper())

        where = ("WHERE " + " AND ".join(conditions)) if conditions else ""

        cur.execute(
            f"""
            SELECT discipline, item_code, description, uom,
                   quote_count, avg_unit_price, min_unit_price, max_unit_price,
                   stddev_unit_price, p25_unit_price, p75_unit_price,
                   latest_quote_date, price_spread_pct
            FROM proc.vw_quick_search
            {where}
            ORDER BY quote_count DESC, description
            LIMIT 200
            """,
            params,
        )
        data = [_row_to_dict(cur, r) for r in cur.fetchall()]
        cur.close()
        return {"data": data, "meta": {"count": len(data)}}
    except Exception as e:
        return {"data": [], "meta": {"count": 0, "errors": [str(e)]}}
    finally:
        pool.putconn(conn)


@router.get("/estimate")
def estimate(
    request: Request,
    project_type: str = Query(...),
    gfa_m2: float = Query(..., gt=0),
):
    pool = request.app.state.pool
    conn = pool.getconn()
    try:
        cur = conn.cursor()

        cur.execute(
            """
            SELECT mep_ratio, complexity_factor
            FROM proc.project_types
            WHERE project_type_code = %s
            """,
            (project_type.upper(),),
        )
        pt = cur.fetchone()
        if not pt:
            return {
                "data": [],
                "meta": {"count": 0, "errors": [f"Unknown project_type: {project_type}"]},
            }

        mep_ratio, complexity_factor = float(pt[0]), float(pt[1])

        # Discipline share of total MEP budget
        discipline_weights = {
            "ELEC": 0.30,
            "HVAC": 0.35,
            "PLUMB": 0.20,
            "FIRE": 0.10,
            "WEAK": 0.05,
        }

        cur.execute(
            """
            SELECT discipline, item_code, description, uom,
                   quote_count, avg_unit_price, min_unit_price, max_unit_price,
                   p25_unit_price, p75_unit_price
            FROM proc.mv_price_stats
            ORDER BY discipline, description
            LIMIT 500
            """
        )

        data = []
        for r in cur.fetchall():
            row = _row_to_dict(cur, r)
            weight = discipline_weights.get(row["discipline"], 0.20)
            estimated_qty = round(gfa_m2 * mep_ratio * complexity_factor * weight, 2)
            row["estimated_qty"] = estimated_qty
            row["estimated_avg"] = round(estimated_qty * (row["avg_unit_price"] or 0), 2)
            row["estimated_min"] = round(estimated_qty * (row["min_unit_price"] or 0), 2)
            row["estimated_max"] = round(estimated_qty * (row["max_unit_price"] or 0), 2)
            data.append(row)

        cur.close()
        return {
            "data": data,
            "meta": {
                "count": len(data),
                "project_type": project_type,
                "gfa_m2": gfa_m2,
            },
        }
    except Exception as e:
        return {"data": [], "meta": {"count": 0, "errors": [str(e)]}}
    finally:
        pool.putconn(conn)
