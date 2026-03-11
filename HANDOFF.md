# HANDOFF — Sprint 4 Complete
# MEP Pricing Intelligence System — JSONB Products + Admin UI Foundation

Generated: 2026-03-11
Sprint: S4 — Product Catalog (JSONB Facets + Admin App)

---

## What Was Built

### Phase 1 — Backend: backend/routers/products.py (full rewrite)

All references to the dropped `proc.product_attributes` EAV table have been removed.
Every query now reads from `proc.products.attributes` JSONB directly (GIN-indexed).

#### Endpoints fixed / rewritten:

| Endpoint | Fix |
|---|---|
| GET /products/attributes | Replaced EAV JOIN with correlated subquery on `pr.attributes ->> ad.attr_key` |
| GET /products/all | Replaced `jsonb_object_agg(pa.*)` subquery with `pr.attributes` column reference |
| GET /products/facets | Replaced `JOIN proc.product_attributes pa` with `pr.attributes ? ad.attr_key` + `pr.attributes ->> ad.attr_key` |
| GET /products/search | (1) attr filter: `EXISTS (product_attributes)` → `pr.attributes ->> %s = ANY(%s)`; (2) attributes subquery → `pr.attributes` |
| GET /products/search | Added `q` keyword param: FTS + ILIKE combo on `pr.description` |

#### New endpoint: POST /products (admin only)
- Body: `{family_code, description, brand_id?, attributes?}`
- Validates `family_code` + `brand_id` if provided
- Auto-assigns `product_code`: `{DISC[0]}-{FAMILY_CODE}-{SEQ:04d}`, collision-safe loop
- Returns full row with `product_code`, `product_id`, `attributes`

### Phase 2 — Frontend: admin/ src/ scaffolding (NEW)

#### Files created:
```
admin/
  index.html                  NEW — Vite entry point, lang=zh-TW
  package.json                UPDATED — added axios ^1.6.8
  src/
    index.css                 NEW — Tailwind @tailwind directives
    main.jsx                  NEW — ReactDOM.createRoot entry
    App.jsx                   NEW — BrowserRouter + AuthContext + ApiContext
    hooks/
      useAuth.js              NEW — JWT in useState, login/refresh/logout
    api/
      client.js               NEW — axios instance + 401 silent refresh interceptor
    pages/
      Login.jsx               NEW — email/password form
      Products.jsx            NEW — family tabs + facet filters + product cards + create form
      Families.jsx            NEW — expandable family list + attribute_definitions table
```

#### Auth pattern (per PRD 7.2):
- `useAuth.js`: access token in `useState`, never localStorage/sessionStorage
- `client.js`: axios interceptor injects `Authorization: Bearer <token>`, on 401 silently calls `POST /auth/refresh`, retries once, then `navigate('/login')`
- Refresh deduplication: `useRef(refreshPromise)` prevents multiple concurrent refresh calls

#### App.jsx design:
- `AuthContext` + `ApiContext` provided from root
- `createApiClient(getToken, refresh, navigate)` factory called in `InnerApp` (inside BrowserRouter)
- `ProtectedRoute` redirects to `/login` if `token === null`
- Routes: `/login`, `/products`, `/families` (others redirect to `/products`)

#### Products.jsx features:
- Left panel: family tabs (GET /products/families) + JSONB attribute checkboxes (GET /products/facets)
- Right panel: product cards with attribute chips + avg/min/max price stats + quote count
- Keyword search (q param) + page navigator
- "新增品項" inline form → POST /products with JSON attributes textarea
- Optimistic UI: newly created product prepended to list

#### Families.jsx features:
- Grouped by discipline with color-coded discipline badges
- Lazy-load: attribute_definitions fetched on first expand (GET /products/attributes)
- `AttributeTable`: attr_key, label_zh, value_type, unit, distinct values (up to 8 chips)

---

## Backend Test Results

```
GET /products/families     → count=5
GET /products/facets       → family=EMT_CONDUIT, facets=['diameter','material','standard','length_m']
GET /products/search       → total=3, first_code=EMT-1/2-TECO
GET /products/attributes   → count=4 keys for WIRE_CABLE
POST /products             → product_code=E-EMT_CONDUIT-0004
GET /products/search+attrs → total=3 (insulation=PVC filter working)
```

---

## Decisions Made

| Decision | Rationale |
|---|---|
| `pr.attributes ->> %s = ANY(%s)` | attr_key passed as param (whitelisted first); ANY() gives OR-within-key |
| `createApiClient` in InnerApp | `useNavigate` must be inside BrowserRouter; InnerApp is child |
| Families page lazy-load attrs | Avoids page-load N+1; correct pattern for Sprint 7 CRUD |
| axios added to admin/package.json | Required for client.js; installed at Docker build time |

---

## validate.py Result

```
Result: 12/12 PASSED
```

---

## Current State After Sprint 4

| Item | Status |
|---|---|
| products.py — all EAV refs | REWRITTEN to JSONB |
| POST /products | NEW |
| GET /products/search + q | NEW keyword param |
| admin/index.html | NEW |
| admin/src/main.jsx + index.css | NEW |
| admin/src/App.jsx | NEW — auth context + protected routes |
| admin/src/hooks/useAuth.js | NEW — token in useState |
| admin/src/api/client.js | NEW — axios + 401 interceptor |
| admin/src/pages/Login.jsx | NEW |
| admin/src/pages/Products.jsx | NEW |
| admin/src/pages/Families.jsx | NEW (read-only) |
| admin/src/pages/Upload.jsx | NOT YET — Sprint 6 |
| admin/src/pages/Review.jsx | NOT YET — Sprint 6 |
| admin/src/pages/Vendors.jsx | NOT YET — Sprint 6 |
| admin/src/pages/Health.jsx | NOT YET — Sprint 6 |
| frontend/ login gate | NOT YET — Sprint 5 |

---

## Sprint 5 — Exact Next Steps

**Goal:** Estimator App — JWT login gate + authenticated search + estimate

### What Sprint 5 must build in frontend/:
1. **frontend/src/hooks/useAuth.js** — same pattern as admin: token in useState, silent refresh
2. **frontend/src/api/client.js** — axios factory, 401 interceptor
3. **frontend/src/pages/Login.jsx** — estimator login form (role=estimator OR admin both OK)
4. **frontend/src/App.jsx** — add AuthContext + ApiContext, wrap routes in ProtectedRoute
5. **frontend/src/pages/Dashboard.jsx** — switch all fetch() calls to use axios api client with auth header; verify JSONB facet filters still work with /products/facets shape
6. **frontend/src/pages/Estimate.jsx** — add auth header; verify quotes/estimate endpoint works
7. **frontend/src/pages/Products.jsx** (in frontend/) — estimator gets read-only view, no create button

### Agent: frontend-engineer
### Depends on: S4 complete

---

## File Map After Sprint 4

```
backend/
  routers/
    products.py       REWRITTEN — JSONB throughout, POST /products added

admin/
  index.html          NEW
  package.json        Updated (axios)
  src/
    main.jsx          NEW
    index.css         NEW
    App.jsx           NEW
    hooks/useAuth.js  NEW
    api/client.js     NEW
    pages/
      Login.jsx       NEW
      Products.jsx    NEW
      Families.jsx    NEW
```
