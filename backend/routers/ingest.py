"""
POST /ingest/upload  — CSV / XLSX ingestion pipeline with attribute extraction
  1. Parse file with pandas
  2. Batch-insert all rows to stg.raw_quote_lines
  3. Validate + normalize each staging row
  4. Detect product family, extract JSONB attributes, compute confidence
  5. Route by confidence:
       >= 0.8  → upsert to proc.quote_lines (match_status AUTO | AUTO_CREATED)
       0.5–0.8 → stg only, parse_status=NEEDS_REVIEW
       < 0.5   → stg only, parse_status=EXCEPTION
  6. Refresh materialized views
  7. Return 5-bucket summary

GET  /ingest/review  — paginated NEEDS_REVIEW staging rows (admin only)
POST /ingest/resolve — promote a NEEDS_REVIEW row to proc with confirmed product_id (admin only)
"""

import io
import json
import re
import uuid
from datetime import datetime, timezone
from typing import Any

import pandas as pd
import psycopg2.extras
from fastapi import APIRouter, Depends, Request, UploadFile, File, HTTPException
from pydantic import BaseModel

from auth_utils import require_admin

from routers.products import _match_product

router = APIRouter()

# ---------------------------------------------------------------------------
# Column alias map — tolerates both English and Traditional Chinese headers
# ---------------------------------------------------------------------------
HEADER_ALIASES: dict[str, str] = {
    # English
    "project_code": "project_code",
    "project": "project_code",
    "vendor_code": "vendor_code",
    "vendor": "vendor_code",
    "discipline": "discipline",
    "item_code": "item_code",
    "item": "item_code",
    "description": "description",
    "desc": "description",
    "uom": "uom",
    "unit": "uom",
    "qty": "qty",
    "quantity": "qty",
    "unit_price": "unit_price",
    "price": "unit_price",
    "rate": "unit_price",
    "currency": "currency",
    # Traditional Chinese
    "專案代碼": "project_code",
    "專案": "project_code",
    "廠商代碼": "vendor_code",
    "廠商": "vendor_code",
    "類別": "discipline",
    "工種": "discipline",
    "料號": "item_code",
    "項目代碼": "item_code",
    "品名規格": "description",
    "品名": "description",
    "規格": "description",
    "單位": "uom",
    "數量": "qty",
    "單價": "unit_price",
    "報價": "unit_price",
    "幣別": "currency",
}

VALID_DISCIPLINES = {"ELEC", "HVAC", "PLUMB", "FIRE", "WEAK"}

# ---------------------------------------------------------------------------
# Family detection — keywords per family_code, order matters (most specific first)
# ---------------------------------------------------------------------------
# Maps family_code → list of lowercase keyword fragments
_FAMILY_KEYWORD_MAP: dict[str, list[str]] = {
    "CIRCUIT_BREAKER": ["breaker", "斷路器", "無熔絲", "mccb", "mcb", "nfb", "elcb", " nf "],
    "WIRE_CABLE":      ["wire", "cable", "電線", "電纜", "thhn", "thwn", "xlpe", "vv-", "cv "],
    "EMT_CONDUIT":     ["emt", "conduit", "電線管", " sc "],
    "HVAC_DUCT":       ["duct", "風管"],
    "GI_PIPE":         ["gi pipe", "white pipe", "白鐵管", "鍍鋅管", " dn"],
}

# Which disciplines map to which families (priority order)
_DISC_FAMILIES: dict[str, list[str]] = {
    "ELEC":  ["CIRCUIT_BREAKER", "WIRE_CABLE", "EMT_CONDUIT"],
    "HVAC":  ["HVAC_DUCT"],
    "PLUMB": ["GI_PIPE"],
    "FIRE":  [],  # no families defined → skip attribute check
    "WEAK":  [],
}

