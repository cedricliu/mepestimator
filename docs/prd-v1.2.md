MEP Pricing Intelligence System
機電工程歷史報價資料庫
Product Requirements Document  |  v1.2  |  March 2026


CONFIDENTIAL — INTERNAL USE ONLY

  Changes in v1.2 — Auth + Two-App Architecture (highlighted in green)
●	Section 2 (Users): Roles formalized — estimator (read-only) and admin (full write). Both must log in.
●	Section 4 (Data Model): New table proc.users added — stores role, hashed password. Seeded with one admin from .env. Ready for multi-user (Option C) without schema changes.
●	Section 4 (Data Model): New table proc.refresh_tokens added — for JWT refresh token rotation.
●	Section 5 (Excel Intake): No change — auth does not affect intake format.
●	Section 6 (API): New auth endpoints added: POST /auth/login, POST /auth/refresh, POST /auth/logout.
●	Section 6 (API): All write endpoints (ingest, products POST, vendors POST) require Authorization: Bearer <token> with admin role.
●	Section 6 (API): All read endpoints (search, estimate, facets) require Bearer token with estimator or admin role.
●	Section 7 (UI): Two separate React apps — frontend/ (Estimator App :5173) and admin/ (Admin App :5174).
●	Section 7 (UI): Both apps have a /login page. Estimator app shows read-only UI after login. Admin app shows full CRUD UI.
●	Section 7 (UI): JWT stored in React memory (useState) — NOT localStorage. Token refreshed silently every 7.5 hours.
●	Section 8 (Infra): docker-compose.yml updated — frontend service on :5173, admin service on :5174, both point to :8000 API.
●	Section 9 (Sprint Plan): Sprint 1 updated — users table seeded. Sprint 2 updated — auth endpoints built first before ingest.
●	Section 10 (Prompts): All sprint prompts updated with auth requirements.
●	Section 11 (Glossary): JWT, refresh token, role terms added.
●	New Section 12: Auth upgrade path — how to move from single admin (.env) to full multi-user (Option C) later.

1. Purpose & Scope
This document defines the complete product requirements for the MEP Pricing Intelligence System — a purpose-built PostgreSQL-backed web application that replaces the 3–5 day vendor quote cycle with instant historical price lookups for MEP bid estimation.

1.1 Architecture Summary
The system consists of three deployed services:

Service	URL (dev)	Who uses it	Auth required
Estimator App (React)	http://localhost:5173	Bidding team — search + estimate	Yes — estimator role login
Admin App (React)	http://localhost:5174	Admin — upload, review, manage catalog	Yes — admin role login
FastAPI Backend	http://localhost:8000	Both apps call this API	JWT token on every request

  ℹ  Two separate React apps share one backend. Estimators never see admin UI. Admin never ships to estimators.  

1.2 Auth Design Decisions
Decision	Choice	Rationale
Who must log in	Everyone — estimator and admin	Internal tool — read access still requires auth (Option B)
Auth mechanism	JWT (access token + refresh token)	Stateless, industry standard, easy to extend
Token storage	React memory (useState) — NOT localStorage	Prevents XSS token theft
Token lifespan	Access: 8 hours  |  Refresh: 7 days	8hr covers a full workday without re-login
User store now	One admin in .env (ADMIN_EMAIL + ADMIN_PASSWORD_HASH)	Fastest path to working prototype
User store later	proc.users table with roles — already in schema	Zero schema change needed to add users
Role model	estimator (read) | admin (read + write)	Matches actual team structure

2. User Stories
2.1 Estimator (read-only after login)
#	Story	Auth needed
U01	Log in with email + password to access the estimator app	None — public login page
U02	Search by product family and filter by attributes, brand, vendor	estimator token
U03	See avg / min / max / P25 / P75 price bands for filtered results	estimator token
U04	Compare vendor prices for the same product spec	estimator token
U05	Enter project type + GFA → rough discipline cost estimate	estimator token
U06	Export filtered results to Excel/CSV	estimator token
U07	See price trend chart over time for a product	estimator token
U08	Log out and have token invalidated	estimator token

2.2 Admin (full access after login)
#	Story	Auth needed
U09	Log in with admin credentials to access the admin app	None — public login page
U10	Upload Excel/CSV bid forms — auto-extract attributes and auto-create products	admin token
U11	Review NEEDS_REVIEW rows with pre-filled attributes, confirm or edit	admin token
U12	Add new product families and define their JSONB attribute schemas	admin token
U13	Create, edit, and deactivate products, brands, vendors	admin token
U14	View system health — DB row counts, import batch history	admin token
U15	Log out and have token invalidated	admin token

