# MEP Pricing Intelligence System — CLAUDE.md
# 機電工程歷史報價資料庫

## IMPORTANT: Read This First Every Session
1. Read this file (CLAUDE.md) — always, before any code
2. Read HANDOFF.md — if it exists, it overrides everything else for current state
3. Read docs/prd-v1.2.md — reference on demand by section number, not in full
4. Run `python tests/validate.py` after every sprint to verify nothing regressed

---

## Mission
Replace the 3–5 day vendor quote wait with a searchable historical pricing database.
Bidding team gets rough estimates in minutes, not days.

---

## PRD Version
**This project follows PRD v1.2.** Source of truth for all decisions: `docs/prd-v1.2.md`
Notable v1.2 changes from the original build:
- Auth added: JWT-based login required for all users (estimator + admin roles)
- Two React apps: `frontend/` (estimator, :5173) and `admin/` (admin, :5174)
- JSONB attributes on `proc.products` — replaces any EAV table approach
- `proc.users` and `proc.refresh_tokens` tables added
- 7-sprint plan (was 4)

---

## Architecture

### Three Services
| Service | Port | Who | Purpose |
|---|---|---|---|
| FastAPI backend | :8000 | Both apps | All API — shared |
| frontend/ (Estimator App) | :5173 | Bidding team | Search + estimate — read-only |
| admin/ (Admin App) | :5174 | Admin only | Upload, review, catalog management |

### Auth Design (Never Deviate From This)
- Both apps require login — estimator role (read-only) and admin role (full write)
- JWT access token: 8 hours, stored in **React useState memory only — NEVER localStorage**
- JWT refresh token: 7 days, stored in **httpOnly cookie only — NEVER JavaScript-accessible**
- On 401: silently call POST /auth/refresh, retry original request once, then redirect to /login
- Single admin user seeded from `.env` (ADMIN_EMAIL + ADMIN_PASSWORD_HASH) on startup
- `proc.users` table already has all columns needed for multi-user later — zero schema change required

### Stack
- **Database:** PostgreSQL 16 (Docker)
- **Backend:** FastAPI (Python 3.11), psycopg2, pandas, python-dotenv, python-jose, bcrypt
- **Frontend (estimator):** React 18 + Vite + Tailwind CSS — in `frontend/`
- **Admin UI:** React 18 + Vite + Tailwind CSS — in `admin/`
- **Local dev:** Docker Compose (ports 5432, 8000, 5173, 5174)
- **Prod target:** Hetzner VPS, same docker-compose + Nginx reverse proxy

---

## What Already Exists (Do Not Rebuild)
Read these files before writing any code in their domain:

| File / Folder | Status | Notes |
|---|---|---|
| `db/01_schemas.sql` | Built — v1.0 | Missing: proc.users, proc.refresh_tokens, proc.products with JSONB, proc.product_families, proc.brands, proc.attribute_definitions, match_status column |
| `db/02_seed_data.sql` | Built — v1.0 | Missing: admin user seed, product family seeds |
| `db/03_views.sql` | Built — v1.0 | May need update for JSONB-sourced facets |
| `db/04_product_schema.sql` | Partial | Review before adding new product tables |
| `backend/routers/ingest.py` | Built — v1.0 | Missing: auth guard, match_status logic, JSONB attribute extraction |
| `backend/routers/products.py` | Built — v1.0 | Missing: auth guard, JSONB facets endpoint, auto-create endpoint |
| `backend/routers/quotes.py` | Built — v1.0 | Missing: auth guard |
| `backend/routers/vendors.py` | Built — v1.0 | Missing: auth guard on write endpoints |
| `frontend/src/pages/Dashboard.jsx` | Built — v1.0 | Missing: login gate, JSONB attribute filters |
| `frontend/src/pages/Upload.jsx` | Built — v1.0 | Moves to admin/ app |
| `frontend/src/pages/Estimate.jsx` | Built — v1.0 | Missing: login gate |
| `frontend/src/pages/Products.jsx` | Built — v1.0 | Moves to admin/ app |
| `tests/validate.py` | Built — v1.0 | Has 5 tests, needs 2 more (users table + JSONB GIN index) |

**Before starting any sprint:** read the relevant existing files first, then extend/modify — never overwrite blindly.

---

## Sub-Agent Routing Rules

### Parallel dispatch (all conditions must be met):
- 3+ unrelated tasks, no shared state, clear file boundaries

