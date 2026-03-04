#!/usr/bin/env python3
"""
MEP Pricing DB Validation — 6 acceptance tests
Usage:  python tests/validate.py
Exit:   0 if all pass, 1 if any fail (CI-compatible)
"""

import os
import sys

import psycopg2
from dotenv import load_dotenv

load_dotenv()


def get_conn():
    return psycopg2.connect(
        host=os.getenv("DB_HOST", "localhost"),
        port=int(os.getenv("DB_PORT", 5432)),
        dbname=os.getenv("DB_NAME"),
        user=os.getenv("DB_USER"),
        password=os.getenv("DB_PASSWORD"),
    )


print("=== MEP Pricing DB Validation ===")
print()

try:
    conn = get_conn()
except Exception as e:
    print(f"[FATAL] Cannot connect to database: {e}")
    sys.exit(1)

cur = conn.cursor()
results: list[bool] = []


def record(passed: bool, name: str, msg: str) -> None:
    status = "PASS" if passed else "FAIL"
    results.append(passed)
    print(f"[{status}] {name}: {msg}")


# ---------------------------------------------------------------------------
# Test 1: Row Count Reconciliation
# stg rows with parse_status = 'OK' must equal proc.quote_lines rows
# for each import_batch.
# ---------------------------------------------------------------------------
try:
    cur.execute(
        """
        SELECT
            s.import_batch,
            COUNT(*) FILTER (WHERE s.parse_status = 'OK')        AS stg_ok,
            COUNT(q.line_id)                                      AS proc_count
        FROM stg.raw_quote_lines s
        LEFT JOIN proc.quote_lines q
               ON q.import_batch = s.import_batch
        GROUP BY s.import_batch
        HAVING COUNT(*) FILTER (WHERE s.parse_status = 'OK')
            != COUNT(q.line_id)
        """
    )
    mismatches = cur.fetchall()
    if not mismatches:
        cur.execute("SELECT COUNT(*) FROM proc.quote_lines")
        total = cur.fetchone()[0]
        record(True, "Row count reconciliation",
               f"{total} proc rows reconcile with stg OK rows")
    else:
        detail = "; ".join(
            f"batch={r[0]}: stg_ok={r[1]} proc={r[2]}"
            for r in mismatches[:3]
        )
        record(False, "Row count reconciliation",
               f"Mismatch in {len(mismatches)} batch(es): {detail}")
except Exception as e:
    record(False, "Row count reconciliation", f"ERROR: {e}")
    conn.rollback()

# ---------------------------------------------------------------------------
# Test 2: Amount Integrity
# amount must equal ROUND(qty * unit_price, 2) within 0.01 tolerance
# ---------------------------------------------------------------------------
try:
    cur.execute(
        """
        SELECT line_id, qty, unit_price, amount,
               ROUND(qty * unit_price, 2) AS expected
        FROM proc.quote_lines
        WHERE qty IS NOT NULL
          AND ABS(amount - ROUND(qty * unit_price, 2)) > 0.01
        LIMIT 5
        """
    )
    bad = cur.fetchall()
    if not bad:
        cur.execute(
            "SELECT COUNT(*) FROM proc.quote_lines WHERE qty IS NOT NULL"
        )
        total = cur.fetchone()[0]
        record(True, "Amount integrity",
               f"All {total} rows with qty have correct amount")
    else:
        for r in bad:
            print(f"       → line_id {r[0]}: expected {r[4]}, got {r[3]}")
        record(False, "Amount integrity",
               f"{len(bad)} rows with amount mismatch (showing up to 5)")
except Exception as e:
    record(False, "Amount integrity", f"ERROR: {e}")
    conn.rollback()

# ---------------------------------------------------------------------------
# Test 3: Required Fields
# No NULL in: description, unit_price, uom, discipline, project_id
# ---------------------------------------------------------------------------
try:
    required_cols = ["description", "unit_price", "uom", "discipline", "project_id"]
    nulls: dict[str, int] = {}
    for col in required_cols:
        cur.execute(f"SELECT COUNT(*) FROM proc.quote_lines WHERE {col} IS NULL")
        count = cur.fetchone()[0]
        if count > 0:
            nulls[col] = count
    if not nulls:
        record(True, "Required fields", "No NULLs found in required columns")
    else:
        detail = ", ".join(f"{k}={v}" for k, v in nulls.items())
        record(False, "Required fields", f"NULL counts: {detail}")
except Exception as e:
    record(False, "Required fields", f"ERROR: {e}")
    conn.rollback()

# ---------------------------------------------------------------------------
# Test 4: UoM Canonical Check
# All proc.quote_lines.uom must exist in proc.uom_map.canonical_uom
# ---------------------------------------------------------------------------
try:
    cur.execute(
        """
        SELECT ql.uom, COUNT(*) AS cnt
        FROM proc.quote_lines ql
        WHERE ql.uom NOT IN (SELECT canonical_uom FROM proc.uom_map)
        GROUP BY ql.uom
        ORDER BY cnt DESC
        """
    )
    unknown = cur.fetchall()
    if not unknown:
        cur.execute("SELECT COUNT(DISTINCT uom) FROM proc.quote_lines")
        distinct = cur.fetchone()[0]
        record(True, "UoM canonical check",
               f"All {distinct} distinct UoM values are canonical")
    else:
        detail = ", ".join(f"'{r[0]}'({r[1]})" for r in unknown[:5])
        record(False, "UoM canonical check",
               f"{len(unknown)} unknown UoM value(s): {detail}")
except Exception as e:
    record(False, "UoM canonical check", f"ERROR: {e}")
    conn.rollback()

# ---------------------------------------------------------------------------
# Test 5: Confidence Distribution
# At least 80% of proc.quote_lines rows must have confidence >= 0.7
# ---------------------------------------------------------------------------
try:
    cur.execute(
        """
        SELECT
            COUNT(*)                                        AS total,
            COUNT(*) FILTER (WHERE confidence >= 0.7)      AS above
        FROM proc.quote_lines
        """
    )
    row = cur.fetchone()
    total, above = row[0], row[1]
    if total == 0:
        record(True, "Confidence distribution",
               "No rows yet (vacuously passes)")
    else:
        pct = round(above / total * 100, 1)
        if pct >= 80:
            record(True, "Confidence distribution",
                   f"{pct}% >= 0.7 threshold ({above}/{total} rows)")
        else:
            record(False, "Confidence distribution",
                   f"Only {pct}% >= 0.7 ({above}/{total} rows) — below 80% threshold")
except Exception as e:
    record(False, "Confidence distribution", f"ERROR: {e}")
    conn.rollback()

# ---------------------------------------------------------------------------
# Test 6: mv_price_stats can be refreshed without error
# ---------------------------------------------------------------------------
try:
    cur.execute("REFRESH MATERIALIZED VIEW proc.mv_price_stats")
    conn.commit()
    cur.execute("SELECT COUNT(*) FROM proc.mv_price_stats")
    count = cur.fetchone()[0]
    record(True, "mv_price_stats refresh",
           f"Materialized view refreshed successfully ({count} rows)")
except Exception as e:
    conn.rollback()
    record(False, "mv_price_stats refresh", f"Refresh failed: {e}")

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------
cur.close()
conn.close()

passed = sum(results)
total = len(results)
print()
print(f"Result: {passed}/{total} PASSED")
print()

sys.exit(0 if passed == total else 1)
