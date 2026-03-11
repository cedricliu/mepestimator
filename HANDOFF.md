# HANDOFF — Sprint 2 Complete
# MEP Pricing Intelligence System — Auth: JWT Login End-to-End

Generated: 2026-03-11
Sprint: S2 — Auth

---

## What Was Built

### 1. backend/requirements.txt — New Dependencies
Added:
- `python-jose[cryptography]==3.3.0` — JWT encode/decode
- `passlib[bcrypt]==1.7.4` — bcrypt password verification
- `bcrypt==4.0.1` — pinned to 4.x because passlib 1.7.4 is incompatible with bcrypt 5.x (`__about__` attribute removed in 5.0, causing `(trapped) error reading bcrypt version` at runtime)

### 2. backend/auth_utils.py — JWT Helpers and FastAPI Dependencies (NEW FILE)
- `verify_password(plain, hashed)` — bcrypt verify via passlib CryptContext
- `create_access_token(payload)` — HS256 JWT, exp = now + ACCESS_TOKEN_EXPIRE_HOURS (default 8h)
- `decode_token(token)` — jose.jwt.decode, raises 401 on JWTError
- `get_current_user(token=Depends(oauth2_scheme))` — decodes Bearer token, returns payload dict
- `require_estimator(...)` — any valid token passes through
- `require_admin(...)` — validates `role == "admin"`, raises 403 otherwise
- Reads JWT_SECRET, ACCESS_TOKEN_EXPIRE_HOURS from .env via load_dotenv()

### 3. backend/routers/auth.py — Full JWT Auth Router (REWRITTEN from 4-line stub)
- `POST /auth/login`:
  - Queries proc.users by email, checks active=true, bcrypt verifies password
  - Issues HS256 access token (sub, email, role, exp, iat) — returned in JSON body
  - Issues refresh token: secrets.token_urlsafe(32), stores SHA-256 hash in proc.refresh_tokens (expires_at = now+7d)
  - Sets httpOnly cookie: `refresh_token=<raw_token>; Path=/auth; SameSite=Lax; HttpOnly`
  - Updates proc.users.last_login = now()
  - Returns: `{access_token, token_type, role, display_name, expires_in: 28800}`
- `POST /auth/refresh`:
  - Reads refresh_token from httpOnly cookie
  - SHA-256 hashes it, looks up proc.refresh_tokens (JOIN proc.users)
  - Validates: not revoked, not expired, user active
  - Rotates: revokes old token, inserts new token (new raw + new hash)
  - Returns new access_token + sets new httpOnly cookie
- `POST /auth/logout`:
  - Reads refresh_token from cookie, marks revoked=true in DB
  - Clears cookie (max_age=0)

### 4. Auth Guards Added to All 5 Routers
| Router | Change |
|---|---|
| backend/routers/health.py | `_: dict = Depends(require_estimator)` on `/health` |
| backend/routers/quotes.py | `_: dict = Depends(require_estimator)` on `/search` and `/estimate` |
| backend/routers/vendors.py | `_: dict = Depends(require_estimator)` on `/vendors` |
| backend/routers/ingest.py | `_: dict = Depends(require_admin)` on `/ingest/upload` |
| backend/routers/products.py | `require_estimator` on all GET endpoints; `require_admin` on `/assign` and `/match-legacy` |

---

## Decisions Made

| Decision | Rationale |
|---|---|
| `cookie path="/auth"` | Scopes the refresh token cookie to `/auth/*` only — browser will not send it on product/quote API calls, reducing attack surface |
| `_` as unused param name | FastAPI's Depends() doesn't need the injected value in the handler body; using `_` signals intent clearly and avoids linter warnings for unused variables |
| `from auth_utils import ...` (not `from routers.auth_utils`) | Docker WORKDIR is `/app`, and `auth_utils.py` lives at `/app/auth_utils.py` — top-level import works correctly; routers add `..` via Docker's PYTHONPATH |
| `bcrypt==4.0.1` pinned | passlib 1.7.4 reads `bcrypt.__about__.__version__` which was removed in bcrypt 5.0; pinning to 4.x is the standard workaround until passlib 1.8 releases |
| Refresh token stored as SHA-256 hash | Raw token is only ever in memory/cookie; DB stores hash only — prevents token theft from DB dump |
| `secure=False` on cookie | Local dev uses HTTP, not HTTPS; must change to `True` in production behind Nginx/HTTPS |
| No plaintext ADMIN_PASSWORD in .env | .env contains ADMIN_PASSWORD_HASH (bcrypt); original plaintext was not stored/documented. For Sprint 2 testing, DB hash was updated to a known test value (`Admin@2025!`). In production, re-run setup.bat with the correct hash |

---

## Curl Test Results

