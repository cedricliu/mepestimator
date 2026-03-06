"""
Products router — structured product + attribute catalogue
GET  /products/families
GET  /products/attributes?family_code=
GET  /products/facets?family_code=
GET  /products/search
GET  /products/brands?family_code=
GET  /products/unmatched
PATCH /products/assign
POST /products/match-legacy
"""

import json as _json
import psycopg2.extras
from fastapi import APIRouter, Request, HTTPException
from pydantic import BaseModel

router = APIRouter()


# ---------------------------------------------------------------------------
# _match_product — module-level helper, imported by ingest.py
# ---------------------------------------------------------------------------
def _match_product(cur, description: str, family_code: str | None = None) -> tuple[str | None, float]:
    """
    Attempt to match a free-text description to proc.products.
    Returns (product_id, confidence).
    Step 1: FTS via to_tsvector @@ plainto_tsquery
    Step 2: ILIKE fallback
    Step 3: No match → (None, 0.0)
    """
    if not description:
        return (None, 0.0)

    family_filter = ""
    family_params: list = []
    if family_code:
        family_filter = "AND pf.family_code = %s"
        family_params = [family_code]

    # Step 1: FTS
    try:
        cur.execute(
            f"""
            SELECT pr.product_id,
                   ts_rank(to_tsvector('simple', pr.description),
                            plainto_tsquery('simple', %s)) AS rank
            FROM proc.products pr
            JOIN proc.product_families pf ON pf.family_id = pr.family_id
            WHERE to_tsvector('simple', pr.description) @@ plainto_tsquery('simple', %s)
              {family_filter}
            ORDER BY rank DESC
            LIMIT 1
            """,
            [description, description] + family_params,
        )
        row = cur.fetchone()
        if row:
            product_id, rank = row
            confidence = min(0.95, 0.60 + float(rank) * 0.35)
            return (str(product_id), confidence)
    except Exception:
        pass

    # Step 2: ILIKE fallback
    try:
        cur.execute(
            f"""
            SELECT pr.product_id
            FROM proc.products pr
            JOIN proc.product_families pf ON pf.family_id = pr.family_id
            WHERE pr.description ILIKE %s
              {family_filter}
            LIMIT 1
            """,
            [f"%{description}%"] + family_params,
        )
        row = cur.fetchone()
        if row:
            return (str(row[0]), 0.75)
    except Exception:
        pass

    return (None, 0.0)


# ---------------------------------------------------------------------------
# GET /products/families
# ---------------------------------------------------------------------------
@router.get("/families")
def get_families(request: Request):
    pool = request.app.state.pool
    conn = pool.getconn()
    try:
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute(
            """
            SELECT family_id, family_code, family_name_zh, discipline, description
            FROM proc.product_families
            ORDER BY discipline, family_code
            """
        )
        rows = cur.fetchall()
        cur.close()
        return {"data": [dict(r) for r in rows], "meta": {"count": len(rows)}}
    finally:
        pool.putconn(conn)


# ---------------------------------------------------------------------------
# GET /products/attributes?family_code=
# ---------------------------------------------------------------------------
@router.get("/attributes")
def get_attributes(request: Request, family_code: str = ""):
    if not family_code:
        raise HTTPException(status_code=400, detail="family_code is required")
    pool = request.app.state.pool
    conn = pool.getconn()
    try:
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute(
            """
            SELECT
                ad.attr_key,
                ad.label_zh,
                ad.unit,
                ad.value_type,
                ad.display_order,
                COALESCE(
                    ARRAY_AGG(DISTINCT pa.attr_value ORDER BY pa.attr_value)
                    FILTER (WHERE pa.attr_value IS NOT NULL),
                    '{}'
                ) AS distinct_values
            FROM proc.attribute_definitions ad
            JOIN proc.product_families pf ON pf.family_id = ad.family_id
            LEFT JOIN proc.products pr ON pr.family_id = pf.family_id
            LEFT JOIN proc.product_attributes pa
                   ON pa.product_id = pr.product_id AND pa.attr_key = ad.attr_key
            WHERE pf.family_code = %s
            GROUP BY ad.attr_key, ad.label_zh, ad.unit, ad.value_type, ad.display_order
            ORDER BY ad.display_order
            """,
            (family_code,),
        )
        rows = cur.fetchall()
        cur.close()
        data = []
        for r in rows:
            d = dict(r)
            d["distinct_values"] = list(d["distinct_values"]) if d["distinct_values"] else []
            data.append(d)
        return {"data": data, "meta": {"count": len(data)}}
    finally:
        pool.putconn(conn)


