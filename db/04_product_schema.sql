-- =============================================================
-- MEP Ops — Sprint 5: Structured Product Attributes
-- db/04_product_schema.sql
-- Run order: 4 of 4 (after 03_views.sql)
-- =============================================================

\echo '>>> Creating proc.brands...'
CREATE TABLE IF NOT EXISTS proc.brands (
    brand_id          UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    brand_code        TEXT          UNIQUE NOT NULL,
    brand_name        TEXT          NOT NULL,
    brand_name_en     TEXT,
    country_of_origin TEXT,
    notes             TEXT
);

\echo '>>> Creating proc.product_families...'
CREATE TABLE IF NOT EXISTS proc.product_families (
    family_id      UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    family_code    TEXT         UNIQUE NOT NULL,
    family_name_zh TEXT         NOT NULL,
    discipline     VARCHAR(10)  NOT NULL REFERENCES proc.mep_disciplines (discipline_code),
    description    TEXT
);
CREATE INDEX IF NOT EXISTS idx_pf_discipline ON proc.product_families (discipline);

\echo '>>> Creating proc.attribute_definitions...'
CREATE TABLE IF NOT EXISTS proc.attribute_definitions (
    attr_def_id   UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
    family_id     UUID    NOT NULL REFERENCES proc.product_families (family_id) ON DELETE CASCADE,
    attr_key      TEXT    NOT NULL,
    label_zh      TEXT    NOT NULL,
    unit          TEXT,
    value_type    TEXT    NOT NULL CHECK (value_type IN ('select', 'number', 'text')),
    display_order INT     NOT NULL DEFAULT 0,
    UNIQUE (family_id, attr_key)
);
CREATE INDEX IF NOT EXISTS idx_attrdef_family_id ON proc.attribute_definitions (family_id);

