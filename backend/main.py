"""
MEP Pricing Intelligence API
backend/main.py — FastAPI app entrypoint
"""

from contextlib import asynccontextmanager
import os

import psycopg2.pool
from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

load_dotenv()

from routers import auth, brands, health, ingest, products, quotes, vendors


@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.pool = psycopg2.pool.ThreadedConnectionPool(
        minconn=2,
        maxconn=10,
        host=os.getenv("DB_HOST", "localhost"),
        port=int(os.getenv("DB_PORT", 5432)),
        dbname=os.getenv("DB_NAME"),
        user=os.getenv("DB_USER"),
        password=os.getenv("DB_PASSWORD"),
    )
    yield
    app.state.pool.closeall()


app = FastAPI(title="MEP Pricing API", version="1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=os.getenv("CORS_ORIGINS", "*").split(","),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router,      prefix="/auth",      tags=["auth"])
app.include_router(ingest.router,    prefix="/ingest",    tags=["ingest"])
app.include_router(quotes.router,    prefix="/quotes",    tags=["quotes"])
app.include_router(vendors.router,   prefix="/vendors",   tags=["vendors"])
app.include_router(brands.router,    prefix="/brands",    tags=["brands"])
app.include_router(products.router,  prefix="/products",  tags=["products"])
app.include_router(health.router,    tags=["health"])


@app.get("/")
def root():
    return {"status": "MEP Pricing API", "version": "1.0"}
