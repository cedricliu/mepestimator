"""
db/seed_users.py — Upsert admin + estimator users from .env into proc.users.
Run inside the backend container:
  docker compose exec backend python db/seed_users.py
"""
import os
import sys
import psycopg2
from dotenv import load_dotenv

load_dotenv()

conn = psycopg2.connect(
    host=os.getenv("DB_HOST", "postgres"),
    port=int(os.getenv("DB_PORT", 5432)),
    dbname=os.getenv("DB_NAME"),
    user=os.getenv("DB_USER"),
    password=os.getenv("DB_PASSWORD"),
)
cur = conn.cursor()

users = [
    (
        os.getenv("ADMIN_EMAIL", ""),
        os.getenv("ADMIN_PASSWORD_HASH", ""),
        "admin",
        "Admin",
    ),
    (
        os.getenv("ESTIMATOR_EMAIL", ""),
        os.getenv("ESTIMATOR_PASSWORD_HASH", ""),
        "estimator",
        "Estimator",
    ),
]

for email, pw_hash, role, display_name in users:
    if not email or not pw_hash:
        print(f"[SKIP] {role}: email or hash not set in .env")
        continue
    if len(pw_hash) < 50:
        print(f"[ERROR] {role}: hash looks truncated (len={len(pw_hash)}) — check $$ escaping in .env")
        continue
    # ON CONFLICT DO NOTHING — never overwrite an existing hash
    cur.execute(
        """
        INSERT INTO proc.users (email, hashed_password, role, display_name, active)
        VALUES (%s, %s, %s, %s, true)
        ON CONFLICT (email) DO NOTHING
        RETURNING email, role
        """,
        (email, pw_hash, role, display_name),
    )
    row = cur.fetchone()
    if row:
        print(f"[CREATED] {row[1]}: {row[0]}")
    else:
        print(f"[EXISTS] {role}: {email} already in DB — not overwritten")

conn.commit()
cur.close()
conn.close()
print("Done.")