2.3 Manager (future — read-only, same as estimator role)
#	Story	Notes
U16	See vendor concentration by discipline	Uses estimator role — no new role needed
U17	See catalog coverage metrics	Uses estimator role — accessible via estimator app

3. Product Nomenclature System
3.1 Code Format
  [DISCIPLINE]-[FAMILY]-[SEQUENCE]  
Segment	Format	Example	Notes
DISCIPLINE	1 letter	E	E=Electrical  H=HVAC  P=Plumbing  F=Fire  W=Weak current
FAMILY	2–4 letters	EMT	Admin-assigned abbreviation — set when creating the product family
SEQUENCE	4 digits	0001	Sequential within family, zero-padded, never reused

  ℹ  Code is a stable pointer only. All spec intelligence lives in the JSONB attributes column. Mirrors McMaster-Carr's opaque part number model.  

3.2 Example Codes
Code	Family	attributes JSONB
E-EMT-0001	EMT Conduit	{"diameter":"3/4\"","material":"鍍鋅","standard":"CNS","length_m":"3"}
E-WIR-0001	Wire & Cable	{"conductor_size_mm2":"5.5","core_count":"3C","voltage_v":"600","insulation":"PVC"}
E-MCB-0001	Circuit Breaker	{"poles":"3P","amperage_a":"100","breaking_ka":"22","voltage_v":"380"}
H-DUC-0001	HVAC Duct	{"duct_type":"矩形","material":"鍍鋅鋼板","thickness_mm":"0.8"}
P-GIP-0001	GI Pipe	{"diameter_mm":"25","schedule":"Sch40","joint_type":"螺紋"}

4. Data Model
4.1 Schema Overview
●	stg  — raw staging, all TEXT/JSONB, no constraints
●	proc — normalized core, enforced constraints, UI reads from here

4.2 Entity Relationship
proc.users              ← NEW: email, role, hashed_password proc.refresh_tokens     ← NEW: user_id, token_hash, expires_at  proc.mep_disciplines   ←── proc.product_families proc.product_families  ←── proc.attribute_definitions proc.product_families  ←── proc.products proc.brands            ←── proc.products proc.products.attributes  JSONB (GIN indexed)  proc.projects          ←── proc.quote_lines proc.products          ←── proc.quote_lines proc.vendors           ←── proc.quote_lines proc.brands            ←── proc.quote_lines

4.3 New Tables — Auth

proc.users — User Registry
  +  New table. Seeded with one admin from .env on first startup. Ready for multi-user (Option C) with zero schema changes.  

Column	Type	Constraints	Notes
user_id	UUID	PK	gen_random_uuid()
email	TEXT	UNIQUE NOT NULL	Login identifier
hashed_password	TEXT	NOT NULL	bcrypt hash — never store plaintext
role	TEXT	NOT NULL CHECK (role IN ('estimator','admin'))	Role controls all API access
display_name	TEXT	nullable	Shown in UI nav bar
active	BOOL	DEFAULT true	Set false to disable without deleting
created_at	TIMESTAMPTZ	DEFAULT NOW()	—
last_login	TIMESTAMPTZ	nullable	Updated on each successful login

  ℹ  Prototype: seeded from ADMIN_EMAIL + ADMIN_PASSWORD_HASH in .env. Upgrade to Option C: add POST /auth/register (admin-only) and a Users page in Admin App.  

proc.refresh_tokens — JWT Refresh Token Store
  +  New table. Enables token rotation — each refresh issues a new token and invalidates the old one.  

Column	Type	Constraints	Notes
token_id	UUID	PK	gen_random_uuid()
user_id	UUID	FK → proc.users NOT NULL	Which user this token belongs to
token_hash	TEXT	UNIQUE NOT NULL	SHA-256 hash of the actual token — never store plaintext
expires_at	TIMESTAMPTZ	NOT NULL	7 days from issue
revoked	BOOL	DEFAULT false	Set true on logout or rotation
created_at	TIMESTAMPTZ	DEFAULT NOW()	—
user_agent	TEXT	nullable	Browser/device for audit trail