# ---------------------------------------------------------------------------
# GET /products/all — full catalogue, no family_code required
# ---------------------------------------------------------------------------
@router.get("/all")
def get_all_products(request: Request, q: str = ""):
    pool = request.app.state.pool
    conn = pool.getconn()
    try:
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        where = "WHERE pr.description ILIKE %s" if q else ""
        params = [f"%{q}%"] if q else []
        cur.execute(f"""
            SELECT
                pr.product_id,
                pr.product_code,
                pr.description,
                pf.family_code,
                pf.family_name_zh,
                b.brand_name,
                COALESCE(
                    (SELECT jsonb_object_agg(pa.attr_key, pa.attr_value)
                     FROM proc.product_attributes pa
                     WHERE pa.product_id = pr.product_id),
                    '{{}}'::jsonb
                ) AS attributes,
                COALESCE(SUM(ps.quote_count), 0) AS quote_count
            FROM proc.products pr
            JOIN proc.product_families pf ON pf.family_id = pr.family_id
            LEFT JOIN proc.brands b ON b.brand_id = pr.brand_id
            LEFT JOIN proc.mv_product_price_stats ps ON ps.product_id = pr.product_id
            {where}
            GROUP BY pr.product_id, pr.product_code, pr.description,
                     pf.family_code, pf.family_name_zh, pf.discipline, b.brand_name
            ORDER BY pf.discipline, pf.family_code, pr.description
            LIMIT 200
        """, params)
        rows = cur.fetchall()
        cur.close()
        data = [dict(r) for r in rows]
        return {"data": data, "meta": {"count": len(data)}}
    finally:
        pool.putconn(conn)


# ---------------------------------------------------------------------------
# GET /products/facets?family_code=
# ---------------------------------------------------------------------------
@router.get("/facets")
def get_facets(request: Request, family_code: str = ""):
    if not family_code:
        raise HTTPException(status_code=400, detail="family_code is required")
    pool = request.app.state.pool
    conn = pool.getconn()
    try:
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

        cur.execute(
            "SELECT family_id, family_code, family_name_zh FROM proc.product_families WHERE family_code = %s",
            (family_code,),
        )
        fam = cur.fetchone()
        if not fam:
            raise HTTPException(status_code=404, detail=f"Family {family_code!r} not found")

        # Attribute facets with quote-line counts per value
        cur.execute(
            """
            SELECT
                ad.attr_key,
                ad.label_zh,
                ad.value_type  AS type,
                ad.unit,
                ad.display_order,
                pa.attr_value,
                COUNT(ql.line_id) AS quote_count
            FROM proc.attribute_definitions ad
            JOIN proc.product_families pf ON pf.family_id = ad.family_id
            JOIN proc.product_attributes pa ON pa.attr_key = ad.attr_key
            JOIN proc.products pr
                ON pr.product_id = pa.product_id AND pr.family_id = pf.family_id
            LEFT JOIN proc.quote_lines ql ON ql.product_id = pr.product_id
            WHERE pf.family_code = %s
            GROUP BY ad.attr_key, ad.label_zh, ad.value_type, ad.unit,
                     ad.display_order, pa.attr_value
            ORDER BY ad.display_order, pa.attr_value
            """,
            (family_code,),
        )
        attr_rows = cur.fetchall()

        attrs_map: dict = {}
        for r in attr_rows:
            k = r["attr_key"]
            if k not in attrs_map:
                attrs_map[k] = {
                    "attr_key":     r["attr_key"],
                    "label_zh":     r["label_zh"],
                    "type":         r["type"],
                    "unit":         r["unit"],
                    "display_order": r["display_order"],
                    "options":      [],
                }
            attrs_map[k]["options"].append(
                {"value": r["attr_value"], "count": int(r["quote_count"])}
            )
        facets_list = sorted(attrs_map.values(), key=lambda x: x["display_order"])

        # Brands with quote-line counts
        cur.execute(
            """
            SELECT b.brand_id, b.brand_name, COUNT(ql.line_id) AS quote_count
            FROM proc.brands b
            JOIN proc.products pr ON pr.brand_id = b.brand_id
            JOIN proc.product_families pf
                ON pf.family_id = pr.family_id AND pf.family_code = %s
            LEFT JOIN proc.quote_lines ql ON ql.product_id = pr.product_id
            GROUP BY b.brand_id, b.brand_name
            ORDER BY b.brand_name
            """,
            (family_code,),
        )
        brands = [
            {"brand_id": str(r["brand_id"]), "brand_name": r["brand_name"], "count": int(r["quote_count"])}
            for r in cur.fetchall()
        ]

        # Vendors with quote-line counts
        cur.execute(
            """
            SELECT v.vendor_id, v.vendor_name, COUNT(ql.line_id) AS quote_count
            FROM proc.vendors v
            JOIN proc.quote_lines ql ON ql.vendor_id = v.vendor_id
            JOIN proc.products pr ON pr.product_id = ql.product_id
            JOIN proc.product_families pf
                ON pf.family_id = pr.family_id AND pf.family_code = %s
            GROUP BY v.vendor_id, v.vendor_name
            ORDER BY v.vendor_name
            """,
            (family_code,),
        )
        vendors = [
            {"vendor_id": str(r["vendor_id"]), "vendor_name": r["vendor_name"], "count": int(r["quote_count"])}
            for r in cur.fetchall()
        ]

        cur.close()
        return {
            "family_code":    fam["family_code"],
            "family_name_zh": fam["family_name_zh"],
            "facets":         facets_list,
            "brands":         brands,
            "vendors":        vendors,
        }
    finally:
        pool.putconn(conn)


