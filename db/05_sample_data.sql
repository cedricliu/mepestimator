-- =============================================================
-- MEP Ops — Sprint 5 Sample Data
-- db/05_sample_data.sql
-- Run order: 5 (after 04_product_schema.sql)
-- Populates: brands, products, product_attributes,
--            projects, vendors, quote_lines (with product_id)
-- =============================================================

\echo '>>> Seeding proc.brands...'
INSERT INTO proc.brands (brand_code, brand_name, brand_name_en, country_of_origin, notes)
VALUES
    ('TECO',      '東元電機',   'TECO Electric',      'TW', '台灣主要電氣品牌'),
    ('TATUNG',    '大同',       'Tatung',              'TW', '台灣老牌電氣製造商'),
    ('SIEMENS',   '西門子',     'Siemens',             'DE', '德國工業電氣'),
    ('ABB',       'ABB',        'ABB',                 'CH', '瑞士電力自動化'),
    ('PANASONIC', '松下',       'Panasonic',           'JP', '日本綜合電器'),
    ('ALEX',      '亞力電機',   'Alex Electric',       'TW', '台灣配電盤製造'),
    ('WALSIN',    '華新麗華',   'Walsin Lihwa',        'TW', '台灣電線電纜龍頭'),
    ('TAIGANG',   '太鋼',       'Tai-Gang Steel Pipe', 'TW', '台灣鍍鋅鋼管')
ON CONFLICT (brand_code) DO NOTHING;

-- =============================================================
-- PROJECTS (3 realistic MEP projects)
-- =============================================================
\echo '>>> Seeding proc.projects (sample)...'
INSERT INTO proc.projects (project_code, project_name, project_type_code, gfa_m2, bid_date, region)
VALUES
    ('PRJ-2024-001', '台北A辦公大樓 MEP工程',    'OFFICE',    15000, '2024-03-15', '台北市'),
    ('PRJ-2024-002', '桃園物流倉儲中心 MEP工程',  'WAREHOUSE', 32000, '2024-06-20', '桃園市'),
    ('PRJ-2025-001', '新竹科學園區廠房 MEP工程',  'FACTORY',   8500,  '2025-01-10', '新竹市')
ON CONFLICT (project_code) DO NOTHING;

-- =============================================================
-- VENDORS (5 MEP subcontractors)
-- =============================================================
\echo '>>> Seeding proc.vendors (sample)...'
INSERT INTO proc.vendors (vendor_code, vendor_name, discipline_codes, contact_name, contact_phone)
VALUES
    ('VND-ELEC-001', '誠信電機工程行',   ARRAY['ELEC'],              '陳志明', '02-2345-6789'),
    ('VND-ELEC-002', '宏達電氣工程公司', ARRAY['ELEC','WEAK'],       '林美華', '02-8765-4321'),
    ('VND-HVAC-001', '冠傑空調工程',     ARRAY['HVAC'],              '王建國', '03-456-7890'),
    ('VND-PLMB-001', '順暢水電工程行',   ARRAY['PLUMB','FIRE'],      '張文雄', '03-234-5678'),
    ('VND-FULL-001', '大成機電工程股份公司', ARRAY['ELEC','HVAC','PLUMB','FIRE','WEAK'], '李志遠', '02-2222-3333')
ON CONFLICT (vendor_code) DO NOTHING;

-- =============================================================
-- PRODUCTS — EMT_CONDUIT (3 sizes)
-- =============================================================
\echo '>>> Seeding products: EMT_CONDUIT...'
INSERT INTO proc.products (family_id, brand_id, product_code, description)
SELECT
    (SELECT family_id FROM proc.product_families WHERE family_code = 'EMT_CONDUIT'),
    (SELECT brand_id  FROM proc.brands            WHERE brand_code = 'TECO'),
    v.product_code, v.description
FROM (VALUES
    ('EMT-1/2-TECO',  'EMT電線管 1/2吋 鍍鋅 東元'),
    ('EMT-3/4-TECO',  'EMT電線管 3/4吋 鍍鋅 東元'),
    ('EMT-1-TECO',    'EMT電線管 1吋 鍍鋅 東元')
) AS v(product_code, description)
ON CONFLICT (product_code) DO NOTHING;

