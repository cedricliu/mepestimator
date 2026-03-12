-- =============================================================
-- MEP Ops — Auth Tables
-- db/06_auth.sql
-- Run order: 6 (after 05_sample_data.sql)
-- Creates: proc.users, proc.refresh_tokens
-- Seeds:   one admin user from ADMIN_EMAIL + ADMIN_PASSWORD_HASH env vars
-- =============================================================

\echo '>>> Creating proc.users...'
CREATE TABLE IF NOT EXISTS proc.users (
    user_id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    email            TEXT         UNIQUE NOT NULL,
    hashed_password  TEXT         NOT NULL,
    role             TEXT         NOT NULL CHECK (role IN ('estimator', 'admin')),
    display_name     TEXT,
    active           BOOLEAN      NOT NULL DEFAULT true,
    created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    last_login       TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_users_email  ON proc.users (email);
CREATE INDEX IF NOT EXISTS idx_users_active ON proc.users (active);

\echo '>>> Creating proc.refresh_tokens...'
CREATE TABLE IF NOT EXISTS proc.refresh_tokens (
    token_id    UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID         NOT NULL REFERENCES proc.users (user_id) ON DELETE CASCADE,
    token_hash  TEXT         UNIQUE NOT NULL,
    expires_at  TIMESTAMPTZ  NOT NULL,
    revoked     BOOLEAN      NOT NULL DEFAULT false,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    user_agent  TEXT
);

CREATE INDEX IF NOT EXISTS idx_rt_user_id    ON proc.refresh_tokens (user_id);
CREATE INDEX IF NOT EXISTS idx_rt_token_hash ON proc.refresh_tokens (token_hash);
CREATE INDEX IF NOT EXISTS idx_rt_revoked    ON proc.refresh_tokens (revoked);

-- =============================================================
-- Seed admin user from env vars ADMIN_EMAIL + ADMIN_PASSWORD_HASH
-- \getenv reads from the shell environment (set by setup.bat / setup.sh)
-- ON CONFLICT DO NOTHING — safe to re-run
-- =============================================================
\echo '>>> Seeding admin user from environment...'
-- \getenv reads shell env vars exported before psql is called (setup.bat / setup.sh)
-- :'varname' is psql quoted-literal interpolation — substituted before PostgreSQL sees the SQL
\getenv admin_email         ADMIN_EMAIL
\getenv admin_password_hash ADMIN_PASSWORD_HASH

INSERT INTO proc.users (email, hashed_password, role, display_name, active)
SELECT :'admin_email', :'admin_password_hash', 'admin', 'Admin', true
WHERE  length(trim(:'admin_email'))         > 0
  AND  length(trim(:'admin_password_hash')) > 0
ON CONFLICT (email) DO NOTHING;

\echo '>>> Seeding estimator user from environment...'
\getenv estimator_email         ESTIMATOR_EMAIL
\getenv estimator_password_hash ESTIMATOR_PASSWORD_HASH

INSERT INTO proc.users (email, hashed_password, role, display_name, active)
SELECT :'estimator_email', :'estimator_password_hash', 'estimator', 'Estimator', true
WHERE  length(trim(:'estimator_email'))         > 0
  AND  length(trim(:'estimator_password_hash')) > 0
ON CONFLICT (email) DO NOTHING;

\echo '>>> Auth tables complete.'
-- END OF FILE