# ---------------------------------------------------------------------------
# GET /products/search
# Params:
#   family_code  — required
#   attrs        — JSON {"attr_key": ["val1","val2"]}  OR within key, AND across
#   brand_ids    — comma-separated UUIDs
#   vendor_ids   — comma-separated UUIDs
#   date_from, date_to
#   sort         — avg_price_asc | avg_price_desc | quote_count_desc | latest_desc
#   page, page_size (default 20)
# ---------------------------------------------------------------------------
@router.get("/search")
def search_products(request: Request):
    params      = request.query_params
    family_code = params.get("family_code", "")
    attrs_raw   = params.get("attrs", "")
    brand_ids   = [x for x in params.get("brand_ids",  "").split(",") if x]
    vendor_ids  = [x for x in params.get("vendor_ids", "").split(",") if x]
    date_from   = params.get("date_from", "")
    date_to     = params.get("date_to",   "")
    sort        = params.get("sort", "quote_count_desc")
    try:
        page      = max(1, int(params.get("page",      "1")))
        page_size = min(100, max(1, int(params.get("page_size", "20"))))
    except ValueError:
        page, page_size = 1, 20

    try:
        attrs: dict = _json.loads(attrs_raw) if attrs_raw else {}
    except Exception:
        attrs = {}

    if not family_code:
        return {"data": [], "meta": {"count": 0, "total": 0, "page": 1, "page_size": page_size, "pages": 0}}

    pool = request.app.state.pool
    conn = pool.getconn()
    try:
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

        # Whitelist attr_keys to prevent SQL injection
        cur.execute(
            """
            SELECT ad.attr_key
            FROM proc.attribute_definitions ad
            JOIN proc.product_families pf ON pf.family_id = ad.family_id
            WHERE pf.family_code = %s
            """,
            (family_code,),
        )
        valid_attr_keys = {r["attr_key"] for r in cur.fetchall()}

        conditions  = ["pf.family_code = %s"]
        sql_params: list = [family_code]

        if brand_ids:
            conditions.append("pr.brand_id = ANY(%s::uuid[])")
            sql_params.append(brand_ids)

        if vendor_ids:
            conditions.append(
                """
                EXISTS (
                    SELECT 1 FROM proc.quote_lines ql_v
                    WHERE ql_v.product_id = pr.product_id
                      AND ql_v.vendor_id = ANY(%s::uuid[])
                )
                """
            )
            sql_params.append(vendor_ids)

        if date_from:
            conditions.append("ps.latest_quote_date >= %s")
            sql_params.append(date_from)

        if date_to:
            conditions.append("ps.latest_quote_date <= %s")
            sql_params.append(date_to)

        # Attribute filters: OR within key, AND across keys
        for key, values in attrs.items():
            if key not in valid_attr_keys:
                continue
            if isinstance(values, str):
                values = [values]
            values = [v for v in values if v]
            if not values:
                continue
            conditions.append(
                """
                EXISTS (
                    SELECT 1 FROM proc.product_attributes pa2
                    WHERE pa2.product_id = pr.product_id
                      AND pa2.attr_key   = %s
                      AND pa2.attr_value = ANY(%s)
                )
                """
            )
            sql_params.extend([key, values])

        where_clause = " AND ".join(conditions)

        sort_map = {
            "avg_price_asc":    "ps.avg_unit_price ASC NULLS LAST",
            "avg_price_desc":   "ps.avg_unit_price DESC NULLS LAST",
            "quote_count_desc": "ps.quote_count DESC NULLS LAST",
            "latest_desc":      "ps.latest_quote_date DESC NULLS LAST",
        }
        order_by = sort_map.get(sort, "ps.quote_count DESC NULLS LAST")
        offset   = (page - 1) * page_size

        # Total count
        cur.execute(
            f"""
            SELECT COUNT(*) AS total
            FROM proc.products pr
            JOIN proc.product_families pf ON pf.family_id = pr.family_id
            LEFT JOIN proc.brands b ON b.brand_id = pr.brand_id
            LEFT JOIN proc.mv_product_price_stats ps ON ps.product_id = pr.product_id
            WHERE {where_clause}
            """,
            sql_params,
        )
        total = int(cur.fetchone()["total"])

        # Paginated data
        cur.execute(
            f"""
            SELECT
                pr.product_id,
                pr.product_code,
                pr.description,
                pf.family_code,
                pf.family_name_zh,
                b.brand_id,
                b.brand_name,
                b.brand_code,
                ps.quote_count,
                ps.avg_unit_price,
                ps.min_unit_price,
                ps.max_unit_price,
                ps.p25_unit_price,
                ps.p75_unit_price,
                ps.stddev_unit_price,
                ps.latest_quote_date,
                ps.uom,
                COALESCE(
                    (SELECT jsonb_agg(row_data ORDER BY row_data->>'vendor_name')
                     FROM (
                         SELECT jsonb_build_object(
                             'vendor_id',   v.vendor_id,
                             'vendor_name', v.vendor_name,
                             'avg_price',   ROUND(AVG(ql2.unit_price)::numeric, 2),
                             'quote_count', COUNT(ql2.line_id),
                             'last_quoted', MAX(p2.bid_date)
                         ) AS row_data
                         FROM proc.quote_lines ql2
                         JOIN proc.vendors  v  ON v.vendor_id  = ql2.vendor_id
                         JOIN proc.projects p2 ON p2.project_id = ql2.project_id
                         WHERE ql2.product_id = pr.product_id
                         GROUP BY v.vendor_id, v.vendor_name
                     ) sub
                    ),
                    '[]'::jsonb
                ) AS vendors,
                COALESCE(
                    (SELECT jsonb_object_agg(pa.attr_key, pa.attr_value)
                     FROM proc.product_attributes pa
                     WHERE pa.product_id = pr.product_id),
                    '{{}}'::jsonb
                ) AS attributes
            FROM proc.products pr
            JOIN proc.product_families pf ON pf.family_id = pr.family_id
            LEFT JOIN proc.brands b  ON b.brand_id  = pr.brand_id
            LEFT JOIN proc.mv_product_price_stats ps ON ps.product_id = pr.product_id
            WHERE {where_clause}
            ORDER BY {order_by}
            LIMIT %s OFFSET %s
            """,
            sql_params + [page_size, offset],
        )
        rows = cur.fetchall()

        data = []
        for r in rows:
            d = dict(r)
            d["product_id"] = str(d["product_id"]) if d["product_id"] else None
            d["brand_id"]   = str(d["brand_id"])   if d["brand_id"]   else None
            data.append(d)

        cur.close()
        pages = (total + page_size - 1) // page_size if total else 0
        return {
            "data": data,
            "meta": {
                "count":     len(data),
                "total":     total,
                "page":      page,
                "page_size": page_size,
                "pages":     pages,
            },
        }
    finally:
        pool.putconn(conn)