4.4 Existing Tables (unchanged from v1.1)
The following tables carry forward from PRD v1.1 with no changes:
●	proc.mep_disciplines — discipline lookup, seeded
●	proc.project_types — project type lookup with mep_ratio, seeded
●	proc.product_families — product family definitions
●	proc.attribute_definitions — JSONB attribute schema per family
●	proc.brands — brand registry
●	proc.vendors — vendor registry
●	proc.products — product variants with attributes JSONB column (GIN indexed)
●	proc.projects — bid project registry
●	proc.quote_lines — core pricing data (amount GENERATED column)
●	proc.uom_map — unit of measure normalization
●	stg.raw_quote_lines — raw intake staging (includes attributes_raw JSONB)

Refer to PRD v1.1 Section 4 for full column definitions of these tables.

5. Excel Intake Format
Unchanged from PRD v1.1. Auth does not affect the Excel file format.
Refer to PRD v1.1 Section 5 for full sheet definitions (專案資訊, 報價明細, 屬性定義).

  ℹ  The only auth-related change: POST /ingest/upload now requires a valid admin JWT token in the Authorization header. The file format itself is identical.  

6. API Contract
Base URL: http://localhost:8000 (dev)
All protected endpoints require: Authorization: Bearer <access_token>
All responses: { data: [...], meta: { count, errors } }
Auth errors return 401 (invalid/expired token) or 403 (valid token, wrong role).

6.1 Auth Endpoints (Public — No Token Required)
  +  New section. All auth endpoints are public — no token needed to call them.  

Method	Endpoint	Request Body	Returns	Notes
POST	/auth/login	{ email, password }	{ access_token, refresh_token, role, display_name, expires_in }	Issues JWT pair. access_token: 8hr. refresh_token: 7d.
POST	/auth/refresh	{ refresh_token }	{ access_token, refresh_token, expires_in }	Rotates refresh token — old token revoked immediately.
POST	/auth/logout	{ refresh_token }	{ success: true }	Revokes refresh token. Frontend discards access token from memory.

JWT Token Structure
Header:  { alg: HS256, typ: JWT } Payload: {   sub: "user_id (UUID)",   email: "user@company.com",   role: "estimator" | "admin",   exp: <unix timestamp — 8 hours from issue>,   iat: <unix timestamp — issued at> }  Secret: JWT_SECRET from .env — min 32 chars, random

6.2 Ingest (Admin only)
Method	Endpoint	Auth	Returns
POST	/ingest/upload	admin	{ rows_loaded, rows_ok, rows_auto_created, rows_needs_review, rows_exception }
GET	/ingest/batches	admin	List of import batches with status summary
GET	/ingest/review	admin	NEEDS_REVIEW rows with pre-filled attributes_raw
POST	/ingest/resolve	admin	Confirm or correct a NEEDS_REVIEW row → writes to proc.quote_lines

6.3 Products (read: estimator+admin | write: admin only)
Method	Endpoint	Auth	Returns
GET	/products/families	estimator+	All product families with discipline
GET	/products/attributes	estimator+	Attribute definitions + distinct JSONB values with counts
GET	/products/facets	estimator+	Full facet panel for filter UI
GET	/products/search	estimator+	Paginated product + price stats
GET	/products/:code	estimator+	Single product detail + quote history
POST	/products	admin	Create new product — assigns next sequence number
PATCH	/products/:code	admin	Update product attributes or brand
POST	/products/auto-create	admin (internal)	Auto-create from ingest pipeline

6.4 Quotes & Estimates (estimator+admin)
Method	Endpoint	Auth	Returns
GET	/quotes/search	estimator+	Price stats — keyword + full-text search
GET	/quotes/estimate	estimator+	GFA-scaled discipline estimate with price bands
GET	/quotes/trend	estimator+	Quarterly avg price for a product (last 8 quarters)

6.5 Reference Data (read: estimator+admin | write: admin only)
Method	Endpoint	Auth	Returns
GET	/vendors	estimator+	Active vendors list
POST	/vendors	admin	Create vendor
GET	/brands	estimator+	Active brands list
POST	/brands	admin	Create brand
GET	/health	estimator+	DB ping + row counts + batch summary

6.6 Auth Legend
Symbol	Meaning
estimator+	Valid JWT required — estimator OR admin role accepted
admin	Valid JWT required — admin role ONLY. Returns 403 for estimator tokens.
(public)	No token required — login and refresh endpoints only