# ---------------------------------------------------------------------------
# Attribute extraction patterns per attr_key
# Each entry: list of compiled regex patterns; first group captured is the value
# ---------------------------------------------------------------------------
_ATTR_PATTERNS: dict[str, list[re.Pattern]] = {
    "diameter": [
        re.compile(r"(\d+/\d+)\s*(?:in|inch|\")", re.IGNORECASE),
        re.compile(r"[Øφ管徑]\s*(\d+(?:\.\d+)?)", re.IGNORECASE),
        re.compile(r"(\d+(?:\.\d+)?)\s*(?:吋|\")", re.IGNORECASE),
    ],
    "diameter_mm": [
        re.compile(r"\bDN\s*(\d+)\b", re.IGNORECASE),
        re.compile(r"[Øφ]\s*(\d+)\b"),
        re.compile(r"(\d+(?:\.\d+)?)\s*[Mm][Mm]\b"),
    ],
    "material": [
        re.compile(
            r"\b(EMT|PVC|GI|SS304|SS316|SS|304|316|HDPE|碳鋼|不銹鋼|鍍鋅|Galvanized)\b",
            re.IGNORECASE,
        ),
    ],
    "standard": [
        re.compile(r"(CNS\s*\d+|ASTM\s*\w+|IEC\s*\d+|JIS\s*\w+|BS\s*\d+)", re.IGNORECASE),
    ],
    "length_m": [
        re.compile(r"(\d+(?:\.\d+)?)\s*[Mm](?:eter|étres?)?\b(?!\s*[Mm])"),
    ],
    "conductor_size": [
        re.compile(r"(\d+(?:\.\d+)?)\s*(?:mm²|mm2|sqmm|sq\.?mm)", re.IGNORECASE),
        re.compile(r"\bAWG\s*(\d+)\b", re.IGNORECASE),
    ],
    "core_count": [
        re.compile(r"(\d+)\s*(?:C\b|core|芯)", re.IGNORECASE),
        re.compile(r"(\d+)[Cc]\b"),
    ],
    "insulation": [
        re.compile(r"\b(XLPE|PVC|EPR|THHN|THWN|LSZH|PE)\b", re.IGNORECASE),
    ],
    "voltage_rating": [
        re.compile(r"(\d+(?:\.\d+)?)\s*[Kk][Vv]\b"),
        re.compile(r"(\d+)\s*[Vv](?:\s|$|/|,)"),
    ],
    "poles": [
        re.compile(r"\b(\d)\s*[Pp](?:ole)?\b"),
        re.compile(r"\b(\d)P\b"),
    ],
    "amperage": [
        re.compile(r"(\d+(?:\.\d+)?)\s*[Aa](?:mp)?\b"),
    ],
    "breaking_capacity": [
        re.compile(r"(\d+(?:\.\d+)?)\s*[Kk][Aa]\b"),
        re.compile(r"\bIC\s*=?\s*(\d+)", re.IGNORECASE),
    ],
    "duct_type": [
        re.compile(r"\b(矩形|圓形|扁平|Rectangular|Round|Oval|Spiral)\b", re.IGNORECASE),
    ],
    "thickness_mm": [
        re.compile(r"[Tt]\s*=?\s*(\d+(?:\.\d+)?)\s*[Mm][Mm]"),
        re.compile(r"(\d+(?:\.\d+)?)\s*[Mm][Mm]\s*(?:厚|thick)", re.IGNORECASE),
    ],
    "schedule": [
        re.compile(r"\b(Sch(?:edule)?\.?\s*\d+|SCH\s*\d+)\b", re.IGNORECASE),
    ],
    "joint_type": [
        re.compile(r"\b(螺紋|焊接|溝槽|grooved?|threaded?|welded?|flanged?)\b", re.IGNORECASE),
    ],
}


def _detect_family(discipline: str, description: str) -> str | None:
    """Return family_code that best matches discipline + description keywords, or None."""
    candidates = _DISC_FAMILIES.get(discipline.upper(), [])
    desc_lower = description.lower()
    for family_code in candidates:
        for kw in _FAMILY_KEYWORD_MAP.get(family_code, []):
            if kw in desc_lower:
                return family_code
    # Fall back to first candidate for the discipline if any
    return candidates[0] if candidates else None


def _extract_attributes(description: str, attr_keys: list[str]) -> dict[str, str]:
    """Run regex patterns against description and return {attr_key: first_match}."""
    extracted: dict[str, str] = {}
    for key in attr_keys:
        patterns = _ATTR_PATTERNS.get(key, [])
        for pat in patterns:
            m = pat.search(description)
            if m:
                extracted[key] = m.group(1)
                break
    return extracted