# ---------------------------------------------------------------------------
# GET /products/brands?family_code=
# ---------------------------------------------------------------------------
@router.get("/brands")
def get_brands(request: Request, family_code: str = ""):
    pool = request.app.state.pool
    conn = pool.getconn()
    try:
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        if family_code:
            cur.execute(
                """
                SELECT b.brand_id, b.brand_code, b.brand_name, b.brand_name_en,
                       COUNT(pr.product_id) AS product_count
                FROM proc.brands b
                JOIN proc.products pr ON pr.brand_id = b.brand_id
                JOIN proc.product_families pf ON pf.family_id = pr.family_id
                WHERE pf.family_code = %s
                GROUP BY b.brand_id, b.brand_code, b.brand_name, b.brand_name_en
                ORDER BY b.brand_name
                """,
                (family_code,),
            )
        else:
            cur.execute(
                """
                SELECT b.brand_id, b.brand_code, b.brand_name, b.brand_name_en,
                       COUNT(pr.product_id) AS product_count
                FROM proc.brands b
                LEFT JOIN proc.products pr ON pr.brand_id = b.brand_id
                GROUP BY b.brand_id, b.brand_code, b.brand_name, b.brand_name_en
                ORDER BY b.brand_name
                """
            )
        rows = cur.fetchall()
        cur.close()
        return {"data": [dict(r) for r in rows], "meta": {"count": len(rows)}}
    finally:
        pool.putconn(conn)


