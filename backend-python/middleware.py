"""
middleware.py — Security middleware for DoS protection and webhook verification
"""
from fastapi import Request, Response
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware
import time
import hashlib
import hmac
import os

# ============================================
#  File Signature Validation (Rule 18)
# ============================================

# Magic bytes for common file types
FILE_SIGNATURES = {
    # Images
    b'\xff\xd8\xff': 'image/jpeg',
    b'\x89PNG\r\n\x1a\n': 'image/png',
    b'GIF87a': 'image/gif',
    b'GIF89a': 'image/gif',
    b'RIFF': 'image/webp',  # (needs further check for WEBP)
    # Documents
    b'%PDF': 'application/pdf',
    # Archives
    b'PK\x03\x04': 'application/zip',  # Also docx, xlsx, etc.
}

def validate_file_signature(file_bytes: bytes, max_size: int = 5 * 1024 * 1024) -> tuple:
    """
    Validate file by signature (magic bytes), not extension (Rule 18).
    Returns: (is_valid: bool, message: str)
    """
    if len(file_bytes) > max_size:
        return (False, f"File too large. Max {max_size // (1024*1024)}MB")
    
    if len(file_bytes) < 4:
        return (False, "File too small to validate")
    
    # Check against known signatures
    for magic, mime_type in FILE_SIGNATURES.items():
        if file_bytes.startswith(magic):
            return (True, mime_type)
    
    return (False, "Unknown or invalid file type")

class DoSProtectionMiddleware(BaseHTTPMiddleware):
    """
    Basic DoS protection:
    - Rate limiting by IP (simple in-memory store)
    - Max 100 requests per minute per IP
    """
    
    def __init__(self, app, max_requests: int = 100, window_seconds: int = 60):
        super().__init__(app)
        self.max_requests = max_requests
        self.window_seconds = window_seconds
        self.requests = {}  # {ip: [timestamp1, timestamp2, ...]}
    
    async def dispatch(self, request: Request, call_next):
        # Get client IP (handle X-Forwarded-For for proxies like Cloudflare)
        client_ip = request.headers.get('X-Forwarded-For', '')
        if not client_ip:
            client_ip = request.headers.get('X-Real-IP', '')
        if not client_ip and request.client:
            client_ip = request.client.host.split(':')[0]  # Remove port
        if not client_ip:
            client_ip = "unknown"
        
        # Skip DoS protection for preflight and common endpoints
        if request.method == "OPTIONS" or request.url.path in ["/api/health", "/api", "/docs", "/redoc", "/openapi.json"]:
            return await call_next(request)
        
        current_time = time.time()
        
        # Initialize if first request from this IP
        if client_ip not in self.requests:
            self.requests[client_ip] = []
        
        # Clean old entries (requests older than window)
        self.requests[client_ip] = [
            t for t in self.requests[client_ip] 
            if current_time - t < self.window_seconds
        ]
        
        # Check rate limit
        if len(self.requests[client_ip]) >= self.max_requests:
            return JSONResponse(
                status_code=429,
                content={"success": False, "message": "Too many requests. Please try again later."}
            )
        
        # Add current request
        self.requests[client_ip].append(current_time)
        
        # Call next middleware/endpoint
        response = await call_next(request)
        return response


def verify_paystack_webhook(payload: bytes, signature: str) -> bool:
    """
    Verify Paystack webhook signature (Rule 19).
    Paystack sends X-Paystack-Signature header.
    """
    secret = os.getenv("PAYSTACK_SECRET_KEY", "")
    if not secret:
        return False
    
    # Paystack uses HMAC-SHA512
    expected = hmac.new(
        secret.encode('utf-8'),
        payload,
        hashlib.sha512
    ).hexdigest()
    
    return hmac.compare_digest(expected, signature)


class WebhookVerificationMiddleware(BaseHTTPMiddleware):
    """
    Verify webhook signatures before processing payment data (Rule 19).
    In test environment, never touch real systems (Rule 24).
    """
    
    async def dispatch(self, request: Request, call_next):
        # Only verify webhook endpoints
        if not request.url.path.startswith("/api/webhook"):
            return await call_next(request)
        
        # Skip real webhook processing in test environment (Rule 24)
        env = os.getenv("ENV", "development")
        if env == "test":
            # In test mode, just log and return success without processing
            body = await request.body()
            print(f"  [WEBHOOK] Test mode - skipped real processing")
            return JSONResponse(
                status_code=200,
                content={"success": True, "message": "Test mode - webhook logged only"}
            )
        
        # Get signature from header
        signature = request.headers.get("X-Paystack-Signature", "")
        if not signature:
            return JSONResponse(
                status_code=401,
                content={"success": False, "message": "Missing webhook signature"}
            )
        
        # Read body
        body = await request.body()
        
        # Verify signature
        if not verify_paystack_webhook(body, signature):
            return JSONResponse(
                status_code=401,
                content={"success": False, "message": "Invalid webhook signature"}
            )
        
        # Signature valid, continue
        return await call_next(request)
