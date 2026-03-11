# HANDOFF — Sprint 6 Complete

Generated: 2026-03-11
Sprint: S6 — Admin App Pages (Upload, Review, Vendors, Health)

---

## Sprint 6 Goal

Complete the admin app with all operational pages. Admin can now upload bid files, resolve NEEDS_REVIEW rows, manage vendors, and monitor system health — all via the admin UI at http://localhost:5174.

## Status

Sprint 6 COMPLETE. All deliverables implemented, Docker containers rebuilt and running, 12/12 validate.py tests PASSED.

---

## Files Created (Sprint 6)

| File | Description |
|---|---|
| `admin/src/pages/Upload.jsx` | Drag-drop upload, 5-bucket result summary, "前往審查" button when NEEDS_REVIEW > 0, collapsible exception table |
| `admin/src/pages/Review.jsx` | Paginated NEEDS_REVIEW queue, expandable cards with editable attribute_raw inputs, confirm/skip actions, success toast |
| `admin/src/pages/Vendors.jsx` | Two-tab UI: Vendors table (GET /vendors) + inline new vendor form (POST /vendors) + Brands placeholder |
| `admin/src/pages/Health.jsx` | System status dashboard, DB/API color-coded badges, 30s auto-refresh, raw JSON debug panel |

---

## Files Modified (Sprint 6)

| File | Change |
|---|---|
| `admin/src/App.jsx` | Added imports + 4 routes (/upload, /review, /vendors, /health) + 4 NavLinks with pipe separators |
| `backend/routers/vendors.py` | Added POST /vendors endpoint (admin-only, ON CONFLICT upsert) |
| `docker-compose.yml` | Changed admin node_modules from anonymous volume to named volume `mep_admin_modules` (Windows workaround) |

---

## Docker Container Status

All 4 containers running:

```
NAME           IMAGE             STATUS    PORTS
mep_admin      mep_db-admin      Up        0.0.0.0:5174->5174/tcp
mep_backend    mep_db-backend    Up        0.0.0.0:8000->8000/tcp
mep_frontend   mep_db-frontend   Up        0.0.0.0:5173->5173/tcp
mep_postgres   postgres:16       Up        0.0.0.0:5432->5432/tcp
```

---

## Validation Result

```
DB_HOST=localhost python tests/validate.py
Result: 12/12 PASSED
```

---

## Windows Docker Note: admin node_modules volume

On Windows Docker Desktop, anonymous volumes (`/app/node_modules`) don't reliably inherit image layer content when a host bind mount covers the parent path.

**Fix applied**: Named volume `mep_admin_modules` declared in docker-compose.yml. The volume was populated using:

```bash
docker run --rm \
  -v "c:/Users/cedric.liu/mep_db/admin:/app" \
  -v "mep_db_mep_admin_modules:/app/node_modules" \
  mep_db-admin \
  sh -c "cd /app && npm install"
```

**If containers are ever wiped** (`docker compose down -v`), re-run the above before `docker compose up -d admin`.

**On Linux** (prod server), the anonymous volume approach works fine — the named volume is a Windows-only workaround.

---

## Browser Verification Checklist

Manual verification to perform at http://localhost:5174:

- [ ] Login with admin credentials (Admin@2025!)
- [ ] NavBar shows all 6 links with separators; active link highlighted
- [ ] /upload — drag-drop a CSV → 5-bucket summary; "前往審查" button visible if NEEDS_REVIEW > 0
- [ ] /review — pending rows load as expandable cards; expand reveals attrs + product_id input; confirm with valid product_id removes card
- [ ] /vendors — vendor table loads from GET /vendors; "新增廠商" form creates vendor and appends row
- [ ] /vendors → Brands tab — shows TODO placeholder (not an error state)
- [ ] /health — green API + DB badges; quote_lines and vendors counts shown; auto-refreshes every 30s
- [ ] Logout → redirect to /login; accessing /review directly redirects to /login (ProtectedRoute)

---

## Decisions Made

1. **POST /vendors backend added in Sprint 6**: The spec implied a vendor create UI but the router had no POST endpoint. Added it with upsert semantics (ON CONFLICT DO UPDATE by vendor_code). Returns the created/updated vendor row matching the GET /vendors shape.

2. **Brands tab as placeholder**: GET /brands does not exist in the backend. The tab shows a clear TODO note rather than an error, to keep the navigation structure in place for Sprint 7.

3. **Review page product_id input**: Admin must paste a UUID from the product catalogue. Sprint 7 should add a product search typeahead against /products/search to improve UX.

4. **Named Docker volume for admin node_modules**: Changed from anonymous to `mep_admin_modules` named volume. This is a Windows-only workaround — on Linux (prod) the Dockerfile anonymous volume approach works correctly.

5. **Health page users/parse_status**: GET /health doesn't return users count or parse_status breakdown. Health.jsx shows "—" and a TODO note. Sprint 7 should extend health.py to include this data.

---

## Next: Sprint 7 — Harden

### Goal

Production-ready deployment on Hetzner VPS with Nginx reverse proxy and all tests green.

### Backend Tasks

- Extend `GET /health` to return parse_status breakdown (counts per status) and proc.users count + admin email
- Add `GET /brands` endpoint (or return empty list with 501 until brands table exists)
- Add pagination to `GET /vendors` (limit/offset params)
- Audit all routers for missing error handling edge cases

### Admin UI Tasks

- Review page: add product search typeahead (call /products/search) to help find product_id for resolution
- Vendors page: implement Brands tab when GET /brands endpoint exists
- Families page: add CRUD for attribute_definitions (currently read-only per Sprint 4 note)

### Infrastructure Tasks

- `nginx.conf`: reverse proxy + SSL termination (:80/:443 → :8000/:5173/:5174)
- `docker-compose.prod.yml`: NODE_ENV=production, Vite build output served by nginx (not dev server)
- `.env.example`: all required variables documented
- `setup.sh` and `setup.bat`: verify they run SQL files 01→08 in correct order
- Remove `--reload` flag from backend command in prod profile

### Testing Tasks

- `tests/validate.py`: add test 13 — POST /vendors returns 401 without token
- `tests/validate.py`: add test 14 — GET /ingest/review returns 403 for estimator JWT

### First Steps for S7

1. Read `backend/routers/health.py` and extend to add parse_status breakdown + user count
2. Add GET /brands stub to vendors.py or a new brands.py router
3. Write nginx.conf and docker-compose.prod.yml
4. Run `docker compose -f docker-compose.prod.yml up -d` and verify build output
5. Run `DB_HOST=localhost python tests/validate.py` — expect 14/14 PASSED after adding 2 new tests
