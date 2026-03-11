-- =============================================================
-- MEP Ops — JSONB Migration: Replace EAV with JSONB column
-- db/07_jsonb_migration.sql
-- Run order: 7 (after 06_auth.sql)
--
-- What this does:
--   1. ADD attributes JSONB NOT NULL DEFAULT '{}' to proc.products
--   2. Create GIN index on proc.products.attributes
--   3. Backfill attributes JSONB from proc.product_attributes EAV rows
--   4. DROP TABLE proc.product_attributes (EAV — should not exist per PRD v1.2)
--
-- Idempotent: safe to re-run (IF NOT EXISTS / IF EXISTS guards throughout)
-- =============================================================

\echo '>>> Step 1: Adding attributes JSONB column to proc.products...'
ALTER TABLE proc.products
    ADD COLUMN IF NOT EXISTS attributes JSONB NOT NULL DEFAULT '{}';

\echo '>>> Step 2: Creating GIN index on proc.products.attributes...'
CREATE INDEX IF NOT EXISTS idx_products_attributes_gin
    ON proc.products
    USING GIN (attributes);

\echo '>>> Step 3: Backfilling JSONB from proc.product_attributes (if table exists)...'
DO $$
BEGIN
    -- Only backfill if proc.product_attributes still exists
    IF EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'proc'
          AND table_name   = 'product_attributes'
    ) THEN
        -- Aggregate all (attr_key, attr_value) pairs per product into a JSONB object
        -- and merge into the attributes column (existing '{}' values get overwritten)
        UPDATE proc.products p
        SET    attributes = agg.attrs
        FROM (
            SELECT product_id,
                   jsonb_object_agg(attr_key, attr_value) AS attrs
            FROM   proc.product_attributes
            GROUP  BY product_id
        ) agg
        WHERE  p.product_id = agg.product_id;

        RAISE NOTICE 'Backfill complete — updated % products',
            (SELECT COUNT(*) FROM proc.products WHERE attributes <> '{}');
    ELSE
        RAISE NOTICE 'proc.product_attributes does not exist — skipping backfill';
    END IF;
END;
$$;

\echo '>>> Step 4: Dropping proc.product_attributes EAV table (if exists)...'
DROP TABLE IF EXISTS proc.product_attributes;

\echo '>>> JSONB migration complete.'
-- END OF FILE
