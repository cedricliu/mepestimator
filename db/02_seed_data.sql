-- =============================================================
-- MEP Ops — Seed / Reference Data
-- db/02_seed_data.sql
-- Run order: 2 of 3
-- =============================================================

\echo '>>> Seeding proc.uom_map (21 rows)...'
INSERT INTO proc.uom_map (raw_uom, canonical_uom, conversion_factor, notes)
VALUES
    -- Traditional Chinese units
    ('台',  '台',  1.0, '台 — unit (machine/equipment)'),
    ('組',  '組',  1.0, '組 — set/assembly'),
    ('式',  '式',  1.0, '式 — lump sum item'),
    ('個',  '個',  1.0, '個 — piece/unit'),
    ('只',  '個',  1.0, '只 → 個 alias'),
    ('支',  '支',  1.0, '支 — rod/bar/piece'),
    ('套',  '組',  1.0, '套 → 組 alias'),
    ('點',  '點',  1.0, '點 — point (fire/weak signal)'),
    ('回路','回路',1.0, '回路 — circuit'),
    ('批',  '批',  1.0, '批 — lot/batch'),
    -- Metric units
    ('m',   'm',   1.0, 'metre linear'),
    ('m²',  'm²',  1.0, 'square metre'),
    ('m³',  'm³',  1.0, 'cubic metre'),
    ('KG',  'KG',  1.0, 'kilogram'),
    ('L',   'L',   1.0, 'litre'),
    -- English abbreviation aliases
    ('pc',  '個',  1.0, 'piece → 個'),
    ('ea',  '個',  1.0, 'each → 個'),
    ('set', '組',  1.0, 'set → 組'),
    ('ls',  '式',  1.0, 'lump sum → 式'),
    ('kg',  'KG',  1.0, 'kg → KG'),
    ('ltr', 'L',   1.0, 'litre → L')
ON CONFLICT (raw_uom) DO UPDATE
    SET canonical_uom     = EXCLUDED.canonical_uom,
        conversion_factor = EXCLUDED.conversion_factor,
        notes             = EXCLUDED.notes;

\echo '>>> Seeding proc.project_types (6 rows)...'
INSERT INTO proc.project_types (project_type_code, name_en, name_zh, complexity_factor, mep_ratio)
VALUES
    ('WAREHOUSE',   'Warehouse',      '倉儲',    0.85, 0.12),
    ('OFFICE',      'Office',         '辦公',    1.00, 0.18),
    ('FACTORY',     'Factory',        '工廠',    1.10, 0.15),
    ('HOSPITAL',    'Hospital',       '醫療',    1.50, 0.28),
    ('RESIDENTIAL', 'Residential',    '住宅',    0.90, 0.14),
    ('DATACENTER',  'Data Center',    '資料中心',1.80, 0.45)
ON CONFLICT (project_type_code) DO UPDATE
    SET name_en           = EXCLUDED.name_en,
        name_zh           = EXCLUDED.name_zh,
        complexity_factor = EXCLUDED.complexity_factor,
        mep_ratio         = EXCLUDED.mep_ratio;

\echo '>>> Seeding proc.mep_disciplines (5 rows)...'
INSERT INTO proc.mep_disciplines (discipline_code, name_en, name_zh, typical_uom)
VALUES
    ('ELEC',  'Electrical',      '電氣',  '式'),
    ('HVAC',  'Air Conditioning','空調',  '台'),
    ('PLUMB', 'Plumbing',        '給排水','式'),
    ('FIRE',  'Fire Protection', '消防',  '式'),
    ('WEAK',  'Low Voltage',     '弱電',  '點')
ON CONFLICT (discipline_code) DO UPDATE
    SET name_en     = EXCLUDED.name_en,
        name_zh     = EXCLUDED.name_zh,
        typical_uom = EXCLUDED.typical_uom;

-- =============================================================
-- Product Families — 5 canonical families per PRD v1.2 Section 3
-- ON CONFLICT DO NOTHING — safe to re-run; also seeded in 04_product_schema.sql
-- Note: family_id is generated; attribute_definitions are seeded in 04_product_schema.sql
-- =============================================================
\echo '>>> Seeding proc.product_families (5 families per PRD Section 3)...'
INSERT INTO proc.product_families (family_code, family_name_zh, discipline, description)
VALUES
    ('EMT_CONDUIT',     '電線管',     'ELEC',  'EMT 薄鋼電線管'),
    ('WIRE_CABLE',      '電線電纜',   'ELEC',  '電線與電纜'),
    ('CIRCUIT_BREAKER', '無熔絲開關', 'ELEC',  '電路斷路器'),
    ('HVAC_DUCT',       '風管',       'HVAC',  '空調風管'),
    ('GI_PIPE',         '白鐵管',     'PLUMB', '鍍鋅鋼管')
ON CONFLICT (family_code) DO NOTHING;

\echo '>>> Seed data complete.'
-- END OF FILE
