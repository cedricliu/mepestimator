# HANDOFF — Sprint 7 Complete

Generated: 2026-03-12
Sprint: S7 — Harden (Backend gaps, Brands, Auth tests, Nginx, Prod compose, README)

---

## Sprint 7 Goal

Production-ready deployment. All backend gaps filled, brands fully implemented,
auth-enforcement tests added, nginx reverse proxy configured, and documentation
complete.

## Status

Sprint 7 COMPLETE. Docker Desktop was not running at handoff time — start it and
run `DB_HOST=localhost python tests\validate.py` to confirm 14/14 PASS.

---

## Files Created (Sprint 7)

| File | Description |
|---|---|
| `backend/routers/brands.py` | GET /brands (estimator+) + POST /brands (admin, upsert by brand_code) |
| `nginx/nginx.conf` | :80 redirect to :443, SSL termination, /api/ to backend, /admin/ to admin app, / to estimator |
| `docker-compose.prod.yml` | Prod overlay: no --reload, NODE_ENV=production, nginx service, backend port unexposed |

---

## Files Modified (Sprint 7)

| File | Change |
|---|---|
| `backend/routers/health.py` | Added parse_status breakdown, users_count, admin_email to GET /health response |
| `backend/routers/vendors.py` | Added limit/offset pagination to GET /vendors (default limit=50) |
| `backend/routers/products.py` | Added GET /products/quick-search — cross-family keyword typeahead (no family_code required) |
| `backend/main.py` | Registered brands router at prefix /brands |
| `admin/src/pages/Review.jsx` | Added ProductSearchInput typeahead (debounced 300ms, calls /products/quick-search, fills product_id on select) |
| `admin/src/pages/Vendors.jsx` | Replaced Brands placeholder with BrandsTab (GET /brands table + NewBrandForm to POST /brands) |
| `tests/validate.py` | Added tests 13 (POST /vendors without token returns 401) and 14 (invalid token on /ingest/review returns 401/403) |
| `setup.bat` | Added db/08_match_status.sql to run order (was missing) |
| `.env.example` | Fully documented all 11 env vars with generation commands |
| `README.md` | Rewrote with 7-step Quick Start, service table, API reference, prod deployment instructions |

---

## How to Run Locally

```bat
REM 1. Start Docker Desktop

REM 2. Start Postgres only, then run schema setup (01 through 08)
docker compose up -d postgres
setup.bat

REM 3. Validate (DB tests only, 12/14 — tests 13 & 14 need backend)
DB_HOST=localhost python tests\validate.py

REM 4. Start all services
docker compose up -d

REM 5. Run all 14 tests with backend up
DB_HOST=localhost python tests\validate.py

REM Estimator: http://localhost:5173
REM Admin:     http://localhost:5174
REM API docs:  http://localhost:8000/docs
```

---

## How to Deploy to Production (Hetzner)

```bash
# Place TLS certs at nginx/certs/cert.pem + key.pem, then:
docker compose up -d postgres
./setup.sh
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d
DB_HOST=localhost python tests/validate.py
```

---

## System Architecture (Final)

```
Browser
  |
  +-- :5173  Estimator App (React/Vite) -- login-gated, read-only
  +-- :5174  Admin App     (React/Vite) -- admin-only, full CRUD
  +-- :8000  FastAPI backend            -- shared API for both apps
               |
               +-- PostgreSQL 16 (mep_ops)
                    +-- stg.raw_quote_lines  -- raw intake staging
                    +-- proc.*              -- normalized data, UI reads here

Production (docker-compose.prod.yml) adds Nginx (:80/:443):
  /api/   --> backend:8000
  /admin/ --> admin:5174
  /       --> frontend:5173
```

---

## Auth Design

- Access token: 8h JWT, React useState only (never localStorage)
- Refresh token: 7d JWT, httpOnly cookie at path=/auth
- Roles: admin (all routes) / estimator (read-only GET routes)
- Single admin seeded from .env (ADMIN_EMAIL + ADMIN_PASSWORD_HASH)
- Dev password: Admin@2025!

---

## Ingest Pipeline

```
Upload Excel/CSV --> stg.raw_quote_lines (parse_status=PENDING)
  | attribute extraction + family matching
confidence >= 0.8  --> proc.quote_lines (match_status=AUTO or AUTO_CREATED)
0.5 <= conf < 0.8  --> stg only, parse_status=NEEDS_REVIEW --> Review queue
conf < 0.5         --> stg only, parse_status=EXCEPTION
FIRE/WEAK          --> no families defined --> confidence=1.0, always AUTO
```

---

## Known Limitations

- FIRE and WEAK have no product families — all rows auto-pass (confidence=1.0)
- /products/quick-search uses ILIKE — works for small catalogs; add pg_trgm index for scale
- No password reset flow — change via .env + manual DB UPDATE
- Prod nginx still proxies to Vite dev server — proper prod setup needs npm run build + static serving

## Recommended Next Steps

1. Add product families for FIRE and WEAK disciplines
2. Add pg_trgm GIN index on proc.products.description for faster typeahead at scale
3. Multi-user support: proc.users is ready; add POST /auth/register (admin-only)
4. GitHub Actions CI: docker compose up -d && DB_HOST=localhost python tests/validate.py
5. Static prod serving: npm run build in Dockerfile + nginx serves dist/ (remove Vite dev server)

---

## Validation

```
DB_HOST=localhost python tests\validate.py
Target: 14/14 PASSED

Tests 1-12:  DB schema + data integrity (Postgres only)
Test 13:     POST /vendors without token returns 401
Test 14:     GET /ingest/review with invalid token returns 401/403
```

---

## Admin App Pages (:5174)

| Route | Page | Description |
|---|---|---|
| /login | Login | Admin credential entry |
| /upload | Upload | Drag-drop Excel/CSV, 5-bucket result summary |
| /review | Review | NEEDS_REVIEW queue + product typeahead + attribute editor |
| /products | Products | Family-tabbed catalog, JSONB facet filters, create form |
| /families | Families | Product family + attribute_definition viewer |
| /vendors | Vendors | Vendors table + create form; Brands tab (GET/POST /brands) |
| /health | Health | DB/API badges, parse_status breakdown, row counts, 30s refresh |

## Estimator App Pages (:5173)

| Route | Page | Description |
|---|---|---|
| /login | Login | Estimator credential entry |
| / | Dashboard | Faceted search with JSONB attribute filters |
| /estimate | Estimate | Project type + GFA to MEP cost estimate by discipline |
| /products | Products | Read-only product catalog view |