7. UI Screen Map
  +  Two separate React apps. Estimator App on :5173. Admin App on :5174. Both call the same backend on :8000.  

7.1 App Structure
mep_ops/ ├── frontend/          ← Estimator App  (port 5173) │   └── src/ │       ├── App.jsx │       ├── pages/ │       │   ├── Login.jsx │       │   ├── Dashboard.jsx   (search + filter) │       │   └── Estimate.jsx    (project estimate) │       ├── hooks/ │       │   └── useAuth.js      (JWT in memory, auto-refresh) │       └── api/ │           └── client.js       (axios with Authorization header inject) │ └── admin/             ← Admin App  (port 5174)     └── src/         ├── App.jsx         ├── pages/         │   ├── Login.jsx         │   ├── Upload.jsx      (ingest + batch history)         │   ├── Review.jsx      (NEEDS_REVIEW resolution)         │   ├── Products.jsx    (product catalog CRUD)         │   ├── Families.jsx    (product family + attr schema)         │   ├── Vendors.jsx     (vendor + brand registry)         │   └── Health.jsx      (system status)         ├── hooks/         │   └── useAuth.js      (same pattern as estimator)         └── api/             └── client.js

7.2 Auth Flow (Both Apps)
Login Page
●	Email + password form — POST /auth/login
●	On success: store access_token and role in React useState (useAuth hook)
●	Store refresh_token in httpOnly cookie (set by backend) — not accessible to JS
●	Redirect to default page for that role
●	On 401 from any API call: silently call POST /auth/refresh → retry original request
●	On failed refresh: clear state → redirect to /login

Token Storage Pattern (Critical)
// useAuth.js — token NEVER in localStorage const [accessToken, setAccessToken] = useState(null); const [role, setRole] = useState(null);  // Inject token into every API call client.interceptors.request.use(config => {   if (accessToken) config.headers.Authorization = `Bearer ${accessToken}`;   return config; });  // Silent refresh — runs every 7.5 hours useEffect(() => {   const interval = setInterval(() => refreshToken(), 7.5 * 60 * 60 * 1000);   return () => clearInterval(interval); }, [accessToken]);

  ℹ  Refresh token is in httpOnly cookie — it survives page refresh but is invisible to JavaScript. Access token is in memory — lost on page refresh, recovered automatically via the cookie.  

7.3 Estimator App Pages (:5173)
Route	Page	Auth gate	Function
/login	Login 登入	Public	Email + password → estimator or admin token
/	Dashboard 搜尋	estimator+	Faceted product search — family tabs, JSONB attribute filters, price cards
/estimate	Estimate 估價	estimator+	Project type + GFA → discipline cost estimate + CSV export
*	Redirect	—	Any unknown route → /login if not authed, / if authed

  ℹ  If an admin logs in via :5173, they see the estimator UI only. To access admin functions they must go to :5174.  

7.4 Admin App Pages (:5174)
Route	Page	Auth gate	Function
/login	Login 管理員登入	Public	Admin credentials only — redirect to /upload on success
/upload	Upload 上傳標單	admin	Drag-drop Excel/CSV, batch history, 4-bucket result summary
/review	Review 待確認	admin	NEEDS_REVIEW rows — pre-filled JSONB attributes, confirm/edit/create
/products	Products 產品目錄	admin	Browse all products, edit attributes JSONB, activate/deactivate
/families	Families 產品系列	admin	Create/edit families, define attribute_definitions with allowed_values
/vendors	Vendors 廠商	admin	Create/edit vendors and brands
/health	Health 系統狀態	admin	DB row counts, recent import batches, token audit log
*	Redirect	—	Any unknown route → /login if not authed, /upload if authed

  ℹ  If an estimator token is used to access :5174, the backend returns 403 on all admin endpoints. The Admin App redirects to /login.  

7.5 Shared UI Components (both apps)
●	NavBar — shows display_name + role badge + Logout button
●	ProtectedRoute — wrapper that checks useAuth token, redirects to /login if missing
●	ApiErrorBanner — shows 401/403/500 errors as dismissible top banner
●	LoadingSkeleton — grey animated placeholder cards during API fetch

8. Infrastructure
8.1 Docker Compose Services
  +  Two frontend services now — frontend on :5173, admin on :5174.  