# ---------------------------------------------------------------------------
# GET /products/unmatched
# ---------------------------------------------------------------------------
@router.get("/unmatched")
def get_unmatched(request: Request):
    pool = request.app.state.pool
    conn = pool.getconn()
    try:
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute(
            """
            SELECT line_id, discipline, description, uom, unit_price
            FROM proc.quote_lines
            WHERE product_id IS NULL
            ORDER BY created_at DESC
            LIMIT 50
            """
        )
        rows = cur.fetchall()
        cur.close()
        return {"data": [dict(r) for r in rows], "meta": {"count": len(rows)}}
    finally:
        pool.putconn(conn)


# ---------------------------------------------------------------------------
# PATCH /products/assign
# ---------------------------------------------------------------------------
class AssignBody(BaseModel):
    line_id: str
    product_id: str


@router.patch("/assign")
def assign_product(body: AssignBody, request: Request):
    pool = request.app.state.pool
    conn = pool.getconn()
    try:
        cur = conn.cursor()
        cur.execute(
            "UPDATE proc.quote_lines SET product_id = %s WHERE line_id = %s",
            (body.product_id, body.line_id),
        )
        if cur.rowcount == 0:
            conn.rollback()
            raise HTTPException(status_code=404, detail="line_id not found")
        cur.execute(
            "REFRESH MATERIALIZED VIEW CONCURRENTLY proc.mv_product_price_stats"
        )
        conn.commit()
        cur.close()
        return {"data": {"line_id": body.line_id, "product_id": body.product_id}, "meta": {}}
    except HTTPException:
        raise
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        pool.putconn(conn)


# ---------------------------------------------------------------------------
# POST /products/match-legacy
# ---------------------------------------------------------------------------
class MatchLegacyBody(BaseModel):
    description: str
    family_code: str | None = None


@router.post("/match-legacy")
def match_legacy(body: MatchLegacyBody, request: Request):
    pool = request.app.state.pool
    conn = pool.getconn()
    try:
        cur = conn.cursor()
        product_id, confidence = _match_product(cur, body.description, body.family_code)
        cur.close()
        return {"data": {"product_id": product_id, "confidence": confidence}, "meta": {}}
    finally:
        pool.putconn(conn)
