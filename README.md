# MEP 報價系統 — Pricing Intelligence

Replace the 3–5 day vendor quote wait with a searchable historical pricing database.
Bidding team gets rough estimates in minutes, not days.

---

## Quick Start

### Prerequisites
- Docker Desktop (with `docker compose` v2)
- Python 3.x with `pip install psycopg2-binary python-dotenv requests`
- `psql` client (included in PostgreSQL install, or via `brew install libpq`)

### Steps

```bash
# 1. Clone the repository
git clone <repo-url>
cd mep_db

# 2. Copy .env.example to .env and fill in values
copy .env.example .env
# Edit: DB_PASSWORD, JWT_SECRET, ADMIN_EMAIL, ADMIN_PASSWORD_HASH

# 3. Generate ADMIN_PASSWORD_HASH (replace YourPassword! with your chosen password)
python -c "from passlib.context import CryptContext; print(CryptContext(schemes=['bcrypt']).hash('YourPassword!'))"
# Paste the output into .env as ADMIN_PASSWORD_HASH

# 4. Start Postgres, then run schema setup
docker compose up -d postgres
setup.bat

# 5. Verify — all 14 tests must pass
python tests\validate.py

# 6. Start all services
docker compose up -d

# 7. Open the apps
#   Estimator app: http://localhost:5173
#   Admin app:     http://localhost:5174
#   API docs:      http://localhost:8000/docs
```

> **Windows note:** Use `setup.bat` (not `setup.sh`). Use `docker compose` with a space, not `docker-compose`.

---

## Services

| Service        | Port  | Who         | Purpose                                      |
|----------------|-------|-------------|----------------------------------------------|
| Estimator app  | :5173 | Bidding team| Search, filter, estimate — read-only         |
| Admin app      | :5174 | Admin only  | Upload, review, catalog, vendors, health     |
| FastAPI backend| :8000 | Both apps   | All API endpoints (auto-docs at /docs)       |
| PostgreSQL 16  | :5432 | Backend     | mep_ops database                             |

---

## Production Deployment (Nginx)

```bash
# Place TLS certificates at:
#   nginx/certs/cert.pem
#   nginx/certs/key.pem

docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d
```

The prod overlay:
- Removes `--reload` from the backend command
- Adds nginx service (`:80` redirect → `:443`) with:
  - `/api/` → backend
  - `/admin/` → admin app
  - `/` → estimator app
- Removes direct port exposure on backend (nginx-only access)

---

## Key API Endpoints

| Method | Path                    | Auth      | Description                       |
|--------|-------------------------|-----------|-----------------------------------|
| POST   | /auth/login             | Public    | Returns access_token + sets cookie|
| GET    | /health                 | estimator+| DB ping, row counts, parse status |
| POST   | /ingest/upload          | admin     | Upload Excel/CSV bid file         |
| GET    | /ingest/review          | admin     | Fetch NEEDS_REVIEW rows           |
| POST   | /ingest/resolve         | admin     | Confirm or reject a review row    |
| GET    | /products/search        | estimator+| Full-text product search          |
| GET    | /quotes/search          | estimator+| Price search by keyword           |
| GET    | /quotes/estimate        | estimator+| GFA-based MEP cost estimate       |
| GET    | /vendors                | estimator+| List vendors (paginated)          |
| POST   | /vendors                | admin     | Create/upsert vendor              |
| GET    | /brands                 | estimator+| List brands                       |
| POST   | /brands                 | admin     | Create/upsert brand               |

---

## Database Layout

```
mep_ops
├── stg.raw_quote_lines     ← raw intake, all TEXT, parse_status: PENDING→OK|EXCEPTION|NEEDS_REVIEW|AUTO_CREATED
└── proc.*
    ├── project_types       ← lookup: complexity_factor, mep_ratio
    ├── mep_disciplines     ← ELEC / HVAC / PLUMB / FIRE / WEAK
    ├── uom_map             ← raw_uom → canonical_uom
    ├── brands              ← brand registry
    ├── product_families    ← EMT_CONDUIT, WIRE_CABLE, etc.
    ├── attribute_definitions← JSONB schema per family
    ├── products            ← catalog (attributes JSONB, GIN indexed)
    ├── vendors             ← vendor registry
    ├── projects            ← one row per bid project
    ├── quote_lines         ← core pricing data (amount is a generated column)
    ├── users               ← auth users (admin + estimator roles)
    ├── refresh_tokens      ← httpOnly cookie token store
    ├── mv_price_stats      ← materialized: avg/min/max/p25/p75 per item
    ├── mv_product_price_stats ← materialized: per-product price stats
    ├── vw_quick_search     ← mv_price_stats + price_spread_pct
    └── vw_vendor_comparison← vendor × discipline × description pricing
```

---

## Running Tests

```bash
# Set DB_HOST=localhost if running tests outside Docker
DB_HOST=localhost python tests\validate.py
# Exit 0 = all 14 tests pass; Exit 1 = at least one failure
```

Tests cover: row reconciliation, amount integrity, required fields, UoM mapping,
confidence distribution, materialized view refresh, product tables, attribute definitions,
product_id column, JSONB GIN index, users table, POST /vendors auth (401), and
GET /ingest/review role check (403).

---

## How to Add a New Excel Bid Form

1. **Prepare the file** — CSV or XLSX, one row per line item.
   Accepted column headers (English or Chinese):

   | Field        | English aliases             | Chinese aliases          |
   |--------------|-----------------------------|--------------------------|
   | Project code | `project_code`, `project`   | `專案代碼`, `專案`        |
   | Vendor code  | `vendor_code`, `vendor`     | `廠商代碼`, `廠商`        |
   | Discipline   | `discipline`                | `類別`, `工種`            |
   | Item code    | `item_code`, `item`         | `料號`, `項目代碼`        |
   | Description  | `description`, `desc`       | `品名規格`, `品名`        |
   | Unit         | `uom`, `unit`               | `單位`                    |
   | Quantity     | `qty`, `quantity`           | `數量`                    |
   | Unit price   | `unit_price`, `price`       | `單價`, `報價`            |

   Valid discipline codes: `ELEC` / `HVAC` / `PLUMB` / `FIRE` / `WEAK`

2. **Upload** — Log in at http://localhost:5174, go to Upload, drag-and-drop, click Upload.
3. **Review exceptions** — Rows with confidence < 0.8 appear in the Review queue for manual confirmation.
4. **Search** — Log in at http://localhost:5173, use Dashboard to search by keyword or filter by discipline.