INSERT INTO proc.product_attributes (product_id, attr_key, attr_value)
SELECT p.product_id, a.attr_key, a.attr_value
FROM proc.products p
CROSS JOIN (VALUES
    ('EMT-1/2-TECO', 'diameter',  '1/2"'),
    ('EMT-1/2-TECO', 'material',  '鍍鋅鋼'),
    ('EMT-1/2-TECO', 'standard',  'CNS'),
    ('EMT-1/2-TECO', 'length_m',  '3.6'),
    ('EMT-3/4-TECO', 'diameter',  '3/4"'),
    ('EMT-3/4-TECO', 'material',  '鍍鋅鋼'),
    ('EMT-3/4-TECO', 'standard',  'CNS'),
    ('EMT-3/4-TECO', 'length_m',  '3.6'),
    ('EMT-1-TECO',   'diameter',  '1"'),
    ('EMT-1-TECO',   'material',  '鍍鋅鋼'),
    ('EMT-1-TECO',   'standard',  'CNS'),
    ('EMT-1-TECO',   'length_m',  '3.6')
) AS a(product_code, attr_key, attr_value)
WHERE p.product_code = a.product_code
ON CONFLICT (product_id, attr_key) DO NOTHING;

-- =============================================================
-- PRODUCTS — WIRE_CABLE (3 specs)
-- =============================================================
\echo '>>> Seeding products: WIRE_CABLE...'
INSERT INTO proc.products (family_id, brand_id, product_code, description)
SELECT
    (SELECT family_id FROM proc.product_families WHERE family_code = 'WIRE_CABLE'),
    (SELECT brand_id  FROM proc.brands            WHERE brand_code = 'WALSIN'),
    v.product_code, v.description
FROM (VALUES
    ('WIRE-2C-2.0-WALSIN', '電線 2C×2.0mm² PVC絕緣 600V 華新'),
    ('WIRE-3C-5.5-WALSIN', '電線 3C×5.5mm² PVC絕緣 600V 華新'),
    ('WIRE-2C-14-WALSIN',  '電線 2C×14mm² PVC絕緣 600V 華新')
) AS v(product_code, description)
ON CONFLICT (product_code) DO NOTHING;

INSERT INTO proc.product_attributes (product_id, attr_key, attr_value)
SELECT p.product_id, a.attr_key, a.attr_value
FROM proc.products p
CROSS JOIN (VALUES
    ('WIRE-2C-2.0-WALSIN', 'conductor_size', '2.0mm²'),
    ('WIRE-2C-2.0-WALSIN', 'core_count',     '2C'),
    ('WIRE-2C-2.0-WALSIN', 'insulation',     'PVC'),
    ('WIRE-2C-2.0-WALSIN', 'voltage_rating', '600V'),
    ('WIRE-3C-5.5-WALSIN', 'conductor_size', '5.5mm²'),
    ('WIRE-3C-5.5-WALSIN', 'core_count',     '3C'),
    ('WIRE-3C-5.5-WALSIN', 'insulation',     'PVC'),
    ('WIRE-3C-5.5-WALSIN', 'voltage_rating', '600V'),
    ('WIRE-2C-14-WALSIN',  'conductor_size', '14mm²'),
    ('WIRE-2C-14-WALSIN',  'core_count',     '2C'),
    ('WIRE-2C-14-WALSIN',  'insulation',     'PVC'),
    ('WIRE-2C-14-WALSIN',  'voltage_rating', '600V')
) AS a(product_code, attr_key, attr_value)
WHERE p.product_code = a.product_code
ON CONFLICT (product_id, attr_key) DO NOTHING;

-- =============================================================
-- PRODUCTS — CIRCUIT_BREAKER (3 specs)
-- =============================================================
\echo '>>> Seeding products: CIRCUIT_BREAKER...'
INSERT INTO proc.products (family_id, brand_id, product_code, description)
SELECT
    (SELECT family_id FROM proc.product_families WHERE family_code = 'CIRCUIT_BREAKER'),
    b.brand_id,
    v.product_code, v.description
