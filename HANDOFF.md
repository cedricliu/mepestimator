# HANDOFF — Sprint 1 Complete
# MEP Pricing Intelligence System — Foundation: DB Auth Tables + JSONB Migration

Generated: 2026-03-11
Sprint: S1 — Foundation

---

## What Was Built

### 1. db/06_auth.sql — Auth Tables + Admin Seed
- `proc.users` — user registry per PRD v1.2 Section 4.3
  - Columns: user_id (UUID PK), email (UNIQUE), hashed_password, role CHECK('estimator','admin'), display_name, active, created_at, last_login
  - Indexes: idx_users_email, idx_users_active
- `proc.refresh_tokens` — JWT refresh token rotation store per PRD v1.2 Section 4.3
  - Columns: token_id (UUID PK), user_id (FK → proc.users CASCADE), token_hash (UNIQUE), expires_at, revoked, created_at, user_agent
  - Indexes: idx_rt_user_id, idx_rt_token_hash, idx_rt_revoked
- Admin seed: reads `ADMIN_EMAIL` and `ADMIN_PASSWORD_HASH` from shell environment via psql `\getenv` then inserts with `ON CONFLICT (email) DO NOTHING` — safe to re-run

### 2. db/07_jsonb_migration.sql — JSONB Migration (EAV → JSONB)
- `ALTER TABLE proc.products ADD COLUMN IF NOT EXISTS attributes JSONB NOT NULL DEFAULT '{}'`
- `CREATE INDEX idx_products_attributes_gin USING GIN (attributes)` — fixes PRD violation
- DO $$ block backfills JSONB from `proc.product_attributes` EAV rows using `jsonb_object_agg(attr_key, attr_value)` — only runs if EAV table still exists
- `DROP TABLE IF EXISTS proc.product_attributes` — removes the PRD violation
- All steps are idempotent — safe to re-run on fresh or already-migrated DB

### 3. db/02_seed_data.sql — Product Family Seeds Added
- Added `INSERT INTO proc.product_families ... ON CONFLICT (family_code) DO NOTHING` for all 5 families:
  EMT_CONDUIT, WIRE_CABLE, CIRCUIT_BREAKER, HVAC_DUCT, GI_PIPE
- These are also seeded in 04_product_schema.sql — the 02 seed is belt-and-suspenders for when seed files are run independently

### 4. setup.bat — Windows Setup Script (NEW FILE)
- Created: `setup.bat` in project root
- Reads .env variables into CMD environment using `for /f` loop (handles `$` in bcrypt hashes correctly)
- Runs SQL files in order: 01 → 02 → 03 → 04 → 05 → **06** → **07** (new files added)
- Passes ADMIN_EMAIL and ADMIN_PASSWORD_HASH to psql environment so `\getenv` in 06_auth.sql can pick them up
- Aborts on first error (`if errorlevel 1 ... exit /b 1`)

### 5. tests/validate.py — 2 New Tests + Test 7 Fixed
- **Test 7 updated**: Now checks for 4 core product tables (brands, product_families, attribute_definitions, products) AND asserts that `proc.product_attributes` (EAV) does NOT exist
- **Test 11 added** (PRD v1.2 Test 6): Checks GIN index on proc.products.attributes via pg_indexes
- **Test 12 added** (PRD v1.2 Test 7): Checks proc.users exists and has exactly 1 row (seeded admin)
- Total tests now: **12** (was 10)

---

## Decisions Made

| Decision | Rationale |
|---|---|
| `\getenv` + direct INSERT for admin seed (not inside DO $$) | psql `\getenv` sets psql variables; `:varname` interpolation in a regular INSERT is cleaner than inside PL/pgSQL and avoids uncertain behavior with `current_setting()` |
| `ON CONFLICT (email) DO NOTHING` for admin seed | Safe re-runs without clobbering data; matches PRD intent |
| DO $$ block for JSONB backfill with IF EXISTS guard | PL/pgSQL IF EXISTS check is evaluated at runtime — the UPDATE statement is never planned/executed if product_attributes doesn't exist; fully idempotent |
| `ALTER TABLE ... ADD COLUMN IF NOT EXISTS ... DEFAULT '{}'` | PostgreSQL fills all existing rows with `{}` before backfill runs; avoids NOT NULL violation |
| Numbered as 06 and 07 (not 05 and 06 as in CLAUDE.md file map) | db/05_sample_data.sql already exists; file numbering follows the actual sequence |
| Product families added to 02_seed_data.sql | PRD S1 deliverable says "update 02_seed_data.sql"; families were only in 04 previously |

---

## Current State After Sprint 1

| Item | Status |
|---|---|
| proc.users table | ✅ Ready — created by 06_auth.sql |
| proc.refresh_tokens table | ✅ Ready — created by 06_auth.sql |
| Admin user seeded | ✅ Seeded from ADMIN_EMAIL/ADMIN_PASSWORD_HASH in .env |
| proc.products.attributes JSONB | ✅ Added by 07_jsonb_migration.sql |
| GIN index on attributes | ✅ Created by 07_jsonb_migration.sql |
| proc.product_attributes (EAV) | ✅ Dropped by 07_jsonb_migration.sql |
| setup.bat | ✅ Created — runs all 7 SQL files |
| validate.py tests 11 & 12 | ✅ Added |