### Sequential dispatch (any condition triggers):
- Tasks have dependencies (B needs output from A)
- Shared files or overlapping state
- Unclear scope

### Agent assignments:
- **db-architect** → any SQL, schema migrations, new tables, views, seed data
- **backend-engineer** → FastAPI routes, auth middleware, JWT logic, ingest pipeline, business logic
- **frontend-engineer** → React components, hooks, Vite config, Tailwind — for BOTH frontend/ and admin/
- **data-validator** → tests/validate.py only, acceptance criteria, PASS/FAIL checks

---

## Database Conventions
- DB name: `mep_ops`
- Schema `stg`: raw staging, all TEXT/JSONB, no constraints, preserve original data
- Schema `proc`: normalized core, enforced constraints, UI reads only from here
- All amounts in TWD (NT$)
- UoM canonical map lives in `proc.uom_map`
- Confidence: 1.0 = complete data, < 0.5 = EXCEPTION
- `stg.raw_quote_lines.parse_status`: PENDING → OK | EXCEPTION | NEEDS_REVIEW | AUTO_CREATED
- `proc.products.attributes`: JSONB NOT NULL DEFAULT '{}' — GIN indexed — **no separate EAV table**
- Product codes format: `[DISCIPLINE]-[FAMILY]-[SEQUENCE]` e.g. E-EMT-0001

---

## File Map
```
db/
  01_schemas.sql         → Core DDL (proc + stg tables, indexes)
  02_seed_data.sql       → Lookup data + admin user seed
  03_views.sql           → mv_price_stats, vw_quick_search, vw_vendor_comparison
  04_product_schema.sql  → Product families, attribute definitions (review before editing)
  05_auth.sql            → NEW: proc.users, proc.refresh_tokens
  06_jsonb_migration.sql → NEW: add attributes JSONB + GIN index to proc.products if not present

backend/
  main.py                → FastAPI app entrypoint + JWT middleware wiring
  routers/
    auth.py              → NEW: /auth/login, /auth/refresh, /auth/logout
    ingest.py            → POST /ingest/upload (admin only), /ingest/review, /ingest/resolve
    products.py          → GET /products/* (estimator+), POST /products (admin)
    quotes.py            → GET /quotes/search, /quotes/estimate, /quotes/trend (estimator+)
    vendors.py           → GET /vendors (estimator+), POST /vendors (admin)
    health.py            → GET /health (estimator+)

frontend/               → Estimator App (:5173)
  src/
    App.jsx
    hooks/useAuth.js     → JWT in useState, silent refresh, axios interceptor
    api/client.js        → axios instance with Authorization header injection
    pages/
      Login.jsx
      Dashboard.jsx      → Faceted search with JSONB-sourced attribute filters
      Estimate.jsx       → Project type + GFA → cost estimate

admin/                  → Admin App (:5174) — NEW directory
  src/
    App.jsx
    hooks/useAuth.js     → Same pattern as frontend/
    api/client.js
    pages/
      Login.jsx
      Upload.jsx         → Moved from frontend/ — now with admin token
      Review.jsx         → NEW: NEEDS_REVIEW resolution with JSONB attribute fields
      Products.jsx       → Moved from frontend/ — now with CRUD + JSONB editing
      Families.jsx       → NEW: product family + attribute schema management
      Vendors.jsx        → NEW: vendor + brand registry
      Health.jsx         → NEW: system status, row counts, batch history

tests/
  validate.py            → 7 acceptance tests (5 existing + 2 new)

docker-compose.yml       → 4 services: postgres, backend, frontend (:5173), admin (:5174)
setup.sh                 → Unix: runs all db/ SQL files in order
setup.bat                → Windows: equivalent of setup.sh for CMD
.env                     → credentials (never commit)
docs/
  prd-v1.2.md            → Full PRD — source of truth
  gap-analysis.md        → Generated on first session — what's built vs what's needed
HANDOFF.md               → Written at end of each sprint — read before starting next
```

---

## Hard Rules (Never Break)
- Never hardcode DB credentials — use `.env` + `python-dotenv`
- Never DROP proc.* tables — use ALTER TABLE or new migration files
- Always use `ON CONFLICT` upsert, never raw INSERT without conflict handling
- Always batch DB inserts — never row-by-row in loops
- Exceptions → `stg.raw_quote_lines.parse_status = 'EXCEPTION'` with reason in `parse_notes`
- Frontend always reads from `proc.*` views, never raw tables
- **JWT access token → React useState only. Never localStorage, never sessionStorage.**
- **Refresh token → httpOnly cookie only. Never returned in JSON body for JS to store.**
- **proc.products.attributes is JSONB — never create a product_attributes EAV table.**
- Never store plaintext passwords — bcrypt hash only in proc.users.hashed_password
- All write endpoints (POST/PATCH/DELETE) require admin role JWT
- All read endpoints require at minimum estimator role JWT
- Windows dev: use `setup.bat` not `setup.sh`; use `docker compose` (space, not hyphen)