FROM (VALUES
    ('NFB-3P-100A-SIEMENS', 'SIEMENS', '無熔絲開關 3P 100A 5kA 西門子'),
    ('NFB-3P-225A-ABB',     'ABB',     '無熔絲開關 3P 225A 10kA ABB'),
    ('NFB-2P-50A-TECO',     'TECO',    '無熔絲開關 2P 50A 5kA 東元')
) AS v(product_code, brand_code, description)
JOIN proc.brands b ON b.brand_code = v.brand_code
ON CONFLICT (product_code) DO NOTHING;

INSERT INTO proc.product_attributes (product_id, attr_key, attr_value)
SELECT p.product_id, a.attr_key, a.attr_value
FROM proc.products p
CROSS JOIN (VALUES
    ('NFB-3P-100A-SIEMENS', 'poles',             '3P'),
    ('NFB-3P-100A-SIEMENS', 'amperage',          '100A'),
    ('NFB-3P-100A-SIEMENS', 'breaking_capacity', '5'),
    ('NFB-3P-100A-SIEMENS', 'voltage_rating',    '220V'),
    ('NFB-3P-225A-ABB',     'poles',             '3P'),
    ('NFB-3P-225A-ABB',     'amperage',          '225A'),
    ('NFB-3P-225A-ABB',     'breaking_capacity', '10'),
    ('NFB-3P-225A-ABB',     'voltage_rating',    '220V'),
    ('NFB-2P-50A-TECO',     'poles',             '2P'),
    ('NFB-2P-50A-TECO',     'amperage',          '50A'),
    ('NFB-2P-50A-TECO',     'breaking_capacity', '5'),
    ('NFB-2P-50A-TECO',     'voltage_rating',    '110V')
) AS a(product_code, attr_key, attr_value)
WHERE p.product_code = a.product_code
ON CONFLICT (product_id, attr_key) DO NOTHING;

-- =============================================================
-- PRODUCTS — HVAC_DUCT (2 specs)
-- =============================================================
\echo '>>> Seeding products: HVAC_DUCT...'
INSERT INTO proc.products (family_id, brand_id, product_code, description)
SELECT
    (SELECT family_id FROM proc.product_families WHERE family_code = 'HVAC_DUCT'),
    NULL,
    v.product_code, v.description
FROM (VALUES
    ('DUCT-RECT-GALV-0.6', '矩形風管 鍍鋅鋼板 t=0.6mm'),
    ('DUCT-RECT-GALV-0.8', '矩形風管 鍍鋅鋼板 t=0.8mm')
) AS v(product_code, description)
ON CONFLICT (product_code) DO NOTHING;

INSERT INTO proc.product_attributes (product_id, attr_key, attr_value)
SELECT p.product_id, a.attr_key, a.attr_value
FROM proc.products p
CROSS JOIN (VALUES
    ('DUCT-RECT-GALV-0.6', 'duct_type',    '矩形'),
    ('DUCT-RECT-GALV-0.6', 'material',     '鍍鋅鋼板'),
    ('DUCT-RECT-GALV-0.6', 'thickness_mm', '0.6'),
    ('DUCT-RECT-GALV-0.8', 'duct_type',    '矩形'),
    ('DUCT-RECT-GALV-0.8', 'material',     '鍍鋅鋼板'),
    ('DUCT-RECT-GALV-0.8', 'thickness_mm', '0.8')
) AS a(product_code, attr_key, attr_value)
WHERE p.product_code = a.product_code
ON CONFLICT (product_id, attr_key) DO NOTHING;

-- =============================================================
-- PRODUCTS — GI_PIPE (3 sizes)
-- =============================================================
\echo '>>> Seeding products: GI_PIPE...'
INSERT INTO proc.products (family_id, brand_id, product_code, description)
SELECT
    (SELECT family_id FROM proc.product_families WHERE family_code = 'GI_PIPE'),
    (SELECT brand_id  FROM proc.brands            WHERE brand_code = 'TAIGANG'),
    v.product_code, v.description