def _compute_confidence(attr_keys: list[str], extracted: dict[str, str]) -> float:
    """
    confidence = extracted_count / total_attr_count.
    If no attrs defined for family, return 1.0 (can't penalise what we can't check).
    """
    if not attr_keys:
        return 1.0
    return round(len(extracted) / len(attr_keys), 2)


def _normalize_headers(df: pd.DataFrame) -> pd.DataFrame:
    """Rename dataframe columns using HEADER_ALIASES (case-insensitive for ASCII)."""
    rename_map = {}
    for col in df.columns:
        key = str(col).strip().lower()
        if key in HEADER_ALIASES:
            rename_map[col] = HEADER_ALIASES[key]
        elif str(col).strip() in HEADER_ALIASES:
            rename_map[col] = HEADER_ALIASES[str(col).strip()]
    return df.rename(columns=rename_map)


def _str(val: Any) -> str | None:
    if val is None or (isinstance(val, float) and pd.isna(val)):
        return None
    return str(val).strip() or None


# ---------------------------------------------------------------------------
# POST /ingest/upload
# ---------------------------------------------------------------------------
@router.post("/upload")
async def upload_file(
    request: Request,
    file: UploadFile = File(...),
    _: dict = Depends(require_admin),
):
    filename = file.filename or "unknown"
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""

    if ext not in ("csv", "xlsx"):
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file type '.{ext}'. Only CSV and XLSX are accepted.",
        )

    content = await file.read()
    try:
        if ext == "csv":
            for enc in ("utf-8-sig", "utf-8", "big5", "cp950"):
                try:
                    df = pd.read_csv(
                        io.BytesIO(content), dtype=str,
                        keep_default_na=False, encoding=enc,
                    )
                    break
                except (UnicodeDecodeError, Exception):
                    continue
            else:
                raise ValueError("Could not decode CSV — try saving as UTF-8 in Excel")
        else:
            sheet_map = pd.read_excel(
                io.BytesIO(content), dtype=str, keep_default_na=False, sheet_name=None,
            )
            frames = []
            for sheet_name, sheet_df in sheet_map.items():
                if sheet_df.empty:
                    continue
                sheet_df = _normalize_headers(sheet_df)
                if not any(c in sheet_df.columns for c in ("description", "unit_price", "discipline")):
                    continue
                sheet_df["_sheet"] = sheet_name
                frames.append(sheet_df)
            if not frames:
                raise ValueError("No sheets with recognisable MEP columns found")
            df = pd.concat(frames, ignore_index=True)
            df = df.drop(columns=["_sheet"], errors="ignore")
    except Exception as e:
        raise HTTPException(status_code=422, detail=f"Failed to parse file: {e}")

    if ext == "csv":
        df = _normalize_headers(df)
    df = df.where(df.notna(), None)

    import_batch = f"{filename}_{datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S')}"
    rows_loaded = len(df)

    pool = request.app.state.pool
    conn = pool.getconn()
    try:
        cur = conn.cursor()

        # ------------------------------------------------------------------
        # Step 1: Batch-insert ALL rows into stg.raw_quote_lines
        # ------------------------------------------------------------------
        stg_rows = []
        for _, row in df.iterrows():
            stg_rows.append((
                _str(row.get("project_code")),
                _str(row.get("vendor_code")),
                _str(row.get("discipline")),
                _str(row.get("item_code")),
                _str(row.get("description")),
                _str(row.get("uom")),
                _str(row.get("qty")),
                _str(row.get("unit_price")),
                _str(row.get("currency")),
                filename,
                import_batch,
            ))

        psycopg2.extras.execute_values(
            cur,
            """
            INSERT INTO stg.raw_quote_lines
                (project_code, vendor_code, discipline, item_code, description,
                 uom, qty, unit_price, currency, source_file, import_batch)
            VALUES %s
            """,
            stg_rows,
            page_size=500,
        )
        conn.commit()

        # ------------------------------------------------------------------
        # Step 2: Load UoM map for normalization
        # ------------------------------------------------------------------
        cur.execute("SELECT raw_uom, canonical_uom FROM proc.uom_map")
        uom_map: dict[str, str] = {r[0]: r[1] for r in cur.fetchall()}

        # ------------------------------------------------------------------
        # Step 3: Fetch just-inserted staging rows for this batch
        # ------------------------------------------------------------------
        cur.execute(
            """
            SELECT raw_id, project_code, vendor_code, discipline, item_code,
                   description, uom, qty, unit_price, currency
            FROM stg.raw_quote_lines
            WHERE import_batch = %s
            ORDER BY created_at
            """,
            (import_batch,),
        )
        stg_data = cur.fetchall()
        stg_cols = [d[0] for d in cur.description]

        # ------------------------------------------------------------------
        # Step 4: Load attribute_definitions keyed by family_code
        # ------------------------------------------------------------------
        cur.execute(
            """
            SELECT pf.family_code, ad.attr_key
            FROM proc.attribute_definitions ad
            JOIN proc.product_families pf ON pf.family_id = ad.family_id
            ORDER BY pf.family_code, ad.display_order
            """
        )
        family_attr_keys: dict[str, list[str]] = {}
        for fcode, akey in cur.fetchall():
            family_attr_keys.setdefault(fcode, []).append(akey)

        # Also load family_id map for auto-create
        cur.execute("SELECT family_code, family_id FROM proc.product_families")
        family_id_map: dict[str, str] = {r[0]: str(r[1]) for r in cur.fetchall()}

        # ------------------------------------------------------------------
        # Step 5: Validate, normalize, extract attributes, bucket by confidence
        # ------------------------------------------------------------------
        # Buckets
        auto_rows: list[dict] = []          # confidence >= 0.8 → proc
        needs_review_rows: list[dict] = []  # 0.5 <= conf < 0.8 → stg NEEDS_REVIEW
        exception_updates: list[tuple] = [] # (parse_notes, raw_id)
        exceptions_detail: list[dict] = []

        for i, stg_row in enumerate(stg_data):
            r = dict(zip(stg_cols, stg_row))
            raw_id = r["raw_id"]
            row_num = i + 2
            reasons = []

            # Required: description
            if not r.get("description"):
                reasons.append("Missing description")

            # Required: unit_price parseable as float
            unit_price = None
            if r.get("unit_price"):
                try:
                    unit_price = float(str(r["unit_price"]).replace(",", ""))
                    if unit_price < 0:
                        reasons.append("unit_price is negative")
                except ValueError:
                    reasons.append(f"Cannot parse unit_price: {r['unit_price']!r}")
            else:
                reasons.append("Missing unit_price")

            # qty is optional but must be numeric if present
            qty = None
            if r.get("qty"):
                try:
                    qty = float(str(r["qty"]).replace(",", ""))
                except ValueError:
                    reasons.append(f"Cannot parse qty: {r['qty']!r}")

            # Discipline
            discipline = (r.get("discipline") or "").strip().upper()
            if discipline not in VALID_DISCIPLINES:
                reasons.append(
                    f"Unknown discipline {discipline!r}. "
                    f"Must be one of {sorted(VALID_DISCIPLINES)}"
                )

            # Normalize UoM
            raw_uom = (r.get("uom") or "").strip()
            canonical_uom = uom_map.get(raw_uom, raw_uom) or raw_uom

            if reasons:
                exception_updates.append((" | ".join(reasons), raw_id))
                exceptions_detail.append({
                    "row_num": row_num,
                    "reason": " | ".join(reasons),
                    "raw_value": {
                        "description": r.get("description"),
                        "unit_price": r.get("unit_price"),
                        "discipline": r.get("discipline"),
                        "uom": r.get("uom"),
                    },
                })
                continue

            desc = r["description"]

            # Attribute extraction
            family_code = _detect_family(discipline, desc) if discipline in VALID_DISCIPLINES else None
            attr_keys = family_attr_keys.get(family_code, []) if family_code else []
            extracted_attrs = _extract_attributes(desc, attr_keys) if attr_keys else {}
            confidence = _compute_confidence(attr_keys, extracted_attrs)

            base = {
                "raw_id": raw_id,
                "project_code": (r.get("project_code") or "UNKNOWN").strip(),
                "vendor_code": (r.get("vendor_code") or "").strip() or None,
                "discipline": discipline,
                "item_code": (r.get("item_code") or "").strip(),
                "description": desc,
                "uom": canonical_uom,
                "qty": qty,
                "unit_price": unit_price,
                "currency": (r.get("currency") or "TWD").strip(),
                "source_file": filename,
                "import_batch": import_batch,
                "family_code": family_code,
                "attributes_raw": extracted_attrs,
                "confidence": confidence,
            }

            if confidence >= 0.8:
                auto_rows.append(base)
            elif confidence >= 0.5:
                needs_review_rows.append(base)
            else:
                exception_updates.append((
                    f"Low confidence ({confidence:.2f}): only {len(extracted_attrs)}/{len(attr_keys)} attributes extracted",
                    raw_id,
                ))
                exceptions_detail.append({
                    "row_num": row_num,
                    "reason": f"Low confidence {confidence:.2f}",
                    "raw_value": {"description": desc, "discipline": discipline},
                })

        # ------------------------------------------------------------------
        # Step 6: Batch-update parse_status + attributes_raw in staging
        # ------------------------------------------------------------------
        if exception_updates:
            psycopg2.extras.execute_values(
                cur,
                """
                UPDATE stg.raw_quote_lines AS s
                SET parse_status = 'EXCEPTION', parse_notes = v.notes
                FROM (VALUES %s) AS v(notes, raw_id)
                WHERE s.raw_id = v.raw_id::uuid
                """,
                exception_updates,
            )

        # Mark NEEDS_REVIEW rows in stg
        if needs_review_rows:
            psycopg2.extras.execute_values(
                cur,
                """
                UPDATE stg.raw_quote_lines AS s
                SET parse_status   = 'NEEDS_REVIEW',
                    parse_notes    = 'Confidence below 0.8 — awaiting admin review',
                    attributes_raw = v.attrs::jsonb
                FROM (VALUES %s) AS v(raw_id, attrs)
                WHERE s.raw_id = v.raw_id::uuid
                """,
                [(str(row["raw_id"]), json.dumps(row["attributes_raw"])) for row in needs_review_rows],
            )

        # Mark AUTO rows as OK in stg and store attributes_raw
        if auto_rows:
            psycopg2.extras.execute_values(
                cur,
                """
                UPDATE stg.raw_quote_lines AS s
                SET parse_status   = 'OK',
                    attributes_raw = v.attrs::jsonb
                FROM (VALUES %s) AS v(raw_id, attrs)
                WHERE s.raw_id = v.raw_id::uuid
                """,
                [(str(row["raw_id"]), json.dumps(row["attributes_raw"])) for row in auto_rows],
            )

        conn.commit()

        # ------------------------------------------------------------------
        # Step 7: Upsert AUTO rows into proc.*
        # ------------------------------------------------------------------
        rows_auto_created = 0

        if auto_rows:
            project_codes = list({r["project_code"] for r in auto_rows})
            vendor_codes = list({r["vendor_code"] for r in auto_rows if r["vendor_code"]})

            psycopg2.extras.execute_values(
                cur,
                """
                INSERT INTO proc.projects (project_code, project_name)
                VALUES %s
                ON CONFLICT (project_code) DO NOTHING
                """,
                [(pc, pc) for pc in project_codes],
            )

            if vendor_codes:
                psycopg2.extras.execute_values(
                    cur,
                    """
                    INSERT INTO proc.vendors (vendor_code, vendor_name)
                    VALUES %s
                    ON CONFLICT (vendor_code) DO NOTHING
                    """,
                    [(vc, vc) for vc in vendor_codes],
                )

            cur.execute(
                "SELECT project_code, project_id FROM proc.projects WHERE project_code = ANY(%s)",
                (project_codes,),
            )
            project_id_map: dict[str, str] = {r[0]: r[1] for r in cur.fetchall()}

            vendor_id_map: dict[str, str] = {}
            if vendor_codes:
                cur.execute(
                    "SELECT vendor_code, vendor_id FROM proc.vendors WHERE vendor_code = ANY(%s)",
                    (vendor_codes,),
                )
                vendor_id_map = {r[0]: r[1] for r in cur.fetchall()}

            # Build and upsert quote_lines rows
            ql_rows = []
            for r in auto_rows:
                project_id = project_id_map.get(r["project_code"])
                vendor_id = vendor_id_map.get(r["vendor_code"]) if r["vendor_code"] else None
                if not project_id:
                    continue
                ql_rows.append((
                    project_id,
                    vendor_id,
                    r["discipline"],
                    r["item_code"],
                    r["description"],
                    r["uom"],
                    r["qty"],
                    r["unit_price"],
                    r["currency"],
                    r["source_file"],
                    r["import_batch"],
                    r["confidence"],
                ))

            if ql_rows:
                psycopg2.extras.execute_values(
                    cur,
                    """
                    INSERT INTO proc.quote_lines
                        (project_id, vendor_id, discipline, item_code, description,
                         uom, qty, unit_price, currency, source_file, import_batch, confidence)
                    VALUES %s
                    ON CONFLICT (project_id, discipline, item_code, description,
                                 COALESCE(vendor_id, '00000000-0000-0000-0000-000000000000'::uuid))
                    DO UPDATE SET
                        uom          = EXCLUDED.uom,
                        qty          = EXCLUDED.qty,
                        unit_price   = EXCLUDED.unit_price,
                        currency     = EXCLUDED.currency,
                        source_file  = EXCLUDED.source_file,
                        import_batch = EXCLUDED.import_batch,
                        confidence   = EXCLUDED.confidence
                    """,
                    ql_rows,
                    page_size=500,
                )

            # ------------------------------------------------------------------
            # Step 8: Product matching + auto-create
            # ------------------------------------------------------------------
            cur.execute(
                """
                SELECT ql.line_id, ql.description, ql.discipline
                FROM proc.quote_lines ql
                WHERE ql.import_batch = %s
                  AND ql.product_id IS NULL
                """,
                (import_batch,),
            )
            unmatched = cur.fetchall()

            matched_updates: list[tuple] = []   # (product_id, match_status, line_id)
            auto_created_ids: list[str] = []

            for line_id, desc, disc in unmatched:
                product_id, conf = _match_product(cur, desc)

                if product_id and conf >= 0.8:
                    matched_updates.append((str(product_id), "AUTO", str(line_id)))
                    continue

                # Auto-create product when family is detectable
                fcode = _detect_family(disc, desc)
                if not fcode or fcode not in family_id_map:
                    # No family → link to nothing, leave match_status as AUTO
                    matched_updates.append((None, "AUTO", str(line_id)))
                    continue

                fid = family_id_map[fcode]
                attr_keys = family_attr_keys.get(fcode, [])
                attrs = _extract_attributes(desc, attr_keys)

                # Generate product_code: {DISC[0]}-{FCODE}-{SEQ:04d}
                disc_prefix = disc[0]
                cur.execute(
                    """
                    SELECT COUNT(*) FROM proc.products pr
                    JOIN proc.product_families pf ON pf.family_id = pr.family_id
                    WHERE pf.family_code = %s
                    """,
                    (fcode,),
                )
                seq = (cur.fetchone()[0] or 0) + 1
                product_code = f"{disc_prefix}-{fcode}-{seq:04d}"

                # Ensure unique product_code
                cur.execute(
                    "SELECT 1 FROM proc.products WHERE product_code = %s", (product_code,)
                )
                if cur.fetchone():
                    product_code = f"{disc_prefix}-{fcode}-{seq:04d}-{uuid.uuid4().hex[:4].upper()}"

                cur.execute(
                    """
                    INSERT INTO proc.products (family_id, product_code, description, attributes)
                    VALUES (%s, %s, %s, %s)
                    RETURNING product_id
                    """,
                    (fid, product_code, desc[:500], json.dumps(attrs)),
                )
                new_product_id = str(cur.fetchone()[0])
                matched_updates.append((new_product_id, "AUTO_CREATED", str(line_id)))
                auto_created_ids.append(new_product_id)

            rows_auto_created = len(auto_created_ids)

            if matched_updates:
                # Separate None product_id rows (no-family pass-through)
                with_product = [(pid, ms, lid) for pid, ms, lid in matched_updates if pid is not None]
                without_product = [(ms, lid) for pid, ms, lid in matched_updates if pid is None]

                if with_product:
                    psycopg2.extras.execute_values(
                        cur,
                        """
                        UPDATE proc.quote_lines AS ql
                        SET product_id   = v.product_id::uuid,
                            match_status = v.match_status
                        FROM (VALUES %s) AS v(product_id, match_status, line_id)
                        WHERE ql.line_id = v.line_id::uuid
                        """,
                        with_product,
                        page_size=500,
                    )

                if without_product:
                    psycopg2.extras.execute_values(
                        cur,
                        """
                        UPDATE proc.quote_lines AS ql
                        SET match_status = v.match_status
                        FROM (VALUES %s) AS v(match_status, line_id)
                        WHERE ql.line_id = v.line_id::uuid
                        """,
                        without_product,
                        page_size=500,
                    )

            # Refresh materialized views
            cur.execute("REFRESH MATERIALIZED VIEW proc.mv_price_stats")
            cur.execute("REFRESH MATERIALIZED VIEW proc.mv_product_price_stats")

        conn.commit()
        cur.close()

        return {
            "data": {
                "rows_loaded": rows_loaded,
                "rows_ok": len(auto_rows),
                "rows_auto_created": rows_auto_created,
                "rows_needs_review": len(needs_review_rows),
                "rows_exception": len(exceptions_detail),
                "exceptions": exceptions_detail,
            },
            "meta": {"count": rows_loaded},
        }

    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        pool.putconn(conn)