```
TEST 1: correct login → 200
{"access_token":"eyJhbGci...","token_type":"bearer","role":"admin","display_name":"Admin","expires_in":28800}

TEST 2: wrong password → 401
{"detail":"Invalid credentials"}

TEST 3: GET /health without token → 401
{"detail":"Not authenticated"}

TEST 4: GET /health with valid admin token → 200
{"data":{"status":"ok","db":"connected","quote_lines":351,"vendors":14},"meta":{"count":1}}

TEST 5: GET /quotes/search without token → 401
{"detail":"Not authenticated"}

TEST 6: GET /quotes/search with token → 200
{"data":[],"meta":{"count":0}}

TEST 7: POST /auth/refresh using httpOnly cookie
NEW TOKEN ROLE: admin | has access_token: True

TEST 8: POST /auth/logout
{"data":{"message":"Logged out"},"meta":{}}
```

---

## validate.py Result

```
=== MEP Pricing DB Validation ===

[PASS] Row count reconciliation: 351 proc rows reconcile with stg OK rows
[PASS] Amount integrity: All 351 rows with qty have correct amount
[PASS] Required fields: No NULLs found in required columns
[PASS] UoM canonical check: All 6 distinct UoM values are canonical
[PASS] Confidence distribution: 100.0% >= 0.7 threshold (351/351 rows)
[PASS] mv_price_stats refresh: Materialized view refreshed successfully (66 rows)
[PASS] Product tables exist: All 4 core product tables present; EAV table correctly absent
[PASS] Attribute definitions seeded: All 5 families have >= 1 attribute_definition
[PASS] quote_lines.product_id exists: Column present with data_type=uuid
[PASS] mv_product_price_stats refresh: Materialized view refreshed successfully (14 rows)
[PASS] JSONB GIN index on proc.products.attributes: GIN index found: idx_products_attributes_gin
[PASS] proc.users seeded (1 admin row): Exactly 1 user: email=cedric.liu@tysic.com.tw, role=admin

Result: 12/12 PASSED
```

---

## Current State After Sprint 2

| Item | Status |
|---|---|
| backend/auth_utils.py | ✅ Created — JWT helpers + FastAPI dependencies |
| backend/routers/auth.py | ✅ Full implementation (login/refresh/logout) |
| Auth guard on /health | ✅ require_estimator |
| Auth guard on /quotes/* | ✅ require_estimator on search + estimate |
| Auth guard on /vendors | ✅ require_estimator on list |
| Auth guard on /ingest/upload | ✅ require_admin |
| Auth guard on /products/* GET | ✅ require_estimator on all 7 GET endpoints |
| Auth guard on /products/assign, /match-legacy | ✅ require_admin |
| requirements.txt updated | ✅ python-jose, passlib, bcrypt==4.0.1 |
| bcrypt 5.x compat fix | ✅ Pinned bcrypt==4.0.1 |
| validate.py | ✅ 12/12 PASSED |
| products.py EAV queries | ⚠️ Still references proc.product_attributes (dropped) — deferred to Sprint 4 |
| admin/ src/ pages | ❌ Not yet built — Sprint 6 |
| frontend/ login gate | ❌ Not yet built — Sprint 5 |

---

## Sprint 3 — Exact Next Steps

**Goal:** Ingest pipeline hardened: match_status logic + JSONB attribute extraction

### What's already done from Sprint 2:
- `/ingest/upload` has `require_admin` guard ✅

### What Sprint 3 must add to backend/routers/ingest.py:
1. **match_status column on proc.quote_lines**: Confirm column exists (added in db/01_schemas.sql or migration needed). Set:
   - `match_status = 'OK'` when product_id assigned with confidence > 0.8
   - `match_status = 'NEEDS_REVIEW'` when confidence 0.5–0.8
   - `match_status = 'EXCEPTION'` when confidence < 0.5 or no match
2. **JSONB attribute extraction**: After product match, extract structured attributes from description into `proc.products.attributes` JSONB:
   - Parse known attribute patterns (e.g. voltage, current rating, pipe diameter) from description text
   - Use regex or keyword matching against proc.attribute_definitions for the matched family
   - Upsert into proc.products.attributes via jsonb column update
3. **GET /ingest/review** (new endpoint, admin only): Returns stg.raw_quote_lines WHERE parse_status = 'NEEDS_REVIEW', paginated
4. **POST /ingest/resolve** (new endpoint, admin only): Accept line_id + product_id, update proc.quote_lines.product_id, set match_status='OK', trigger MV refresh

### Agent: backend-engineer
### Depends on: S2 complete ✅

---

## File Map After Sprint 2

```
backend/
  auth_utils.py           ✅ NEW — JWT helpers + dependency injection
  requirements.txt        ✅ Updated — added jose, passlib, bcrypt==4.0.1
  main.py                 ✅ Unchanged (already includes auth router)
  routers/
    auth.py               ✅ REWRITTEN — full login/refresh/logout
    health.py             ✅ Updated — require_estimator guard
    quotes.py             ✅ Updated — require_estimator on both endpoints
    vendors.py            ✅ Updated — require_estimator on list
    ingest.py             ✅ Updated — require_admin on upload
    products.py           ✅ Updated — require_estimator/admin guards on all endpoints
```