FROM (VALUES
    ('GIP-25-SCH40-TAIGANG',  '鍍鋅鋼管 25mm SCH40 太鋼'),
    ('GIP-50-SCH40-TAIGANG',  '鍍鋅鋼管 50mm SCH40 太鋼'),
    ('GIP-100-SCH40-TAIGANG', '鍍鋅鋼管 100mm SCH40 太鋼')
) AS v(product_code, description)
ON CONFLICT (product_code) DO NOTHING;

INSERT INTO proc.product_attributes (product_id, attr_key, attr_value)
SELECT p.product_id, a.attr_key, a.attr_value
FROM proc.products p
CROSS JOIN (VALUES
    ('GIP-25-SCH40-TAIGANG',  'diameter_mm', '25'),
    ('GIP-25-SCH40-TAIGANG',  'schedule',    'SCH40'),
    ('GIP-25-SCH40-TAIGANG',  'joint_type',  '螺紋'),
    ('GIP-50-SCH40-TAIGANG',  'diameter_mm', '50'),
    ('GIP-50-SCH40-TAIGANG',  'schedule',    'SCH40'),
    ('GIP-50-SCH40-TAIGANG',  'joint_type',  '溝槽'),
    ('GIP-100-SCH40-TAIGANG', 'diameter_mm', '100'),
    ('GIP-100-SCH40-TAIGANG', 'schedule',    'SCH40'),
    ('GIP-100-SCH40-TAIGANG', 'joint_type',  '溝槽')
) AS a(product_code, attr_key, attr_value)
WHERE p.product_code = a.product_code
ON CONFLICT (product_id, attr_key) DO NOTHING;

-- =============================================================
-- QUOTE LINES — linked to products, spread across 3 projects
-- Prices vary by vendor to show spread in mv_product_price_stats
-- =============================================================
\echo '>>> Seeding proc.quote_lines (sample, product-linked)...'
INSERT INTO proc.quote_lines
    (project_id, vendor_id, discipline, item_code, description,
     uom, qty, unit_price, currency, confidence, source_file, import_batch, product_id)
SELECT
    proj.project_id,
    vnd.vendor_id,
    v.discipline,
    v.item_code,
    v.description,
    v.uom,
    v.qty,
    v.unit_price,
    'TWD',
    1.0,
    '05_sample_data.sql',
    'SAMPLE-BATCH-001',
    prod.product_id