# ---------------------------------------------------------------------------
# GET /ingest/review — paginated NEEDS_REVIEW rows (admin only)
# ---------------------------------------------------------------------------
@router.get("/review")
def get_review(
    request: Request,
    limit: int = 50,
    offset: int = 0,
    _: dict = Depends(require_admin),
):
    pool = request.app.state.pool
    conn = pool.getconn()
    try:
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

        cur.execute(
            """
            SELECT raw_id, project_code, vendor_code, discipline, item_code,
                   description, uom, qty, unit_price, currency,
                   parse_status, parse_notes, attributes_raw,
                   source_file, import_batch, created_at
            FROM stg.raw_quote_lines
            WHERE parse_status = 'NEEDS_REVIEW'
            ORDER BY created_at DESC
            LIMIT %s OFFSET %s
            """,
            (limit, offset),
        )
        rows = cur.fetchall()

        cur.execute(
            "SELECT COUNT(*) FROM stg.raw_quote_lines WHERE parse_status = 'NEEDS_REVIEW'"
        )
        total = cur.fetchone()["count"]
        cur.close()

        return {
            "data": [dict(r) for r in rows],
            "meta": {
                "count": len(rows),
                "total": total,
                "limit": limit,
                "offset": offset,
            },
        }
    finally:
        pool.putconn(conn)


