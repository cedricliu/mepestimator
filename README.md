# MEP 報價系統 — Pricing Intelligence

Replace the 3–5 day vendor quote wait with a searchable historical pricing database.
Bidding team gets rough estimates in minutes, not days.

---

## Quick Start (5 commands)

```bash
# 1. Copy and fill credentials
cp .env.example .env   # edit DB_HOST, DB_NAME, DB_USER, DB_PASSWORD

# 2. Start all services (Postgres + backend + frontend)
docker compose up -d

# 3. Wait for Postgres to be healthy, then initialise the schema
./setup.sh

# 4. Verify everything is wired correctly
python tests/validate.py

# 5. Open the UI
open http://localhost:5173
```

> **Prerequisites:** Docker Desktop, `psql` (for setup.sh), Python 3.11 + `pip install psycopg2-binary python-dotenv` (for validate.py)

---

## URL Reference

| Service  | URL                          | Description                    |
|----------|------------------------------|--------------------------------|
| Frontend | http://localhost:5173        | React UI (search/upload/estimate) |
| Backend  | http://localhost:8000        | FastAPI (auto-docs at /docs)   |
| Postgres | localhost:5432               | DB `mep_ops`                   |

### Key API Endpoints

| Method | Path                     | Description                          |
|--------|--------------------------|--------------------------------------|
| GET    | /health                  | DB ping + row counts                 |
| POST   | /ingest/upload           | Upload CSV or XLSX bid form          |
| GET    | /quotes/search           | Full-text price search               |
| GET    | /quotes/estimate         | GFA-based cost estimate              |
| GET    | /vendors                 | List active vendors                  |

---

## .env Template

```
DB_HOST=localhost
DB_PORT=5432
DB_NAME=mep_ops
DB_USER=mep_user
DB_PASSWORD=changeme
```

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
   | Currency     | `currency`                  | `幣別`                    |

   Valid discipline codes: `ELEC` / `HVAC` / `PLUMB` / `FIRE` / `WEAK`

2. **Upload** — Go to http://localhost:5173/upload, drag-and-drop the file, click Upload.

3. **Review exceptions** — Any rows that failed parsing appear in the collapsible exception table with the reason. Fix the source data and re-upload if needed.

4. **Search** — Navigate to the Dashboard (/) to search by keyword or filter by discipline.

---

## Database Layout

```
mep_ops
├── stg.raw_quote_lines     ← raw intake, all TEXT, parse_status PENDING→OK|EXCEPTION
└── proc.*
    ├── project_types       ← lookup: complexity_factor, mep_ratio
    ├── mep_disciplines     ← ELEC / HVAC / PLUMB / FIRE / WEAK
    ├── uom_map             ← raw_uom → canonical_uom
    ├── vendors             ← vendor registry
    ├── projects            ← one row per bid project
    ├── quote_lines         ← core pricing data (amount is a generated column)
    ├── mv_price_stats      ← materialized: avg/min/max/p25/p75 per item
    ├── vw_quick_search     ← mv_price_stats + price_spread_pct
    └── vw_vendor_comparison← vendor × discipline × description pricing
```

---

## Running Tests

```bash
python tests/validate.py
# Exit 0 = all 6 tests pass; Exit 1 = at least one failure
```

Tests cover: row count reconciliation, amount integrity, required field nulls,
UoM canonical mapping, confidence distribution, and materialized view refresh.
