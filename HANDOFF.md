# HANDOFF — Sprint 5 Complete
# MEP Pricing Intelligence System — Estimator App JWT Auth

Generated: 2026-03-11
Sprint: S5 — Estimator App (JWT login gate + authenticated search)

---

## Sprint 5 Goal
Add JWT login gate and authenticated axios client to the estimator frontend app (:5173).

## Status
Sprint 5 COMPLETE. All S5 deliverables implemented, Docker container rebuilt and running, 12/12 validate.py tests PASSED.

---

## Files Created (Sprint 5)

| File | Description |
|---|---|
| `frontend/src/hooks/useAuth.js` | JWT hook — token in useState, login/refresh/logout, refresh deduplication via useRef |
| `frontend/src/api/client.js` | axios factory — Bearer injection, 401 silent refresh + retry, navigate('/login') on failure |
| `frontend/src/pages/Login.jsx` | Estimator login form — email/password, stores token via AuthContext, redirects to / |

---

## Files Modified (Sprint 5)

| File | Change |
|---|---|
| `frontend/package.json` | Added `"axios": "^1.6.8"` to dependencies |
| `frontend/src/App.jsx` | Full rewrite: AuthContext + ApiContext + ProtectedRoute + InnerApp pattern (mirrors admin/src/App.jsx), logout button in NavBar |
| `frontend/src/pages/Dashboard.jsx` | Replaced all fetch() with api.get() from ApiContext; added `useContext(ApiContext)`; preserved all filter/display/pagination/abort logic |
| `frontend/src/pages/Estimate.jsx` | Replaced fetch() with api.get('/quotes/estimate') from ApiContext; preserved all display logic |
| `frontend/src/pages/Products.jsx` | Replaced fetch() with api.get('/products/all') from ApiContext; removed write operations (AssignControl, UnmatchedTable) — estimator read-only view |
| `frontend/src/pages/Upload.jsx` | Added auth guard (Navigate to /login if token null); replaced fetch() with api.post('/ingest/upload') from ApiContext |

---

## Docker Build Result
- Image built: `docker build -t mep_db-frontend ./frontend` — SUCCESS
- npm install took ~2200s (fresh node_modules with new axios dependency)
- Container restarted: `docker compose up -d frontend` — SUCCESS
- Container status: `mep_frontend` Up, port 0.0.0.0:5173->5173/tcp, created 2026-03-11 14:18:58

---

## Validation Result
```
DB_HOST=localhost python tests/validate.py
Result: 12/12 PASSED
```
All 12 tests pass. No regressions from S4.

---

## Key Decisions Made

1. **AuthContext exported from App.jsx** — Login.jsx imports `useAuthContext` from `../App` (same pattern as admin/).
2. **ApiContext via useMemo** — `createApiClient(() => auth.token, auth.refresh, navigate)` memoized on `auth.token` changes to avoid redundant interceptor recreation.
3. **Products.jsx estimator is read-only** — Removed `AssignControl` and `UnmatchedTable` (write operations). Admin CRUD remains in `admin/src/pages/Products.jsx`. Estimator sees paginated read-only catalogue.
4. **Dashboard abort handling** — axios uses `CanceledError` (not `AbortError`) for AbortController signals. Both names are caught to avoid spurious state resets on navigation.
5. **Upload.jsx stays in frontend/** — Per sprint plan, it moves to admin/ in S6. For now it has an auth guard (Navigate to /login if no token) and uses the authenticated api client.
6. **Login.jsx redirects to /** — Unlike admin/ which goes to /products, the estimator Login.jsx redirects to / (Dashboard).

---

## Architecture (post-S5)

```
frontend/ (:5173) — Estimator App
  src/
    hooks/useAuth.js     NEW — JWT in useState, login/refresh/logout
    api/client.js        NEW — axios + 401 interceptor
    App.jsx              UPDATED — AuthContext, ApiContext, ProtectedRoute, NavBar with logout
    pages/
      Login.jsx          NEW — email+password form, redirects to /
      Dashboard.jsx      UPDATED — api from ApiContext replaces all fetch()
      Estimate.jsx       UPDATED — api from ApiContext replaces fetch()
      Products.jsx       UPDATED — read-only, api from ApiContext replaces fetch()
      Upload.jsx         UPDATED — auth guard + api client replaces fetch()
```

---

## Next Sprint: S6 — Admin App Pages

### Goal
Complete the admin/ app with all operational pages: Upload, Review, Vendors, Health.

### Files to Create in admin/src/pages/
1. **Upload.jsx** — Move from frontend/src/pages/Upload.jsx; requires admin role; uses admin api client
2. **Review.jsx** — NEEDS_REVIEW queue: GET /ingest/review → list stg rows with parse_status=NEEDS_REVIEW; POST /ingest/resolve to resolve each with JSONB attribute fields
3. **Vendors.jsx** — GET /vendors (read list) + POST /vendors (create vendor) + brand registry management
4. **Health.jsx** — GET /health + row counts (proc.quote_lines, stg.raw_quote_lines by parse_status) + batch history

### Files to Extend in admin/
- `admin/src/App.jsx` — Add routes for Upload, Review, Vendors, Health; add NavLinks

### Backend endpoints to verify before building UI
- GET /ingest/review (admin guard) — returns NEEDS_REVIEW rows from stg
- POST /ingest/resolve (admin guard) — accepts line_id + product_id or attributes
- GET /vendors (estimator+) — list vendors
- POST /vendors (admin) — create vendor
- GET /health (estimator+) — system status

### First steps for S6
1. Read `admin/src/App.jsx` to see current routes and NavLinks
2. Read `backend/routers/ingest.py` sections for /review and /resolve response shapes
3. Read `backend/routers/vendors.py` to understand GET/POST /vendors response shapes
4. Create admin/src/pages/Review.jsx
5. Create admin/src/pages/Vendors.jsx
6. Create admin/src/pages/Health.jsx
7. Create admin/src/pages/Upload.jsx (adapt from frontend/ version, add admin note)
8. Update admin/src/App.jsx — new routes + NavLinks
9. Rebuild admin Docker container: `docker compose up -d --build admin`
10. Run `DB_HOST=localhost python tests/validate.py`

### Hard rules for S6
- Admin pages go in admin/ only — never frontend/
- All API calls use the admin api client from ApiContext (already wired in admin/src/App.jsx)
- POST /ingest/resolve must include admin JWT (enforced server-side)
- No new DB schema changes expected for S6
- Run validate.py after S6 — expect 12/12 PASSED