---

## Common Mistakes — DO NOT
- Do not create a `product_attributes` table — JSONB on `proc.products.attributes`
- Do not store JWT in localStorage or sessionStorage
- Do not run `setup.sh` on Windows — use `setup.bat` or run SQL files manually via docker exec
- Do not hardcode `.env` values anywhere in code
- Do not overwrite existing router files — read them first, then extend
- Do not place admin pages in `frontend/` — they belong in `admin/`
- Do not call `/ingest/upload` without an admin JWT — it must return 401/403 otherwise
- Do not parallelize DB schema + backend — backend depends on schema existing first

---

## API Conventions
- All responses: `{ data: [...], meta: { count, errors } }`
- Errors: `{ error: "message", detail: "..." }` with appropriate HTTP status
- Auth errors: 401 = invalid/expired token | 403 = valid token, wrong role
- File upload: multipart/form-data, returns `{ rows_loaded, rows_ok, rows_auto_created, rows_needs_review, rows_exception }`
- CORS: allow `*` for local dev, use CORS_ORIGINS env var for prod
- Auth header: `Authorization: Bearer <access_token>` on every protected request

## Auth Endpoint Summary
| Endpoint | Auth | Notes |
|---|---|---|
| POST /auth/login | Public | Returns access_token (JSON) + refresh_token (httpOnly cookie) |
| POST /auth/refresh | httpOnly cookie | Rotates refresh token, returns new access_token |
| POST /auth/logout | httpOnly cookie | Revokes refresh token |
| GET /health | estimator+ | |
| GET /products/* | estimator+ | |
| POST /products | admin | |
| GET /quotes/* | estimator+ | |
| POST /ingest/upload | admin | |
| GET /ingest/review | admin | |
| POST /ingest/resolve | admin | |
| GET /vendors | estimator+ | |
| POST /vendors | admin | |

---

## Sprint Plan (v1.2 — 7 Sprints)

| Sprint | Goal | First Steps |
|---|---|---|
| S1 Foundation | DB + auth tables deployed, validate.py 7/7 | Write db/05_auth.sql, db/06_jsonb_migration.sql, update seeds |
| S2 Auth | Login works end-to-end, 401/403 enforced | Write backend/routers/auth.py, JWT middleware in main.py |
| S3 Ingest | Upload Excel → data in DB with auth guard | Extend ingest.py: add admin_required, JSONB extraction, match_status |
| S4 Product Catalog | JSONB facets queryable, admin products page | /products/facets from JSONB, admin/src/pages/Products.jsx |
| S5 Estimator App | Estimator logs in, searches, estimates | frontend/ Login.jsx, useAuth.js, Dashboard.jsx JSONB filters |
| S6 Admin App | Admin uploads, reviews, manages catalog | admin/ all pages: Upload, Review, Vendors, Health |
| S7 Harden | Production ready, all tests pass | Nginx config, README, docker-compose prod profile |

---

## Naming (Traditional Chinese labels where relevant)
- Discipline codes: ELEC 電氣 / HVAC 空調 / PLUMB 給排水 / FIRE 消防 / WEAK 弱電
- Project types: WAREHOUSE 倉儲 / OFFICE 辦公 / FACTORY 工廠 / HOSPITAL 醫療 / RESIDENTIAL 住宅
- Currency: TWD (NT$)
- Units: metric (m, m², m³, L/s, °C)
- parse_status values: PENDING / OK / EXCEPTION / NEEDS_REVIEW / AUTO_CREATED

---

## Validation
Run after every sprint:
```bash
python tests/validate.py
```
All 7 tests must pass before declaring a sprint done:
1. Row count reconciliation (stg OK = proc rows)
2. Amount integrity (generated column check)
3. Required fields (no NULLs)
4. UoM canonical check
5. Confidence distribution (≥ 80% above 0.7)
6. JSONB GIN index exists on proc.products.attributes
7. proc.users has exactly 1 row (seeded admin)