# ---------------------------------------------------------------------------
# POST /ingest/resolve — promote a NEEDS_REVIEW stg row to proc (admin only)
# ---------------------------------------------------------------------------
class ResolveBody(BaseModel):
    raw_id: str
    product_id: str
    attributes: dict = {}


@router.post("/resolve")
def resolve_row(
    body: ResolveBody,
    request: Request,
    _: dict = Depends(require_admin),
):
    pool = request.app.state.pool
    conn = pool.getconn()
    try:
        cur = conn.cursor()

        # Fetch the stg row
        cur.execute(
            """
            SELECT raw_id, project_code, vendor_code, discipline, item_code,
                   description, uom, qty, unit_price, currency,
                   source_file, import_batch, parse_status
            FROM stg.raw_quote_lines
            WHERE raw_id = %s
            """,
            (body.raw_id,),
        )
        row = cur.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail=f"raw_id {body.raw_id} not found")

        cols = [d[0] for d in cur.description]
        stg = dict(zip(cols, row))

        if stg["parse_status"] not in ("NEEDS_REVIEW", "OK"):
            raise HTTPException(
                status_code=409,
                detail=f"Row parse_status is '{stg['parse_status']}' — only NEEDS_REVIEW or OK rows can be resolved",
            )

        # Validate product_id exists
        cur.execute(
            "SELECT product_id FROM proc.products WHERE product_id = %s", (body.product_id,)
        )
        if not cur.fetchone():
            raise HTTPException(status_code=404, detail=f"product_id {body.product_id} not found")

        # Parse numeric fields
        unit_price = float(str(stg["unit_price"]).replace(",", "")) if stg["unit_price"] else None
        qty = float(str(stg["qty"]).replace(",", "")) if stg["qty"] else None
        if unit_price is None:
            raise HTTPException(status_code=422, detail="Staging row has no unit_price")

        # Load UoM map
        cur.execute("SELECT raw_uom, canonical_uom FROM proc.uom_map")
        uom_map = {r[0]: r[1] for r in cur.fetchall()}
        raw_uom = (stg["uom"] or "").strip()
        canonical_uom = uom_map.get(raw_uom, raw_uom) or raw_uom

        # Ensure project exists
        project_code = (stg["project_code"] or "UNKNOWN").strip()
        cur.execute(
            """
            INSERT INTO proc.projects (project_code, project_name)
            VALUES (%s, %s)
            ON CONFLICT (project_code) DO NOTHING
            """,
            (project_code, project_code),
        )

        cur.execute(
            "SELECT project_id FROM proc.projects WHERE project_code = %s", (project_code,)
        )
        project_id = cur.fetchone()[0]

        # Ensure vendor exists
        vendor_id = None
        if stg["vendor_code"]:
            vc = stg["vendor_code"].strip()
            cur.execute(
                """
                INSERT INTO proc.vendors (vendor_code, vendor_name)
                VALUES (%s, %s)
                ON CONFLICT (vendor_code) DO NOTHING
                """,
                (vc, vc),
            )
            cur.execute(
                "SELECT vendor_id FROM proc.vendors WHERE vendor_code = %s", (vc,)
            )
            vendor_id = cur.fetchone()[0]

        # Upsert into proc.quote_lines with match_status=MANUAL
        cur.execute(
            """
            INSERT INTO proc.quote_lines
                (project_id, vendor_id, discipline, item_code, description,
                 uom, qty, unit_price, currency, source_file, import_batch,
                 confidence, product_id, match_status)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, 1.0, %s, 'MANUAL')
            ON CONFLICT (project_id, discipline, item_code, description,
                         COALESCE(vendor_id, '00000000-0000-0000-0000-000000000000'::uuid))
            DO UPDATE SET
                product_id   = EXCLUDED.product_id,
                match_status = 'MANUAL',
                confidence   = 1.0,
                uom          = EXCLUDED.uom,
                qty          = EXCLUDED.qty,
                unit_price   = EXCLUDED.unit_price,
                currency     = EXCLUDED.currency
            RETURNING line_id
            """,
            (
                project_id, vendor_id,
                (stg["discipline"] or "").strip().upper(),
                (stg["item_code"] or "").strip(),
                stg["description"],
                canonical_uom,
                qty,
                unit_price,
                (stg["currency"] or "TWD").strip(),
                stg["source_file"],
                stg["import_batch"],
                body.product_id,
            ),
        )
        line_id = str(cur.fetchone()[0])

        # Update proc.products.attributes if admin provided overrides
        if body.attributes:
            cur.execute(
                """
                UPDATE proc.products
                SET attributes = attributes || %s::jsonb
                WHERE product_id = %s
                """,
                (json.dumps(body.attributes), body.product_id),
            )

        # Mark stg row as resolved
        cur.execute(
            """
            UPDATE stg.raw_quote_lines
            SET parse_status   = 'OK',
                parse_notes    = 'Manually resolved by admin',
                attributes_raw = attributes_raw || %s::jsonb
            WHERE raw_id = %s
            """,
            (json.dumps(body.attributes), body.raw_id),
        )

        # Refresh materialized views
        cur.execute("REFRESH MATERIALIZED VIEW proc.mv_price_stats")
        cur.execute("REFRESH MATERIALIZED VIEW proc.mv_product_price_stats")

        conn.commit()
        cur.close()

        return {
            "data": {
                "line_id": line_id,
                "product_id": body.product_id,
                "match_status": "MANUAL",
                "message": "Row resolved and promoted to proc.quote_lines",
            },
            "meta": {},
        }

    except HTTPException:
        conn.rollback()
        raise
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        pool.putconn(conn)