FROM (VALUES
    -- EMT 1/2" — 3 vendors × 3 projects
    ('PRJ-2024-001','VND-ELEC-001','ELEC','E-C-01','EMT電線管 1/2吋 鍍鋅 東元','m',  200, 82.00,  'EMT-1/2-TECO'),
    ('PRJ-2024-001','VND-ELEC-002','ELEC','E-C-01','EMT電線管 1/2吋 鍍鋅 東元','m',  200, 88.00,  'EMT-1/2-TECO'),
    ('PRJ-2024-002','VND-FULL-001','ELEC','E-C-01','EMT電線管 1/2吋 鍍鋅 東元','m',  500, 79.50,  'EMT-1/2-TECO'),
    ('PRJ-2025-001','VND-ELEC-001','ELEC','E-C-01','EMT電線管 1/2吋 鍍鋅 東元','m',  150, 91.00,  'EMT-1/2-TECO'),
    -- EMT 3/4" — 3 vendors × 2 projects
    ('PRJ-2024-001','VND-ELEC-001','ELEC','E-C-02','EMT電線管 3/4吋 鍍鋅 東元','m',  350, 112.00, 'EMT-3/4-TECO'),
    ('PRJ-2024-002','VND-ELEC-002','ELEC','E-C-02','EMT電線管 3/4吋 鍍鋅 東元','m',  600, 105.50, 'EMT-3/4-TECO'),
    ('PRJ-2025-001','VND-FULL-001','ELEC','E-C-02','EMT電線管 3/4吋 鍍鋅 東元','m',  280, 118.00, 'EMT-3/4-TECO'),
    -- EMT 1" — 2 vendors
    ('PRJ-2024-001','VND-ELEC-002','ELEC','E-C-03','EMT電線管 1吋 鍍鋅 東元',  'm',  120, 145.00, 'EMT-1-TECO'),
    ('PRJ-2024-002','VND-FULL-001','ELEC','E-C-03','EMT電線管 1吋 鍍鋅 東元',  'm',  280, 138.00, 'EMT-1-TECO'),
    -- Wire 2C×2.0mm²
    ('PRJ-2024-001','VND-ELEC-001','ELEC','E-W-01','電線 2C×2.0mm² PVC絕緣 600V 華新','m', 800,  18.50, 'WIRE-2C-2.0-WALSIN'),
    ('PRJ-2024-001','VND-ELEC-002','ELEC','E-W-01','電線 2C×2.0mm² PVC絕緣 600V 華新','m', 800,  20.00, 'WIRE-2C-2.0-WALSIN'),
    ('PRJ-2024-002','VND-FULL-001','ELEC','E-W-01','電線 2C×2.0mm² PVC絕緣 600V 華新','m',1500,  17.80, 'WIRE-2C-2.0-WALSIN'),
    ('PRJ-2025-001','VND-ELEC-001','ELEC','E-W-01','電線 2C×2.0mm² PVC絕緣 600V 華新','m', 400,  21.50, 'WIRE-2C-2.0-WALSIN'),
    -- Wire 3C×5.5mm²
    ('PRJ-2024-001','VND-ELEC-001','ELEC','E-W-02','電線 3C×5.5mm² PVC絕緣 600V 華新','m', 300,  52.00, 'WIRE-3C-5.5-WALSIN'),
    ('PRJ-2024-002','VND-ELEC-002','ELEC','E-W-02','電線 3C×5.5mm² PVC絕緣 600V 華新','m', 500,  48.50, 'WIRE-3C-5.5-WALSIN'),
    ('PRJ-2025-001','VND-FULL-001','ELEC','E-W-02','電線 3C×5.5mm² PVC絕緣 600V 華新','m', 200,  55.00, 'WIRE-3C-5.5-WALSIN'),
    -- Wire 2C×14mm²
    ('PRJ-2024-002','VND-ELEC-001','ELEC','E-W-03','電線 2C×14mm² PVC絕緣 600V 華新', 'm', 180, 138.00, 'WIRE-2C-14-WALSIN'),
    ('PRJ-2025-001','VND-FULL-001','ELEC','E-W-03','電線 2C×14mm² PVC絕緣 600V 華新', 'm',  90, 145.00, 'WIRE-2C-14-WALSIN'),
    -- Circuit Breaker 3P 100A Siemens
    ('PRJ-2024-001','VND-ELEC-001','ELEC','E-B-01','無熔絲開關 3P 100A 5kA 西門子','個',  8, 980.00,  'NFB-3P-100A-SIEMENS'),
    ('PRJ-2024-001','VND-ELEC-002','ELEC','E-B-01','無熔絲開關 3P 100A 5kA 西門子','個',  8,1050.00,  'NFB-3P-100A-SIEMENS'),
    ('PRJ-2024-002','VND-FULL-001','ELEC','E-B-01','無熔絲開關 3P 100A 5kA 西門子','個', 20, 935.00,  'NFB-3P-100A-SIEMENS'),
    ('PRJ-2025-001','VND-ELEC-001','ELEC','E-B-01','無熔絲開關 3P 100A 5kA 西門子','個',  5,1020.00,  'NFB-3P-100A-SIEMENS'),
    -- Circuit Breaker 3P 225A ABB
    ('PRJ-2024-001','VND-ELEC-002','ELEC','E-B-02','無熔絲開關 3P 225A 10kA ABB','個',  4,2450.00, 'NFB-3P-225A-ABB'),
    ('PRJ-2024-002','VND-FULL-001','ELEC','E-B-02','無熔絲開關 3P 225A 10kA ABB','個', 10,2280.00, 'NFB-3P-225A-ABB'),
    -- Circuit Breaker 2P 50A TECO
    ('PRJ-2024-001','VND-ELEC-001','ELEC','E-B-03','無熔絲開關 2P 50A 5kA 東元', '個', 12, 420.00, 'NFB-2P-50A-TECO'),
    ('PRJ-2025-001','VND-ELEC-002','ELEC','E-B-03','無熔絲開關 2P 50A 5kA 東元', '個',  6, 445.00, 'NFB-2P-50A-TECO'),
    -- HVAC Duct 0.6mm
    ('PRJ-2024-001','VND-HVAC-001','HVAC','H-D-01','矩形風管 鍍鋅鋼板 t=0.6mm','m²', 800, 380.00, 'DUCT-RECT-GALV-0.6'),
    ('PRJ-2024-002','VND-HVAC-001','HVAC','H-D-01','矩形風管 鍍鋅鋼板 t=0.6mm','m²',1800, 355.00, 'DUCT-RECT-GALV-0.6'),
    ('PRJ-2025-001','VND-FULL-001','HVAC','H-D-01','矩形風管 鍍鋅鋼板 t=0.6mm','m²', 500, 410.00, 'DUCT-RECT-GALV-0.6'),
    -- HVAC Duct 0.8mm
    ('PRJ-2024-001','VND-HVAC-001','HVAC','H-D-02','矩形風管 鍍鋅鋼板 t=0.8mm','m²', 400, 480.00, 'DUCT-RECT-GALV-0.8'),
    ('PRJ-2024-002','VND-FULL-001','HVAC','H-D-02','矩形風管 鍍鋅鋼板 t=0.8mm','m²', 900, 455.00, 'DUCT-RECT-GALV-0.8'),
    -- GI Pipe 25mm
    ('PRJ-2024-001','VND-PLMB-001','PLUMB','P-G-01','鍍鋅鋼管 25mm SCH40 太鋼','m', 350, 185.00, 'GIP-25-SCH40-TAIGANG'),
    ('PRJ-2024-002','VND-PLMB-001','PLUMB','P-G-01','鍍鋅鋼管 25mm SCH40 太鋼','m', 800, 172.00, 'GIP-25-SCH40-TAIGANG'),
    ('PRJ-2025-001','VND-FULL-001','PLUMB','P-G-01','鍍鋅鋼管 25mm SCH40 太鋼','m', 200, 195.00, 'GIP-25-SCH40-TAIGANG'),
    -- GI Pipe 50mm
    ('PRJ-2024-001','VND-PLMB-001','PLUMB','P-G-02','鍍鋅鋼管 50mm SCH40 太鋼','m', 200, 320.00, 'GIP-50-SCH40-TAIGANG'),
    ('PRJ-2024-002','VND-FULL-001','PLUMB','P-G-02','鍍鋅鋼管 50mm SCH40 太鋼','m', 450, 298.00, 'GIP-50-SCH40-TAIGANG'),
    ('PRJ-2025-001','VND-PLMB-001','PLUMB','P-G-02','鍍鋅鋼管 50mm SCH40 太鋼','m', 160, 335.00, 'GIP-50-SCH40-TAIGANG'),
    -- GI Pipe 100mm
    ('PRJ-2024-002','VND-PLMB-001','PLUMB','P-G-03','鍍鋅鋼管 100mm SCH40 太鋼','m',280, 620.00, 'GIP-100-SCH40-TAIGANG'),
    ('PRJ-2025-001','VND-FULL-001','PLUMB','P-G-03','鍍鋅鋼管 100mm SCH40 太鋼','m',120, 655.00, 'GIP-100-SCH40-TAIGANG')
) AS v(project_code, vendor_code, discipline, item_code, description, uom, qty, unit_price, product_code)
JOIN proc.projects  proj ON proj.project_code = v.project_code
JOIN proc.vendors   vnd  ON vnd.vendor_code   = v.vendor_code
JOIN proc.products  prod ON prod.product_code = v.product_code
ON CONFLICT (project_id, discipline, item_code, description, COALESCE(vendor_id, '00000000-0000-0000-0000-000000000000'::uuid)) DO UPDATE SET
    unit_price   = EXCLUDED.unit_price,
    qty          = EXCLUDED.qty,
    product_id   = EXCLUDED.product_id,
    import_batch = EXCLUDED.import_batch;

-- =============================================================
-- Refresh materialized views
-- =============================================================
\echo '>>> Refreshing materialized views...'
REFRESH MATERIALIZED VIEW proc.mv_price_stats;
REFRESH MATERIALIZED VIEW proc.mv_product_price_stats;

\echo '>>> Sample data complete.'
-- END OF FILE
