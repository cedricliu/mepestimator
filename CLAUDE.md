# MEP Pricing Intelligence System
# 機電工程歷史報價資料庫

## Mission
Replace the 3–5 day vendor quote wait with a searchable historical pricing database.
Bidding team gets rough estimates in minutes, not days.

---

## Agile Structure

### Sprints
- **Sprint 1 (Foundation):** DB schema + Docker + seed data
- **Sprint 2 (Ingest):** FastAPI backend + CSV/Excel upload pipeline
- **Sprint 3 (UI):** React frontend — search, upload, estimate pages
- **Sprint 4 (Harden):** Validation tests, error handling, staging → prod deploy

### Definition of Done (per sprint)
- Code runs without errors
- At least one acceptance test passes
- No hardcoded credentials
- PR-ready (clean commit, no debug output)

---

## Stack
- **Database:** PostgreSQL 16 (Docker)
- **Backend:** FastAPI (Python 3.11), psycopg2, pandas, python-dotenv
- **Frontend:** React + Vite + Tailwind CSS
- **Ingest:** CSV and XLSX via FastAPI POST endpoint → pandas → stg schema
- **Local dev:** Docker Compose (ports 5432, 8000, 5173)
- **Prod target:** Hetzner VPS, same Docker Compose + Nginx reverse proxy

---

## Database Conventions
- DB name: `mep_ops`
- Schema `stg`: raw staging, no constraints, keep original data
- Schema `proc`: normalized core tables, enforced constraints
- All amounts in TWD (NT$)
- UoM canonical map lives in `proc.uom_map`
- Confidence: 1.0 = complete data, <0.7 = flag to exceptions
- `stg.raw_quote_lines.parse_status`: PENDING → OK | EXCEPTION

---

## File Map
```
db/01_schemas.sql      → DDL: schemas, tables, indexes
db/02_seed_data.sql    → uom_map, project_types, mep_disciplines
db/03_views.sql        → mv_price_stats, vw_quick_search, vw_vendor_comparison
backend/main.py        → FastAPI app entrypoint
backend/routers/       → ingest.py, quotes.py, vendors.py
frontend/src/          → React pages: Dashboard, Upload, Estimate
tests/validate.py      → 5 acceptance tests
docker-compose.yml     → postgres + backend + frontend services
setup.sh               → runs all db/ SQL files in order
.env                   → credentials (never commit)
```

---

## Hard Rules (Never Break)
- Never hardcode DB credentials — use `.env` + `python-dotenv`
- Never DROP proc.* tables — use ALTER or CREATE IF NOT EXISTS
- Always use `ON CONFLICT` upsert, never raw INSERT without conflict handling
- Always batch DB inserts (never row-by-row in loops)
- Exceptions go to `stg.raw_quote_lines.parse_status = 'EXCEPTION'` with reason in `parse_notes`
- Frontend always reads from `proc.*` views, never raw tables

---

## API Conventions
- All responses: `{ data: [...], meta: { count, errors } }`
- Errors: `{ error: "message", detail: "..." }` with appropriate HTTP status
- File upload: multipart/form-data, return `{ rows_loaded, rows_ok, rows_exception }`
- CORS open for local dev (`*`), restrict for prod

---

## Naming (Traditional Chinese labels where helpful)
- Discipline codes: ELEC 電氣 / HVAC 空調 / PLUMB 給排水 / FIRE 消防 / WEAK 弱電
- Project types: WAREHOUSE 倉儲 / OFFICE 辦公 / FACTORY 工廠 / HOSPITAL 醫療 / RESIDENTIAL 住宅
- Currency: TWD (NT$)
- Units: metric (m, m², m³, L/s, °C)