\echo '>>> Creating proc.products...'
CREATE TABLE IF NOT EXISTS proc.products (
    product_id   UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    family_id    UUID          NOT NULL REFERENCES proc.product_families (family_id),
    brand_id     UUID          REFERENCES proc.brands (brand_id),
    product_code TEXT          UNIQUE NOT NULL,
    description  TEXT          NOT NULL,
    created_at   TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_products_family_id ON proc.products (family_id);
CREATE INDEX IF NOT EXISTS idx_products_brand_id  ON proc.products (brand_id);
CREATE INDEX IF NOT EXISTS idx_products_desc_fts
    ON proc.products
    USING GIN (to_tsvector('simple', description));

\echo '>>> Creating proc.product_attributes...'
CREATE TABLE IF NOT EXISTS proc.product_attributes (
    product_id  UUID  NOT NULL REFERENCES proc.products (product_id) ON DELETE CASCADE,
    attr_key    TEXT  NOT NULL,
    attr_value  TEXT  NOT NULL,
    PRIMARY KEY (product_id, attr_key)
);

-- =============================================================
-- ALTER proc.quote_lines — add product_id FK (nullable)
-- =============================================================
\echo '>>> Adding product_id to proc.quote_lines...'
ALTER TABLE proc.quote_lines
    ADD COLUMN IF NOT EXISTS product_id UUID REFERENCES proc.products (product_id);
CREATE INDEX IF NOT EXISTS idx_ql_product_id ON proc.quote_lines (product_id);

-- =============================================================
-- SEED DATA — 5 product families + attribute_definitions
-- All inserts use ON CONFLICT DO NOTHING
-- =============================================================
\echo '>>> Seeding proc.product_families...'
INSERT INTO proc.product_families (family_code, family_name_zh, discipline, description)
VALUES
    ('EMT_CONDUIT',     '電線管',     'ELEC',  'EMT 薄鋼電線管'),
    ('WIRE_CABLE',      '電線電纜',   'ELEC',  '電線與電纜'),
    ('CIRCUIT_BREAKER', '無熔絲開關', 'ELEC',  '電路斷路器'),
    ('HVAC_DUCT',       '風管',       'HVAC',  '空調風管'),
    ('GI_PIPE',         '白鐵管',     'PLUMB', '鍍鋅鋼管')
ON CONFLICT (family_code) DO NOTHING;

\echo '>>> Seeding proc.attribute_definitions...'
-- EMT_CONDUIT
INSERT INTO proc.attribute_definitions (family_id, attr_key, label_zh, value_type, display_order)
SELECT f.family_id, v.attr_key, v.label_zh, v.value_type, v.display_order
FROM proc.product_families f
CROSS JOIN (VALUES
    ('diameter',  '管徑',   'select', 1),
    ('material',  '材質',   'select', 2),
    ('standard',  '規範',   'select', 3),
    ('length_m',  '長度(m)', 'number', 4)
) AS v(attr_key, label_zh, value_type, display_order)
WHERE f.family_code = 'EMT_CONDUIT'
ON CONFLICT (family_id, attr_key) DO NOTHING;

-- WIRE_CABLE
INSERT INTO proc.attribute_definitions (family_id, attr_key, label_zh, value_type, display_order)
SELECT f.family_id, v.attr_key, v.label_zh, v.value_type, v.display_order
FROM proc.product_families f
CROSS JOIN (VALUES
    ('conductor_size',  '導體截面積', 'select', 1),
    ('core_count',      '芯數',       'select', 2),
    ('insulation',      '絕緣材質',   'select', 3),
    ('voltage_rating',  '額定電壓',   'select', 4)
) AS v(attr_key, label_zh, value_type, display_order)
WHERE f.family_code = 'WIRE_CABLE'
ON CONFLICT (family_id, attr_key) DO NOTHING;

-- CIRCUIT_BREAKER
INSERT INTO proc.attribute_definitions (family_id, attr_key, label_zh, value_type, display_order)
SELECT f.family_id, v.attr_key, v.label_zh, v.value_type, v.display_order
FROM proc.product_families f
CROSS JOIN (VALUES
    ('poles',             '極數',       'select', 1),
    ('amperage',          '額定電流',   'select', 2),
    ('breaking_capacity', '斷路容量',   'number', 3),
    ('voltage_rating',    '額定電壓',   'select', 4)
) AS v(attr_key, label_zh, value_type, display_order)
WHERE f.family_code = 'CIRCUIT_BREAKER'
ON CONFLICT (family_id, attr_key) DO NOTHING;

-- HVAC_DUCT
INSERT INTO proc.attribute_definitions (family_id, attr_key, label_zh, value_type, display_order)
SELECT f.family_id, v.attr_key, v.label_zh, v.value_type, v.display_order
FROM proc.product_families f
CROSS JOIN (VALUES
    ('duct_type',     '風管型式',   'select', 1),
    ('material',      '材質',       'select', 2),
    ('thickness_mm',  '板厚(mm)',   'select', 3)
) AS v(attr_key, label_zh, value_type, display_order)
WHERE f.family_code = 'HVAC_DUCT'
ON CONFLICT (family_id, attr_key) DO NOTHING;

-- GI_PIPE
INSERT INTO proc.attribute_definitions (family_id, attr_key, label_zh, value_type, display_order)
SELECT f.family_id, v.attr_key, v.label_zh, v.value_type, v.display_order
FROM proc.product_families f
CROSS JOIN (VALUES
    ('diameter_mm', '管徑(mm)', 'select', 1),
    ('schedule',    '管厚等級', 'select', 2),
    ('joint_type',  '接合方式', 'select', 3)
) AS v(attr_key, label_zh, value_type, display_order)
WHERE f.family_code = 'GI_PIPE'
ON CONFLICT (family_id, attr_key) DO NOTHING;

-- =============================================================
-- NEW MATERIALIZED VIEW — proc.mv_product_price_stats
-- =============================================================
\echo '>>> Creating proc.mv_product_price_stats...'
CREATE MATERIALIZED VIEW IF NOT EXISTS proc.mv_product_price_stats AS
SELECT
    ql.product_id,
    ql.uom,
    COUNT(*)                                       AS quote_count,
    ROUND(AVG(ql.unit_price)::numeric, 2)          AS avg_unit_price,
    MIN(ql.unit_price)                             AS min_unit_price,
    MAX(ql.unit_price)                             AS max_unit_price,
    ROUND(STDDEV(ql.unit_price)::numeric, 2)       AS stddev_unit_price,
    ROUND(PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY ql.unit_price)::numeric, 2) AS p25_unit_price,
    ROUND(PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY ql.unit_price)::numeric, 2) AS p75_unit_price,
    MAX(p.bid_date)                                AS latest_quote_date
FROM proc.quote_lines ql
JOIN proc.projects p ON p.project_id = ql.project_id
WHERE ql.product_id IS NOT NULL
  AND ql.confidence >= 0.7
GROUP BY ql.product_id, ql.uom
WITH NO DATA;

CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_product_price_stats_pk
    ON proc.mv_product_price_stats (product_id, uom);

\echo '>>> Product schema DDL complete.'
-- END OF FILE
