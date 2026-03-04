#!/bin/bash
# setup.sh — Deploy MEP database schema and seed data
# Usage: ./setup.sh
# Requires: Docker running, .env configured

set -e  # Exit on any error

# Load env vars
export $(grep -v '^#' .env | xargs)

echo "======================================"
echo " MEP Ops — Database Setup"
echo "======================================"
echo "Target: $DB_NAME @ $DB_HOST:$DB_PORT"
echo ""

run_sql() {
  echo "→ Running $1..."
  psql "postgresql://$DB_USER:$DB_PASSWORD@$DB_HOST:$DB_PORT/$DB_NAME" -f "$1"
  echo "  ✓ Done"
}

run_sql "db/01_schemas.sql"
run_sql "db/02_seed_data.sql"
run_sql "db/03_views.sql"

echo ""
echo "======================================"
echo " Setup complete. Run validation with:"
echo " python tests/validate.py"
echo "======================================"