Service	Image	Port	Purpose
postgres	postgres:16	5432	Database
backend	python:3.11-slim + FastAPI	8000	API server — shared by both apps
frontend	node:20-alpine + Vite + React	5173	Estimator App
admin	node:20-alpine + Vite + React	5174	Admin App

8.2 Environment Variables
Variable	Example	Used By
DB_HOST	localhost	backend
DB_PORT	5432	backend
DB_NAME	mep_ops	backend
DB_USER	mep_app	backend
DB_PASSWORD	strong_password	backend
JWT_SECRET	min-32-char-random-string	backend — signs all tokens
ACCESS_TOKEN_EXPIRE_HOURS	8	backend
REFRESH_TOKEN_EXPIRE_DAYS	7	backend
ADMIN_EMAIL	admin@yourcompany.com	backend — seeds proc.users on startup
ADMIN_PASSWORD_HASH	bcrypt hash of admin password	backend — use: python -c "import bcrypt; print(bcrypt.hashpw(b'password', bcrypt.gensalt()).decode())"
CORS_ORIGINS	http://localhost:5173,http://localhost:5174	backend
ATTR_EXTRACT_CONFIDENCE_THRESHOLD	0.8	backend ingest
VITE_API_URL	http://localhost:8000	frontend + admin

  ℹ  Generate ADMIN_PASSWORD_HASH with: python -c "import bcrypt; print(bcrypt.hashpw(b'yourpassword', bcrypt.gensalt()).decode())"  

8.3 Local → Production
●	Same docker-compose.yml — add nginx:alpine reverse proxy for Hetzner
●	Nginx: :80/:443 → /api/ proxies to :8000, / proxies to :5173, /admin/ proxies to :5174
●	SSL via certbot / Let's Encrypt
●	Set CORS_ORIGINS to production domain in .env
●	Rotate JWT_SECRET on production — this invalidates all tokens (forces re-login)

9. Agile Sprint Plan
  +  Sprint 1 updated — users table seeded. Sprint 2 updated — auth built before ingest. Sprint 3+ unchanged logic, auth enforcement added.  

Sprint	Goal	Key Deliverables	Done When
S1 Foundation	DB + auth tables deployed	01_schemas.sql with proc.users + proc.refresh_tokens. 02_seed_data.sql seeds one admin user from .env. All other tables from v1.1. setup.bat for Windows.	psql connects. SELECT * FROM proc.users returns one admin row. All v1.1 tables exist. validate.py passes 6 tests + new test 7: users table has exactly 1 row.
S2 Auth + Backend Shell	Login works end-to-end	POST /auth/login, /auth/refresh, /auth/logout. JWT middleware (role-based guards on all routes). FastAPI app shell with all routers. GET /health (public).	curl login → get token. curl /products/search without token → 401. curl with estimator token → 200. curl admin-only endpoint with estimator token → 403.
S3 Ingest Pipeline	Upload Excel → data in DB	POST /ingest/upload (admin only). stg → proc pipeline. Attribute extraction → attributes_raw JSONB. Auto-create at confidence >= 0.8.	Upload 10-row sample Excel with admin token → rows in proc.quote_lines. Unauthenticated upload → 401.
S4 Product Catalog	JSONB attributes queryable	GET /products/facets (sourced from JSONB). GET /products/search with multi-attr filter. Products page in Admin App.	Filter by family + 2 JSONB attrs → correct results. Facets show counts from real data.
S5 Estimator App	Estimator can search after login	Estimator App: Login.jsx, Dashboard.jsx (faceted search), Estimate.jsx. useAuth hook with silent refresh. ProtectedRoute wrapper.	Estimator logs in → sees search UI. Token expires simulation → auto-refresh works. Estimator cannot access :5174.
S6 Admin App	Admin can upload and review	Admin App: Login.jsx, Upload.jsx (4-bucket result), Review.jsx (JSONB attr edit), Vendors.jsx, Health.jsx.	Admin logs in at :5174 → uploads Excel → sees auto-created / needs-review counts → resolves NEEDS_REVIEW rows.
S7 Harden	Production ready	Nginx config for Hetzner. All validate.py tests pass. README with 5-command quickstart. .gitignore covers .env, tokens.	docker compose up on VPS → both apps accessible via subdomain. Login works. All 7 validate.py tests pass.

10. Claude Code Prompts
Paste the opening instruction once per session. Then paste the sprint prompt for the current sprint.