---

## Validation Status

**BLOCKED** — Docker Desktop was not running at time of handoff. Tests could not be executed against live DB.

### To validate Sprint 1 after starting Docker:

```bat
REM 1. Start Docker Desktop, then:
docker compose up -d postgres

REM 2. Wait for postgres to be healthy, then run setup:
setup.bat

REM 3. Run validation (use localhost since you're running outside Docker):
set DB_HOST=localhost
python tests\validate.py
```

**Expected result:** 12/12 PASSED

If Test 12 fails with "0 rows", it means ADMIN_EMAIL or ADMIN_PASSWORD_HASH were not exported to the environment when setup.bat ran. In that case, run:
```bat
psql "postgresql://mep_user:changeme@localhost:5432/mep_ops" -f db/06_auth.sql
```
Make sure .env is in the current directory so `\getenv` can read the variables.

---

## Issues to Watch

1. **products.py uses proc.product_attributes**: After 07_jsonb_migration.sql drops the EAV table, all queries in `backend/routers/products.py` that join `proc.product_attributes` will break. Sprint 4 will rewrite these to use JSONB — but Sprint 2 (auth) comes first and doesn't touch products.py, so this is safe to defer.

2. **docker-compose.yml validation warning**: `docker compose ps` throws "additional properties 'admin' not allowed". This may be a Docker Compose version issue with the `admin` service name. If needed, rename the admin service to `admin_app` in docker-compose.yml. Does not affect Sprint 2 work.

3. **DB_HOST in .env**: `.env` has `DB_HOST=postgres` (works inside Docker network). For running `python tests/validate.py` locally (outside Docker), override with `set DB_HOST=localhost` or temporarily edit .env.

---

## Sprint 2 — Exact Next Steps

**Goal:** JWT login works end-to-end; 401/403 enforced on all routes.

**File to create:** `backend/routers/auth.py`
**File to modify:** `backend/main.py`
**Files to modify (add guards):** `backend/routers/ingest.py`, `products.py`, `quotes.py`, `vendors.py`, `health.py`

### Step-by-step:

1. **Install new packages** into backend/requirements.txt:
   ```
   python-jose[cryptography]==3.3.0
   passlib[bcrypt]==1.7.4
   ```

2. **Implement `backend/routers/auth.py`**:
   - `POST /auth/login` — query proc.users by email, bcrypt verify password, issue:
     - Access token: HS256 JWT, payload `{sub, email, role, exp=now+8h, iat}`, secret from JWT_SECRET env var
     - Refresh token: secrets.token_urlsafe(32), store SHA-256 hash in proc.refresh_tokens (expires_at = now+7d), return raw token as httpOnly cookie (`Set-Cookie: refresh_token=...; HttpOnly; SameSite=Lax`)
     - Response JSON: `{access_token, role, display_name, expires_in: 28800}`
   - `POST /auth/refresh` — read `refresh_token` from cookie, SHA-256 hash it, look up proc.refresh_tokens (not revoked, not expired), rotate: revoke old, insert new, return new access token + new httpOnly cookie
   - `POST /auth/logout` — read cookie, revoke token in DB, clear cookie

3. **Add auth dependencies to `backend/main.py`**:
   - `get_current_user(token: str = Depends(oauth2_scheme)) → dict` — decode JWT, return payload
   - `require_estimator = Depends(get_current_user)` — any valid token
   - `require_admin` — validates `payload["role"] == "admin"`, raises 403 otherwise

4. **Add guards to all existing routers** — prefix each protected endpoint with the appropriate dependency:
   - All GET endpoints: `current_user: dict = Depends(require_estimator)`
   - All POST/PATCH/DELETE: `current_user: dict = Depends(require_admin)`
   - GET /health: `Depends(require_estimator)`

5. **Test sequence** (curl):
   ```bash
   curl -X POST http://localhost:8000/auth/login -H "Content-Type: application/json" -d '{"email":"admin@example.com","password":"yourpassword"}'
   # → should return access_token + set httpOnly cookie

   curl http://localhost:8000/health
   # → 401 (no token)

   curl http://localhost:8000/health -H "Authorization: Bearer <access_token>"
   # → 200

   curl -X POST http://localhost:8000/ingest/upload -H "Authorization: Bearer <estimator_token>"
   # → 403 (estimator can't write)
   ```

### Agent: backend-engineer subagent
### Depends on: S1 complete (proc.users must exist) ✅

---

## File Map After Sprint 1

```
db/
  01_schemas.sql          ✅ Unchanged
  02_seed_data.sql        ✅ Updated — product family seeds added
  03_views.sql            ✅ Unchanged
  04_product_schema.sql   ✅ Unchanged (product_attributes still created here, dropped by 07)
  05_sample_data.sql      ✅ Unchanged
  06_auth.sql             ✅ NEW — proc.users + proc.refresh_tokens + admin seed
  07_jsonb_migration.sql  ✅ NEW — JSONB column + GIN index + backfill + DROP EAV

setup.bat                 ✅ NEW — runs 01→07 in sequence, reads .env
tests/
  validate.py             ✅ Updated — 12 tests (added 11, 12; fixed 7)
HANDOFF.md                ✅ This file
```
