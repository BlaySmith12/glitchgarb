"""
database.py -- SQLAlchemy async engine + session factory
Supports PostgreSQL (Neon) and SQLite (default for local dev).
"""
import sys
import asyncio
import logging
logging.basicConfig(level=logging.INFO)

from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase
from sqlalchemy import text
import os
from dotenv import load_dotenv

load_dotenv()

# Read DATABASE_URL from environment
DATABASE_URL = os.environ.get("DATABASE_URL", "")

# If not set (e.g., Render env var not passed), use Neon directly
if not DATABASE_URL:
    import sys
    # On Render (Linux), always use Neon. On Windows/local, use SQLite.
    if sys.platform == "win32":
        BASE_DIR = os.path.dirname(os.path.abspath(__file__))
        SQLITE_PATH = os.environ.get("SQLITE_PATH", os.path.join(BASE_DIR, "glitchgarb.db"))
        DATABASE_URL = f"sqlite+aiosqlite:///{SQLITE_PATH}"
        print(f"  [DB] Windows/local - using SQLite: {SQLITE_PATH}")
    else:
        # Render/Linux - use Neon PostgreSQL
        DATABASE_URL = "postgresql+psycopg://neondb_owner:npg_O68pJIoayxAV@ep-late-wind-anffxxry.c-6.us-east-1.aws.neon.tech/neondb?sslmode=require"
        print(f"  [DB] Linux/Render - using Neon PostgreSQL")
else:
    # Mask password for logging
    safe_url = DATABASE_URL
    if "://" in DATABASE_URL:
        parts = DATABASE_URL.split("://", 1)
        if "@" in parts[1]:
            creds = parts[1].split("@", 1)
            if ":" in creds[0]:
                user = creds[0].split(":", 1)[0]
                safe_url = f"{parts[0]}://user:***@{creds[1]}"
    print(f"  [DB] Using DATABASE_URL env var: {safe_url}")

IS_SQLITE = DATABASE_URL.startswith("sqlite")

# SQLite needs different engine args (no connection pooling)
_engine_kwargs = dict(echo=os.getenv("ENV", "development") == "development")
if IS_SQLITE:
    _engine_kwargs["connect_args"] = {"check_same_thread": False}
else:
    _engine_kwargs["pool_pre_ping"] = True
    _engine_kwargs["pool_size"] = 5
    _engine_kwargs["max_overflow"] = 10
    _engine_kwargs["connect_args"] = {"connect_timeout": 10, "options": "-c statement_timeout=30000"}

engine = create_async_engine(DATABASE_URL, **_engine_kwargs)

AsyncSessionLocal = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autoflush=False,
    autocommit=False,
)

class Base(DeclarativeBase):
    pass

async def enable_rls():
    """Enable Row-Level Security (PostgreSQL only). Skipped for SQLite."""
    if IS_SQLITE:
        print("  [DB] Skipping RLS (SQLite)")
        return
    # RLS disabled - not needed for this application
    print("  [DB] RLS disabled")

async def set_current_user(user_id: str):
    if IS_SQLITE:
        return
    async with engine.begin() as conn:
        await conn.execute(text("SELECT set_config('app.current_user_id', :uid, TRUE)"), {"uid": user_id})

async def clear_current_user():
    if IS_SQLITE:
        return
    async with engine.begin() as conn:
        await conn.execute(text("SELECT set_config('app.current_user_id', '', TRUE)"))

async def init_db():
    """Create tables and enable RLS on startup."""
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    await enable_rls()
    print("\n  Database tables ready\n")

async def get_db():
    """FastAPI dependency -- yields an async DB session."""
    async with AsyncSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()
