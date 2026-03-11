-- =============================================================
-- MEP Ops — Sprint 3: match_status + attributes_raw columns
-- db/08_match_status.sql
-- Run order: 8 (after 07_jsonb_migration.sql)
-- =============================================================

\echo '>>> Adding match_status to proc.quote_lines...'
ALTER TABLE proc.quote_lines
    ADD COLUMN IF NOT EXISTS match_status TEXT
        CHECK (match_status IN ('AUTO', 'AUTO_CREATED', 'MANUAL', 'NEEDS_REVIEW', 'EXCEPTION'))
        DEFAULT 'AUTO';

CREATE INDEX IF NOT EXISTS idx_ql_match_status ON proc.quote_lines (match_status);

\echo '>>> Adding attributes_raw JSONB to stg.raw_quote_lines...'
ALTER TABLE stg.raw_quote_lines
    ADD COLUMN IF NOT EXISTS attributes_raw JSONB DEFAULT '{}';

\echo '>>> Migration 08 complete.'
-- END OF FILE