Opening Instruction (every session)
Read CLAUDE.md and PRD.md (v1.2) before writing any code. Architecture decisions: (1) Two separate React apps — frontend/ on :5173 (estimator) and admin/ on :5174 (admin). (2) One FastAPI backend on :8000 shared by both. (3) JWT auth — access token in React memory (useState), refresh token in httpOnly cookie. NEVER use localStorage for tokens. (4) proc.products.attributes is JSONB with GIN index — NO separate product_attributes table. (5) Never hardcode credentials. All secrets from .env.

Sprint 1 — db-architect subagent
Sprint 1. Use db-architect subagent. Write db/01_schemas.sql with ALL tables from PRD v1.2 Section 4: proc.users (email, role, hashed_password, active), proc.refresh_tokens, proc.mep_disciplines, proc.project_types, proc.product_families, proc.attribute_definitions, proc.brands, proc.vendors, proc.products (attributes JSONB NOT NULL DEFAULT '{}' with GIN index), proc.projects, proc.quote_lines (amount GENERATED), proc.uom_map, stg.raw_quote_lines (attributes_raw JSONB). Write db/02_seed_data.sql: seed all lookup tables AND one admin user from env vars ADMIN_EMAIL and ADMIN_PASSWORD_HASH. Write db/03_views.sql: mv_price_stats, vw_quick_search, vw_vendor_comparison. Write setup.bat for Windows. Write tests/validate.py with 7 tests (6 from v1.1 + test 7: proc.users has exactly 1 row). All tests must pass.

Sprint 2 — backend-engineer subagent
Sprint 2. Use backend-engineer subagent. Build auth first. Install: python-jose[cryptography] bcrypt. Implement POST /auth/login: verify email + bcrypt password against proc.users, issue JWT access token (HS256, 8hr, payload: sub=user_id, email, role) and refresh token (store SHA-256 hash in proc.refresh_tokens, return raw token in httpOnly cookie). Implement POST /auth/refresh: validate refresh token hash, rotate — revoke old, issue new pair. Implement POST /auth/logout: revoke refresh token. Write JWT middleware: extract Bearer token from Authorization header, decode, attach user to request. Write role_required(role) dependency: raises 403 if token role doesn't match. Apply estimator_required to all GET product/quote routes. Apply admin_required to all POST/PATCH product/ingest/vendor routes. Test: curl /auth/login, curl protected route with/without token, curl admin route with estimator token (must 403).

Sprint 3 — backend-engineer subagent
Sprint 3. Use backend-engineer subagent. Implement POST /ingest/upload (admin_required). File parsing (pandas CSV/XLSX), header alias map (ZH+EN from PRD v1.1 Section 5.2), stg.raw_quote_lines insert, uom normalization, attribute extraction from description_raw using attribute_definitions allowed_values (regex), store in stg.attributes_raw JSONB, compute match_confidence. If confidence >= 0.8: POST /products/auto-create → set parse_status=AUTO_CREATED. If 0.5-0.79: parse_status=NEEDS_REVIEW. If <0.5: parse_status=EXCEPTION. Upsert valid rows to proc.quote_lines. Return { rows_loaded, rows_ok, rows_auto_created, rows_needs_review, rows_exception }. Test by uploading sample CSV with admin JWT. Test 401 for unauthenticated upload.

Sprint 4 — backend-engineer + frontend-engineer subagents
Sprint 4. Phase 1 (backend-engineer): GET /products/facets — filter options sourced from DISTINCT attributes->>'key' queries on proc.products JSONB (NOT from attribute_definitions). Include count per option. Apply estimator_required. GET /products/search — multi-attribute AND filter using JSONB @> operator or attributes->>'key' = 'value' conditions. Phase 2 (frontend-engineer): Products page in admin/ app showing product list with JSONB attributes displayed as tag chips. All API calls include Authorization header from useAuth hook.

Sprint 5 — frontend-engineer subagent
Sprint 5. Use frontend-engineer subagent. Build the Estimator App in frontend/. Create useAuth hook: stores accessToken and role in useState. On mount: attempt POST /auth/refresh using httpOnly cookie — if success, set token in state (handles page refresh). Set up axios client in api/client.js to inject Authorization header on every request. On 401 response: silently call refresh, retry original request once. On failed refresh: redirect to /login. Build Login.jsx: email/password form, calls POST /auth/login, stores token in useAuth, redirects to /. Wrap all routes except /login in ProtectedRoute that checks useAuth token. Build Dashboard.jsx: left filter panel (family tabs + JSONB-sourced attribute chips) + price cards. Build Estimate.jsx: project type + GFA → price band table + CSV export.

