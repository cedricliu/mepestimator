-- =============================================================
-- MEP Ops — Schema & Table DDL
-- db/01_schemas.sql
-- Run order: 1 of 3
-- =============================================================

\echo '>>> Enabling extensions...'
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- =============================================================
-- SCHEMAS
-- =============================================================
\echo '>>> Creating schemas...'
CREATE SCHEMA IF NOT EXISTS stg;   -- raw staging, no constraints
CREATE SCHEMA IF NOT EXISTS proc;  -- normalized core tables

-- =============================================================
-- LOOKUP TABLES
-- =============================================================

\echo '>>> Creating proc.project_types...'
-- Natural key: project_type_code (ON CONFLICT target)
CREATE TABLE IF NOT EXISTS proc.project_types (
    project_type_code  VARCHAR(20)    PRIMARY KEY,
    name_en            VARCHAR(100)   NOT NULL,
    name_zh            VARCHAR(100)   NOT NULL,
    complexity_factor  NUMERIC(4,2)   NOT NULL DEFAULT 1.0,
    mep_ratio          NUMERIC(4,2)   NOT NULL DEFAULT 0.15
);

\echo '>>> Creating proc.mep_disciplines...'
-- Natural key: discipline_code (ON CONFLICT target)
CREATE TABLE IF NOT EXISTS proc.mep_disciplines (
    discipline_code  VARCHAR(10)   PRIMARY KEY,
    name_en          VARCHAR(100)  NOT NULL,
    name_zh          VARCHAR(100)  NOT NULL,
    typical_uom      VARCHAR(20)
);

\echo '>>> Creating proc.uom_map...'
-- Natural key: raw_uom (ON CONFLICT target)
CREATE TABLE IF NOT EXISTS proc.uom_map (
    raw_uom            VARCHAR(50)   PRIMARY KEY,
    canonical_uom      VARCHAR(20)   NOT NULL,
    conversion_factor  NUMERIC(12,6) NOT NULL DEFAULT 1.0,
    notes              TEXT
);
CREATE INDEX IF NOT EXISTS idx_uom_map_canonical ON proc.uom_map (canonical_uom);

-- =============================================================
-- CORE TABLES
-- =============================================================

\echo '>>> Creating proc.vendors...'
-- Natural key: vendor_code (ON CONFLICT DO UPDATE SET ...)
CREATE TABLE IF NOT EXISTS proc.vendors (
    vendor_id        UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    vendor_code      VARCHAR(20)   UNIQUE NOT NULL,
    vendor_name      VARCHAR(200)  NOT NULL,
    discipline_codes TEXT[],
    contact_name     VARCHAR(100),
    contact_phone    VARCHAR(50),
    contact_email    VARCHAR(200),
    is_active        BOOLEAN       NOT NULL DEFAULT true,
    created_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_vendors_is_active ON proc.vendors (is_active);

\echo '>>> Creating proc.projects...'
-- Natural key: project_code (ON CONFLICT DO UPDATE SET ...)
CREATE TABLE IF NOT EXISTS proc.projects (
    project_id         UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    project_code       VARCHAR(50)   UNIQUE NOT NULL,
    project_name       VARCHAR(500)  NOT NULL,
    project_type_code  VARCHAR(20)   REFERENCES proc.project_types (project_type_code),
    gfa_m2             NUMERIC(12,2),
    bid_date           DATE,
    region             VARCHAR(100),
    created_at         TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_projects_project_type_code ON proc.projects (project_type_code);
CREATE INDEX IF NOT EXISTS idx_projects_bid_date ON proc.projects (bid_date);

\echo '>>> Creating proc.quote_lines...'
-- Natural key: (project_id, vendor_id, discipline, item_code, description)
-- Used for ON CONFLICT upsert in ingest pipeline
CREATE TABLE IF NOT EXISTS proc.quote_lines (
    line_id       UUID           PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id    UUID           NOT NULL REFERENCES proc.projects (project_id),
    vendor_id     UUID           REFERENCES proc.vendors (vendor_id),
    discipline    VARCHAR(10)    NOT NULL REFERENCES proc.mep_disciplines (discipline_code),
    item_code     VARCHAR(100)   NOT NULL DEFAULT '',
    description   TEXT           NOT NULL,
    uom           VARCHAR(50)    NOT NULL,
    qty           NUMERIC(18,4),
    unit_price    NUMERIC(18,2)  NOT NULL,
    -- Generated column: amount = qty * unit_price (stored, updated on write)
    amount        NUMERIC(18,2)  GENERATED ALWAYS AS (qty * unit_price) STORED,
    currency      VARCHAR(10)    NOT NULL DEFAULT 'TWD',
    confidence    NUMERIC(3,2)   NOT NULL DEFAULT 1.0
                                 CHECK (confidence BETWEEN 0.0 AND 1.0),
    source_file   VARCHAR(500),
    import_batch  VARCHAR(200),
    created_at    TIMESTAMPTZ    NOT NULL DEFAULT NOW()
);

-- Indexes on FK columns
CREATE INDEX IF NOT EXISTS idx_ql_project_id   ON proc.quote_lines (project_id);
CREATE INDEX IF NOT EXISTS idx_ql_vendor_id    ON proc.quote_lines (vendor_id);
CREATE INDEX IF NOT EXISTS idx_ql_discipline   ON proc.quote_lines (discipline);
-- Indexes on common WHERE / JOIN columns
CREATE INDEX IF NOT EXISTS idx_ql_item_code    ON proc.quote_lines (item_code);
CREATE INDEX IF NOT EXISTS idx_ql_uom          ON proc.quote_lines (uom);
CREATE INDEX IF NOT EXISTS idx_ql_confidence   ON proc.quote_lines (confidence);
CREATE INDEX IF NOT EXISTS idx_ql_import_batch ON proc.quote_lines (import_batch);
-- Full-text search on description
CREATE INDEX IF NOT EXISTS idx_ql_description_fts
    ON proc.quote_lines
    USING GIN (to_tsvector('simple', description));
-- Unique constraint for ON CONFLICT upsert
-- vendor_id excluded (nullable); item_code defaults to '' so it is always NOT NULL
CREATE UNIQUE INDEX IF NOT EXISTS idx_ql_natural_key
    ON proc.quote_lines (project_id, discipline, item_code, description);

-- =============================================================
-- STAGING TABLE
-- =============================================================

\echo '>>> Creating stg.raw_quote_lines...'
-- All TEXT — no constraints — accept any incoming data shape.
-- parse_status lifecycle: PENDING → OK | EXCEPTION
CREATE TABLE IF NOT EXISTS stg.raw_quote_lines (
    raw_id        UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    project_code  TEXT,
    vendor_code   TEXT,
    discipline    TEXT,
    item_code     TEXT,
    description   TEXT,
    uom           TEXT,
    qty           TEXT,
    unit_price    TEXT,
    currency      TEXT,
    source_file   TEXT,
    import_batch  TEXT,
    parse_status  TEXT        NOT NULL DEFAULT 'PENDING',  -- PENDING | OK | EXCEPTION
    parse_notes   TEXT,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_stg_import_batch   ON stg.raw_quote_lines (import_batch);
CREATE INDEX IF NOT EXISTS idx_stg_parse_status   ON stg.raw_quote_lines (parse_status);

\echo '>>> Schema DDL complete.'
-- END OF FILE
