"""
POST /ingest/upload — CSV / XLSX ingestion pipeline
  1. Parse file with pandas
  2. Batch-insert all rows to stg.raw_quote_lines
  3. Normalize + validate each staging row
  4. Upsert valid rows to proc.quote_lines (via proc.projects + proc.vendors)
  5. Update parse_status = OK | EXCEPTION in staging
  6. Return summary
"""

import io
import uuid
from datetime import datetime, timezone
from typing import Any

import pandas as pd
import psycopg2.extras
from fastapi import APIRouter, Depends, Request, UploadFile, File, HTTPException

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


@router.post("/upload")
async def upload_file(request: Request, file: UploadFile = File(...), _: dict = Depends(require_admin)):
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
            # Try UTF-8 with BOM first (Excel export), fall back to UTF-8, then Big5
            for enc in ("utf-8-sig", "utf-8", "big5", "cp950"):
                try:
                    df = pd.read_csv(io.BytesIO(content), dtype=str,
                                     keep_default_na=False, encoding=enc)
                    break
                except (UnicodeDecodeError, Exception):
                    continue
            else:
                raise ValueError("Could not decode CSV — try saving as UTF-8 in Excel")
        else:
            # Read ALL sheets, normalize headers on each, concatenate
            sheet_map = pd.read_excel(
                io.BytesIO(content), dtype=str, keep_default_na=False,
                sheet_name=None,  # returns {sheet_name: DataFrame}
            )
            frames = []
            for sheet_name, sheet_df in sheet_map.items():
                if sheet_df.empty:
                    continue
                sheet_df = _normalize_headers(sheet_df)
                # Skip sheets that have no recognisable columns at all
                if not any(c in sheet_df.columns for c in
                           ("description", "unit_price", "discipline")):
                    continue
                sheet_df["_sheet"] = sheet_name
                frames.append(sheet_df)
            if not frames:
                raise ValueError("No sheets with recognisable MEP columns found")
            df = pd.concat(frames, ignore_index=True)
            df = df.drop(columns=["_sheet"], errors="ignore")
    except Exception as e:
        raise HTTPException(status_code=422, detail=f"Failed to parse file: {e}")

    # XLSX path already normalizes headers per-sheet; CSV path still needs it
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
        # Step 4: Validate & normalize each row
        # ------------------------------------------------------------------
        ok_rows: list[dict] = []
        exception_updates: list[tuple] = []  # (parse_notes, raw_id)
        ok_updates: list[tuple] = []
        exceptions_detail: list[dict] = []

        for i, stg_row in enumerate(stg_data):
            r = dict(zip(stg_cols, stg_row))
            raw_id = r["raw_id"]
            row_num = i + 2  # 1-based + header row
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

            # Discipline: uppercase, must be in valid set
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
            else:
                ok_updates.append(raw_id)
                ok_rows.append({
                    "project_code": (r.get("project_code") or "UNKNOWN").strip(),
                    "vendor_code": (r.get("vendor_code") or "").strip() or None,
                    "discipline": discipline,
                    "item_code": (r.get("item_code") or "").strip(),  # default '' not NULL
                    "description": r["description"],
                    "uom": canonical_uom,
                    "qty": qty,
                    "unit_price": unit_price,
                    "currency": (r.get("currency") or "TWD").strip(),
                    "source_file": filename,
                    "import_batch": import_batch,
                })

        # ------------------------------------------------------------------
        # Step 5: Batch-update parse_status in staging
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

        if ok_updates:
            psycopg2.extras.execute_values(
                cur,
                """
                UPDATE stg.raw_quote_lines
                SET parse_status = 'OK'
                WHERE raw_id IN (SELECT v::uuid FROM (VALUES %s) v(v))
                """,
                [(str(rid),) for rid in ok_updates],
            )

        conn.commit()

        # ------------------------------------------------------------------
        # Step 6: Upsert valid rows into proc.* tables
        # ------------------------------------------------------------------
        rows_matched_product = 0
        rows_needs_review = 0
        if ok_rows:
            # Collect unique project_codes and vendor_codes
            project_codes = list({r["project_code"] for r in ok_rows})
            vendor_codes = list({r["vendor_code"] for r in ok_rows if r["vendor_code"]})

            # Upsert projects (create with minimal info if not exists)
            psycopg2.extras.execute_values(
                cur,
                """
                INSERT INTO proc.projects (project_code, project_name)
                VALUES %s
                ON CONFLICT (project_code) DO NOTHING
                """,
                [(pc, pc) for pc in project_codes],
            )

            # Upsert vendors
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

            # Fetch project_id and vendor_id maps
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

            # Build quote_lines insert batch
            ql_rows = []
            for r in ok_rows:
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
                ))

            if ql_rows:
                psycopg2.extras.execute_values(
                    cur,
                    """
                    INSERT INTO proc.quote_lines
                        (project_id, vendor_id, discipline, item_code, description,
                         uom, qty, unit_price, currency, source_file, import_batch)
                    VALUES %s
                    ON CONFLICT (project_id, discipline, item_code, description, COALESCE(vendor_id, '00000000-0000-0000-0000-000000000000'::uuid))
                    DO UPDATE SET
                        uom          = EXCLUDED.uom,
                        qty          = EXCLUDED.qty,
                        unit_price   = EXCLUDED.unit_price,
                        currency     = EXCLUDED.currency,
                        source_file  = EXCLUDED.source_file,
                        import_batch = EXCLUDED.import_batch
                    """,
                    ql_rows,
                    page_size=500,
                )

            # ------------------------------------------------------------------
            # Product matching pass: match unlinked lines from this batch
            # ------------------------------------------------------------------
            cur.execute(
                """
                SELECT ql.line_id, ql.description
                FROM proc.quote_lines ql
                WHERE ql.import_batch = %s
                  AND ql.product_id IS NULL
                """,
                (import_batch,),
            )
            unmatched_lines = cur.fetchall()

            matched_updates: list[tuple] = []  # (product_id, line_id)
            needs_review_ids: list[str] = []

            for line_id, desc in unmatched_lines:
                product_id, confidence = _match_product(cur, desc)
                if confidence > 0.8 and product_id:
                    matched_updates.append((product_id, str(line_id)))
                elif confidence > 0 and product_id:
                    # Mark staging row as NEEDS_REVIEW
                    cur.execute(
                        """
                        UPDATE stg.raw_quote_lines
                        SET parse_status = 'NEEDS_REVIEW',
                            parse_notes  = %s
                        WHERE import_batch = %s
                          AND description = %s
                          AND parse_status = 'OK'
                        """,
                        (
                            f"Possible match product_id={product_id} confidence={confidence:.2f}",
                            import_batch,
                            desc,
                        ),
                    )
                    needs_review_ids.append(str(line_id))

            rows_matched_product = 0
            if matched_updates:
                psycopg2.extras.execute_values(
                    cur,
                    """
                    UPDATE proc.quote_lines AS ql
                    SET product_id = v.product_id::uuid
                    FROM (VALUES %s) AS v(product_id, line_id)
                    WHERE ql.line_id = v.line_id::uuid
                    """,
                    matched_updates,
                    page_size=500,
                )
                rows_matched_product = len(matched_updates)

            rows_needs_review = len(needs_review_ids)

            # Refresh both materialized views
            cur.execute("REFRESH MATERIALIZED VIEW proc.mv_price_stats")
            cur.execute("REFRESH MATERIALIZED VIEW proc.mv_product_price_stats")

        conn.commit()
        cur.close()

        return {
            "rows_loaded": rows_loaded,
            "rows_ok": len(ok_rows),
            "rows_exception": len(exceptions_detail),
            "rows_needs_review": rows_needs_review,
            "rows_matched_product": rows_matched_product,
            "exceptions": exceptions_detail,
        }

    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        pool.putconn(conn)