Sprint 6 — frontend-engineer subagent
Sprint 6. Use frontend-engineer subagent. Build the Admin App in admin/. Same useAuth pattern as frontend/. Login.jsx redirects to /upload on success. Build Upload.jsx: drag-drop zone, POST /ingest/upload with admin token, 4-bucket result card (auto-created/matched/needs-review/exception). Build Review.jsx: NEEDS_REVIEW rows table, each row expands to show attributes_raw JSONB fields as editable inputs, POST /ingest/resolve on confirm. Build Vendors.jsx: vendor + brand list with create forms. Build Health.jsx: DB row counts from GET /health + recent batch list. NavBar shows display_name + admin badge + logout. Logout calls POST /auth/logout, clears useAuth state, redirects to /login.

11. Glossary
Term	Chinese	Definition
JWT	JSON Web Token	Signed token issued by backend on login. Contains user_id, email, role, expiry. Verified on every API call without DB lookup.
Access Token	存取令牌	Short-lived JWT (8 hours). Stored in React useState memory — lost on page refresh, recovered via refresh token.
Refresh Token	更新令牌	Long-lived token (7 days). Stored as httpOnly cookie — invisible to JavaScript. Used to silently obtain new access tokens.
httpOnly Cookie	HTTP限定Cookie	Browser cookie that cannot be read by JavaScript. Prevents XSS attacks from stealing the refresh token.
Role	角色	Either 'estimator' (read-only) or 'admin' (full write). Stored in JWT payload and proc.users.
estimator+	估算員以上	Shorthand for: valid JWT required, estimator OR admin role accepted.
admin_required	管理員限定	Valid JWT required + role must be 'admin'. Returns 403 for estimator tokens.
Token Rotation	令牌輪換	Each call to /auth/refresh revokes the old refresh token and issues a new one. Prevents replay attacks.
bcrypt	—	Password hashing algorithm. Slow by design to resist brute-force. Never store plaintext passwords.
JSONB Attributes	JSON屬性欄位	PostgreSQL JSONB column on proc.products storing all spec key-values. GIN indexed. No separate product_attributes table.
Product Family	產品系列	Category template defining which JSONB attribute keys are valid (e.g. EMT_CONDUIT has diameter, material, standard).
stg	暫存區	Staging schema — raw intake, no constraints. attributes_raw JSONB carries auto-extracted specs.
proc	正式區	Processed schema — validated, normalized. What the UI reads from.
GIN Index	GIN索引	PostgreSQL Generalized Inverted Index. Makes JSONB filtering and full-text search fast at scale.

12. Auth Upgrade Path — Option A → Option C
The system is designed so moving from single-admin (.env) to full multi-user requires minimal code changes. Here is exactly what changes and what stays the same.

12.1 What Already Exists (no change needed)
●	proc.users table — already has email, role, hashed_password, active, last_login
●	JWT payload already carries role — no token format change
●	All API role guards already read from token — no guard changes
●	Both React apps already use useAuth hook — no auth flow changes

12.2 What Changes for Option C (multi-user)
Component	Change Required	Effort
Backend: POST /auth/register	New admin-only endpoint: { email, password, role, display_name } → creates proc.users row with bcrypt hash	~1 hour
Backend: GET /users	New admin-only endpoint: list all users with role + active status	~30 min
Backend: PATCH /users/:id	New admin-only endpoint: update role, active, display_name	~30 min
Admin App: Users page	New page at /users — table of users, add user form (calls /auth/register), toggle active	~2 hours
Admin App: Login flow	Remove ADMIN_EMAIL from .env dependency — login now always queries proc.users	~15 min
Seed script	Replace .env-seeded admin with a setup wizard or first-run migration	~30 min

  ℹ  Total estimated effort to go from Option A to Option C: ~4.5 hours of development. Zero database schema changes required.  

12.3 What Never Changes
●	proc.users schema — already has all needed columns
●	JWT structure — role is already in the payload
●	All existing API guards — estimator_required and admin_required already work for any number of users
●	Both React apps — useAuth hook works identically regardless of user count
●	All existing data — proc.quote_lines, proc.products, everything else unaffected


End of Document — MEP Pricing Intelligence System PRD v1.2  |  Changes from v1.1 highlighted in green
