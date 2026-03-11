# MEP Pricing Intelligence System — Gap Analysis
# PRD v1.2 vs Current Codebase

Generated: 2026-03-11
Source files read: db/01–04_*.sql, backend/main.py, backend/routers/*, frontend/src/pages/Dashboard.jsx, tests/validate.py

---

## 1. Database Tables

### ✅ Tables That Already Exist

| Table | Schema | Source File | Notes |
|---|---|---|---|
| proc.project_types | proc | db/01_schemas.sql | 6 rows seeded |
| proc.mep_disciplines | proc | db/01_schemas.sql | 5 rows seeded |
| proc.uom_map | proc | db/01_schemas.sql | 21 rows seeded |
| proc.vendors | proc | db/01_schemas.sql | Created by ingest on first upload |
| proc.projects | proc | db/01_schemas.sql | Created by ingest on first upload |
| proc.quote_lines | proc | db/01_schemas.sql | Natural key unique index present |
| stg.raw_quote_lines | stg | db/01_schemas.sql | parse_status lifecycle implemented |
| proc.brands | proc | db/04_product_schema.sql | No seed data yet |
| proc.product_families | proc | db/04_product_schema.sql | 5 families seeded |
| proc.attribute_definitions | proc | db/04_product_schema.sql | Seeded for all 5 families |
| proc.products | proc | db/04_product_schema.sql | ⚠️ See violation below |
| proc.product_attributes | proc | db/04_product_schema.sql | ⚠️ Should not exist — see violation |
| proc.mv_price_stats | proc | db/03_views.sql | Materialized view, CONCURRENTLY-safe |
| proc.vw_quick_search | proc | db/03_views.sql | Wraps mv_price_stats + spread_pct |
| proc.vw_vendor_comparison | proc | db/03_views.sql | Per-vendor aggregates |
| proc.mv_product_price_stats | proc | db/04_product_schema.sql | Created WITH NO DATA |

### ❌ Tables Missing (PRD v1.2 Required)

| Table | Should be in | Purpose |
|---|---|---|
| proc.users | db/05_auth.sql | Estimator + admin accounts; JWT login |
| proc.refresh_tokens | db/05_auth.sql | httpOnly cookie rotation, revocation |

### ⚠️ Architectural Violation — EAV vs JSONB

**PRD v1.2 hard rule:** `proc.products.attributes` must be `JSONB NOT NULL DEFAULT '{}'` with a GIN index. No separate `product_attributes` EAV table.

**Current reality:** `db/04_product_schema.sql` created `proc.product_attributes` (EAV table with `product_id, attr_key, attr_value` columns) and `proc.products` has **no `attributes` JSONB column**. The backend (`products.py`) queries `proc.product_attributes` exclusively.

**Fix required:** Create `db/06_jsonb_migration.sql` that:
1. `ALTER TABLE proc.products ADD COLUMN attributes JSONB NOT NULL DEFAULT '{}'`
2. `CREATE INDEX ... USING GIN (attributes)`
3. Backfill JSONB from `proc.product_attributes` rows
4. `DROP TABLE proc.product_attributes`

Then update all queries in `backend/routers/products.py`.

### ⚠️ stg.raw_quote_lines parse_status Values

PRD mentions a `match_status` column separately from `parse_status`. Current implementation extends `parse_status` with `NEEDS_REVIEW` and `AUTO_CREATED` values (beyond the schema comment of `PENDING | OK | EXCEPTION`). This is functionally equivalent and no schema change is needed — but the column comment and any documentation should be updated.

---

## 2. API Endpoints

### Auth Endpoints

| Endpoint | Method | Auth Required | Status |
|---|---|---|---|
| /auth/login | POST | Public | ❌ Stub only — `auth.py` is 4 lines, no implementation |
| /auth/refresh | POST | httpOnly cookie | ❌ Stub only |
| /auth/logout | POST | httpOnly cookie | ❌ Stub only |

### Ingest Endpoints

| Endpoint | Method | Auth Required | Status |
|---|---|---|---|
| /ingest/upload | POST | Admin | ✅ Exists — ❌ No auth guard |
| /ingest/review | GET | Admin | ❌ Missing entirely |
| /ingest/resolve | POST | Admin | ❌ Missing entirely |

### Products Endpoints

| Endpoint | Method | Auth Required | Status |
|---|---|---|---|
| /products/families | GET | Estimator+ | ✅ Exists — ❌ No auth guard |
| /products/attributes | GET | Estimator+ | ✅ Exists — ❌ No auth guard |
| /products/all | GET | Estimator+ | ✅ Exists — ❌ No auth guard |
| /products/facets | GET | Estimator+ | ✅ Exists — ❌ No auth guard |
| /products/search | GET | Estimator+ | ✅ Exists — ❌ No auth guard |
| /products/brands | GET | Estimator+ | ✅ Exists — ❌ No auth guard |
| /products/unmatched | GET | Admin | ✅ Exists — ❌ No auth guard |
| /products/assign | PATCH | Admin | ✅ Exists — ❌ No auth guard |
| /products/match-legacy | POST | Admin | ✅ Exists — ❌ No auth guard |
| /products | POST | Admin | ❌ Missing (create new product) |

### Quotes Endpoints

| Endpoint | Method | Auth Required | Status |
|---|---|---|---|
| /quotes/search | GET | Estimator+ | ✅ Exists — ❌ No auth guard |
| /quotes/estimate | GET | Estimator+ | ✅ Exists — ❌ No auth guard |
| /quotes/trend | GET | Estimator+ | ❌ Missing |

### Vendors Endpoints

| Endpoint | Method | Auth Required | Status |
|---|---|---|---|
| /vendors | GET | Estimator+ | ✅ Exists — ❌ No auth guard |
| /vendors | POST | Admin | ❌ Missing (create vendor) |

### Health Endpoint

| Endpoint | Method | Auth Required | Status |
|---|---|---|---|
| /health | GET | Estimator+ | ✅ Exists (router registered in main.py) — ❌ No auth guard |

**Summary:** 14 endpoints exist. 0 have auth guards. 3 auth endpoints are stubs. 5 endpoints are missing entirely.

---

## 3. Frontend Pages

### frontend/ — Estimator App (:5173)

| File | Status | Notes |
|---|---|---|
| src/pages/Login.jsx | ❌ Missing | Must be created |
| src/pages/Dashboard.jsx | ✅ Exists, fully built | McMaster-style faceted search, URL state, pagination, vendor chart — ❌ No login gate |
| src/pages/Estimate.jsx | ✅ Exists | ❌ No login gate |
| src/pages/Upload.jsx | ✅ Exists — ⚠️ Wrong app | Admin function — must move to `admin/` |
| src/pages/Products.jsx | ✅ Exists — ⚠️ Wrong app | Admin function — must move to `admin/` |
| src/hooks/useAuth.js | ❌ Missing | JWT in useState, silent refresh on 401, redirect |
| src/api/client.js | ❌ Missing | Axios instance with Authorization header injection |

### admin/ — Admin App (:5174)

The `admin/` directory exists with config files only (`Dockerfile`, `package.json`, `vite.config.js`, `tailwind.config.js`, `postcss.config.js`). **No `src/` directory exists.**

| File | Status | Notes |
|---|---|---|
| src/App.jsx | ❌ Missing | React Router + admin nav |
| src/hooks/useAuth.js | ❌ Missing | Same pattern as frontend/ |
| src/api/client.js | ❌ Missing | Same pattern as frontend/ |
| src/pages/Login.jsx | ❌ Missing | |
| src/pages/Upload.jsx | ❌ Missing | Move + adapt from `frontend/src/pages/Upload.jsx` |
| src/pages/Review.jsx | ❌ Missing | New — NEEDS_REVIEW / EXCEPTION resolution queue |
| src/pages/Products.jsx | ❌ Missing | Move + adapt from `frontend/src/pages/Products.jsx`; add CRUD + JSONB editing |
| src/pages/Families.jsx | ❌ Missing | New — product family + attribute schema management |
| src/pages/Vendors.jsx | ❌ Missing | New — vendor + brand registry |
| src/pages/Health.jsx | ❌ Missing | New — system status, row counts, batch history |

---

## 4. tests/validate.py

### Current State: 10 Tests

| # | Test Name | What It Checks |
|---|---|---|
| 1 | Row count reconciliation | stg OK rows = proc.quote_lines rows per batch |
| 2 | Amount integrity | Generated column `amount = qty * unit_price` |
| 3 | Required fields | No NULLs in description, unit_price, uom, discipline, project_id |
| 4 | UoM canonical check | All proc.quote_lines.uom in proc.uom_map.canonical_uom |
| 5 | Confidence distribution | ≥80% of rows have confidence ≥ 0.7 |
| 6 | mv_price_stats refresh | REFRESH without error |
| 7 | Product tables exist | All 5 new proc tables present |
| 8 | Attribute definitions seeded | All 5 families have ≥1 attr_def |
| 9 | quote_lines.product_id exists | Column present on proc.quote_lines |
| 10 | mv_product_price_stats refresh | REFRESH without error |

### PRD v1.2 Required: 7 Tests

| # | PRD Test | Current Coverage |
|---|---|---|
| 1 | Row count reconciliation | ✅ Test 1 |
| 2 | Amount integrity | ✅ Test 2 |
| 3 | Required fields (no NULLs) | ✅ Test 3 |
| 4 | UoM canonical check | ✅ Test 4 |
| 5 | Confidence distribution (≥80% above 0.7) | ✅ Test 5 |
| 6 | **JSONB GIN index on proc.products.attributes** | ❌ Not present — and will fail (JSONB column doesn't exist yet) |
| 7 | **proc.users has exactly 1 row (seeded admin)** | ❌ Not present — and will fail (proc.users doesn't exist yet) |

**Action:** After S1 DB work (creating 05_auth.sql and 06_jsonb_migration.sql), add tests 6 & 7 to validate.py.

Note: The current validate.py tests 6–10 cover the Sprint 5/6 product catalog work and are useful regression tests even though they weren't in the original PRD v1.2 acceptance criteria list.

---

## 5. Recommended Sprint Execution Order

Given what already exists, here is the optimal order with rationale:

### Sprint 1 — Foundation: DB Auth Tables + JSONB Migration

**Deliverables:**
- `db/05_auth.sql` — `proc.users` and `proc.refresh_tokens`
- `db/06_jsonb_migration.sql` — Add `attributes JSONB` + GIN index to `proc.products`; backfill from EAV; drop `proc.product_attributes`
- Update `db/02_seed_data.sql` — Admin user seed from `.env`
- Update `tests/validate.py` — Add PRD tests 6 (GIN index) and 7 (proc.users count)

**Why first:** All backend auth code and product attribute queries depend on schema. Backend cannot be written before DB tables exist. JSONB migration must happen before any backend attribute query changes.

**Dependency:** None — pure DDL/SQL.

---

### Sprint 2 — Auth: JWT Login End-to-End

**Deliverables:**
- Implement `backend/routers/auth.py` — `POST /auth/login`, `POST /auth/refresh`, `POST /auth/logout`
  - python-jose JWT, bcrypt verify, httpOnly cookie for refresh token
  - Access token: 8 hours, returned in JSON; Refresh token: 7 days, httpOnly cookie only
- Add auth dependencies to `backend/main.py` — `get_current_user`, `require_estimator`, `require_admin`
- Add auth guards to all existing endpoints in ingest.py, products.py, quotes.py, vendors.py, health.py

**Why second:** Every subsequent sprint depends on working auth. All existing endpoints need guards before any frontend can be built properly.

**Dependency:** S1 (proc.users must exist).

---

### Sprint 3 — Ingest Hardening (can run parallel with S4)

**Deliverables:**
- `POST /ingest/upload` — add `require_admin` guard (currently unguarded)
- `GET /ingest/review` — query `stg.raw_quote_lines WHERE parse_status IN ('NEEDS_REVIEW', 'EXCEPTION')` with pagination
- `POST /ingest/resolve` — accept `{raw_id, action, product_id?}`, update parse_status, optionally assign product_id to proc.quote_lines

**Dependency:** S2 (auth middleware must exist).

---

### Sprint 4 — Product Catalog: JSONB + Admin Endpoints (can run parallel with S3)

**Deliverables:**
- Update `backend/routers/products.py` — rewrite all attribute queries to use `proc.products.attributes` JSONB instead of `proc.product_attributes`
- `POST /products` — admin endpoint to create a new product with JSONB attributes
- `POST /vendors` — admin endpoint to create a vendor

**Dependency:** S1 (JSONB column), S2 (auth guards).

---

### Sprint 5 — Estimator App: Login Gate + Auth Hooks

**Deliverables:**
- `frontend/src/pages/Login.jsx`
- `frontend/src/hooks/useAuth.js` — JWT in useState, silent refresh on 401, redirect to /login
- `frontend/src/api/client.js` — axios instance, inject `Authorization: Bearer <token>` header
- Wrap Dashboard.jsx and Estimate.jsx with login gate (redirect to /login if no token)

**Dependency:** S2 (auth API must be working end-to-end).

---

### Sprint 6 — Admin App: Full Admin UI

**Deliverables:**
- Bootstrap `admin/src/` — App.jsx, hooks/useAuth.js (same pattern as frontend/), api/client.js
- `admin/src/pages/Login.jsx`
- `admin/src/pages/Upload.jsx` — adapted from `frontend/src/pages/Upload.jsx` + admin token
- `admin/src/pages/Review.jsx` — NEEDS_REVIEW queue, approve/reject/assign actions via `/ingest/resolve`
- `admin/src/pages/Products.jsx` — adapted from `frontend/src/pages/Products.jsx` + CRUD + JSONB attribute editing
- `admin/src/pages/Families.jsx` — product family + attribute schema management
- `admin/src/pages/Vendors.jsx` — vendor + brand registry
- `admin/src/pages/Health.jsx` — system status, row counts, recent batch history

**Dependency:** S3 (`/ingest/review`, `/ingest/resolve`), S4 (`POST /products`, `POST /vendors`), S5 (auth hook pattern).

---

### Sprint 7 — Harden: Production Ready

**Deliverables:**
- Nginx reverse proxy config (Hetzner VPS) — routes :5173 (frontend), :5174 (admin), :8000 (API)
- `docker-compose.yml` — verify admin service at :5174 is present; add prod profile if needed
- README update
- Final `python tests/validate.py` — all 7 PRD tests must pass (currently 5/7)

**Dependency:** All prior sprints.

---

## Critical Path

```
S1 (DB schema)
  └─→ S2 (Auth backend)
        ├─→ S3 (Ingest hardening) ─────────────┐
        ├─→ S4 (Products JSONB + endpoints) ────┤
        └─→ S5 (Estimator frontend)             │
                                                 ↓
                                          S6 (Admin frontend)
                                                 ↓
                                          S7 (Harden)
```

S3 and S4 are independent of each other and can run in parallel after S2.
S5 can begin after S2 and run in parallel with S3/S4.
S6 requires S3, S4, and ideally S5 (to reuse auth hook pattern).
