-- =============================================================
-- MEP Ops — Views & Materialized Views
-- db/03_views.sql
-- Run order: 3 of 3
-- =============================================================

\echo '>>> Creating materialized view proc.mv_price_stats...'
CREATE MATERIALIZED VIEW IF NOT EXISTS proc.mv_price_stats AS
SELECT
    ql.discipline,
    ql.item_code,
    ql.description,
    ql.uom,
    COUNT(*)                                                          AS quote_count,
    ROUND(AVG(ql.unit_price), 2)                                      AS avg_unit_price,
    MIN(ql.unit_price)                                                AS min_unit_price,
    MAX(ql.unit_price)                                                AS max_unit_price,
    ROUND(STDDEV(ql.unit_price)::numeric, 2)                                          AS stddev_unit_price,
    ROUND((PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY ql.unit_price))::numeric, 2) AS p25_unit_price,
    ROUND((PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY ql.unit_price))::numeric, 2) AS p75_unit_price,
    MAX(p.bid_date)                                                   AS latest_quote_date
FROM proc.quote_lines ql
JOIN proc.projects p ON p.project_id = ql.project_id
WHERE ql.confidence >= 0.7
GROUP BY ql.discipline, ql.item_code, ql.description, ql.uom;

-- Unique index required for REFRESH MATERIALIZED VIEW CONCURRENTLY
CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_price_stats_key
    ON proc.mv_price_stats (discipline, COALESCE(item_code, ''), description, uom);

\echo '>>> Creating view proc.vw_quick_search...'
-- Wraps mv_price_stats and adds price_spread_pct column
-- price_spread_pct = (max - min) / avg * 100, rounded to 1 decimal
CREATE OR REPLACE VIEW proc.vw_quick_search AS
SELECT
    discipline,
    item_code,
    description,
    uom,
    quote_count,
    avg_unit_price,
    min_unit_price,
    max_unit_price,
    stddev_unit_price,
    p25_unit_price,
    p75_unit_price,
    latest_quote_date,
    CASE
        WHEN avg_unit_price > 0
        THEN ROUND((max_unit_price - min_unit_price) / avg_unit_price * 100, 1)
        ELSE 0
    END AS price_spread_pct
FROM proc.mv_price_stats;

\echo '>>> Creating view proc.vw_vendor_comparison...'
CREATE OR REPLACE VIEW proc.vw_vendor_comparison AS
SELECT
    v.vendor_name,
    v.vendor_code,
    ql.discipline,
    ql.description,
    ROUND(AVG(ql.unit_price), 2)  AS avg_unit_price,
    MIN(ql.unit_price)            AS min_unit_price,
    MAX(ql.unit_price)            AS max_unit_price,
    COUNT(*)                      AS quote_count,
    MAX(p.bid_date)               AS last_quoted
FROM proc.quote_lines ql
JOIN proc.vendors v  ON v.vendor_id  = ql.vendor_id
JOIN proc.projects p ON p.project_id = ql.project_id
WHERE ql.confidence >= 0.7
GROUP BY v.vendor_name, v.vendor_code, ql.discipline, ql.description;

\echo '>>> Views created. Refreshing mv_price_stats...'
-- Initial populate (will be empty until data is ingested — that is expected)
REFRESH MATERIALIZED VIEW proc.mv_price_stats;

\echo '>>> Views complete.'
-- END OF FILE
