"""
main.py â€” GlitchGarb FastAPI Application Entry Point
"""

import sys
import asyncio

if sys.platform == "win32":
    # Force SelectorEventLoop for psycopg compatibility
    import asyncio
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())

import os
from contextlib import asynccontextmanager
from datetime import datetime
import traceback
import logging

from dotenv import load_dotenv
from fastapi import FastAPI, Request, Response
from fastapi.responses import JSONResponse, HTMLResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
import os.path

from middleware import DoSProtectionMiddleware, WebhookVerificationMiddleware
from audit import audit_logger
from backup import run_backup_job
from database import engine, init_db
from routers import auth, products, orders, cart, settings, webhook
load_dotenv()


# â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
#  Lifespan: create tables on startup
# â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Create tables and enable RLS on startup
    await init_db()
    print("\n  Database tables and RLS ready\n")
    
    yield
    await engine.dispose()


# â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
#  App
# â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

app = FastAPI(
    title="GlitchGarb API",
    version="3.1.0",
    description="GlitchGarb e-commerce REST API — Python FastAPI + PostgreSQL",
    lifespan=lifespan,
    redirect_slashes=False,
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5500",
        "http://127.0.0.1:5500",
        "http://localhost:3000",
        "http://localhost:5000",
        "http://localhost:5001",
        "https://glitchgarb.com",
        "https://www.glitchgarb.com",
    ],
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
    allow_headers=["Content-Type", "Authorization", "X-Requested-With", "X-Paystack-Signature"],
)

# Ensure CORS headers are added to ALL responses (including error responses)
@app.middleware("http")
async def add_cors_headers(request: Request, call_next):
    origin = request.headers.get("Origin", "")
    allowed_origins = [
        "http://localhost:5500",
        "http://127.0.0.1:5500",
        "http://localhost:3000",
        "http://localhost:5000",
        "http://localhost:5001",
        "https://glitchgarb.com",
        "https://www.glitchgarb.com",
    ]
    try:
        response = await call_next(request)
    except Exception:
        response = JSONResponse(
            status_code=500,
            content={"detail": "Internal server error"},
        )
    if origin in allowed_origins:
        response.headers["Access-Control-Allow-Origin"] = origin
        response.headers["Access-Control-Allow-Credentials"] = "true"
        response.headers["Access-Control-Allow-Methods"] = "GET, POST, PUT, DELETE, OPTIONS, PATCH"
        response.headers["Access-Control-Allow-Headers"] = "Content-Type, Authorization, X-Requested-With, X-Paystack-Signature"
    return response

# Global exception handler - returns actual error messages
@app.exception_handler(500)
async def internal_error_handler(request: Request, exc: Exception):
    import traceback
    print(f"500 error: {exc}")
    print(traceback.format_exc())
    return JSONResponse(
        status_code=500,
        content={"detail": f"Internal error: {str(exc)}", "type": type(exc).__name__}
    )

@app.exception_handler(Exception)
async def generic_exception_handler(request: Request, exc: Exception):
    import traceback
    print(f"Unhandled error: {exc}")
    print(traceback.format_exc())
    return JSONResponse(
        status_code=500,
        content={"detail": str(exc), "type": type(exc).__name__}
    )

# Routers
app.include_router(auth.router,     prefix="/api/auth",     tags=["Auth"])
app.include_router(products.router, prefix="/api/products", tags=["Products"])
app.include_router(orders.router,   prefix="/api/orders",   tags=["Orders"])
app.include_router(cart.router,     prefix="/api/cart",     tags=["Cart"])
app.include_router(settings.router, prefix="/api/settings", tags=["Settings"])
app.include_router(webhook.router,  prefix="/api/webhook",  tags=["Webhooks"])


# â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
#  Health & Info
# â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

@app.get("/api/health", tags=["Health"])
async def health():
    from database import IS_SQLITE
    return {
        "success": True,
        "message": "GlitchGarb API is running",
        "version": "3.1.2",
        "database": "SQLite" if IS_SQLITE else "PostgreSQL",
        "timestamp": datetime.utcnow().isoformat(),
    }


@app.get("/api", tags=["Health"])
async def api_info():
    return {
        "success": True,
        "name": "GlitchGarb API",
        "version": "3.0.0",
        "database": "PostgreSQL",
        "docs": "/docs",
        "endpoints": {
            "auth": {
                "signup":          "POST /api/auth/signup",
                "login":           "POST /api/auth/login",
                "logout":          "POST /api/auth/logout",
                "me":              "GET  /api/auth/me",
                "update_profile":  "PUT  /api/auth/me",
                "update_password": "PUT  /api/auth/password",
                "upgrade_vip":     "POST /api/auth/vip",
                "all_users":       "GET  /api/auth/users  [admin]",
                "verify_token":    "POST /api/auth/verify-token",
            },
            "products": {
                "list":         "GET    /api/products",
                "live":         "GET    /api/products/live",
                "upcoming":     "GET    /api/products/upcoming",
                "get_one":      "GET    /api/products/:id",
                "create":       "POST   /api/products  [admin]",
                "update":       "PUT    /api/products/:id  [admin]",
                "delete":       "DELETE /api/products/:id  [admin]",
                "update_stock": "PUT    /api/products/:id/stock  [admin]",
            },
            "orders": {
                "create":           "POST /api/orders",
                "create_from_cart": "POST /api/orders/cart",
                "list":             "GET  /api/orders",
                "get_one":          "GET  /api/orders/:orderNumber",
                "guest_orders":     "GET  /api/orders/guest/:email",
                "update_status":    "PUT  /api/orders/:orderNumber/status  [admin]",
                "add_tracking":     "PUT  /api/orders/:orderNumber/tracking [admin]",
            },
            "cart": {
                "get":       "GET    /api/cart",
                "add":       "POST   /api/cart",
                "update":    "PUT    /api/cart/:itemId",
                "remove":    "DELETE /api/cart/:itemId",
                "clear":     "DELETE /api/cart",
                "count":     "GET    /api/cart/count",
                "total":     "GET    /api/cart/total",
                "promo":     "POST   /api/cart/promo",
            },
            "settings": {
                "hero_slides": "GET /api/settings/hero-slides, PUT /api/settings/hero-slides [admin]",
                "next_drop":   "GET /api/settings/next-drop, PUT /api/settings/next-drop [admin]",
            },
        },
    }


# â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
#  Run
# â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

if __name__ == "__main__":
    import uvicorn
    import selectors

    PORT = int(os.getenv("PORT", 5001))
    ENV  = os.getenv("ENV", "development")

    print(f"""
   ======================================================
   GlitchGarb API - Python FastAPI
   ======================================================
   Port     : {PORT}
   Env      : {ENV}
   Database : PostgreSQL (Neon)
   API      : http://localhost:{PORT}/api
   Docs     : http://localhost:{PORT}/docs
   ======================================================
     """)

    config = uvicorn.Config(
        app=app,
        host="0.0.0.0",
        port=PORT,
        reload=False,
        log_level="info",
        # We don't set loop="asyncio" here because we'll handle it ourselves
    )
    server = uvicorn.Server(config)

    if sys.platform == "win32":
        # This is the recommended way in the error message for Windows + psycopg3
        asyncio.run(
            server.serve(), 
            loop_factory=lambda: asyncio.SelectorEventLoop(selectors.SelectSelector())
        )
    else:
        server.run()



