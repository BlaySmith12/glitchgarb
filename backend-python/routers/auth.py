"""
routers/auth.py — Authentication endpoints
Matches all original Node.js /api/auth/* routes exactly.
"""

from fastapi import APIRouter, Depends, HTTPException, status, Request, Response
from fastapi.responses import RedirectResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from datetime import datetime
import os
from dotenv import load_dotenv
from fastapi import BackgroundTasks

from database import get_db
from models import User
from schemas import (
    SignupRequest, LoginRequest,
    UpdateProfileRequest, UpdatePasswordRequest,
    ForgotPasswordRequest, ResetPasswordRequest,
    UserOut, TokenResponse, RefreshTokenRequest, RefreshTokenResponse,
)
from auth import (
    hash_password, verify_password,
    create_access_token, decode_token,
    create_refresh_token, verify_refresh_token,
    get_current_user, require_admin,
)
from audit import audit_logger
from notifications import send_welcome_email, send_password_reset
from notifications import send_welcome_email
from auth import (
    hash_password, verify_password,
    create_access_token, decode_token,
    get_current_user, require_admin,
    create_refresh_token, verify_refresh_token,
)

load_dotenv()

router = APIRouter()

# Google OAuth Config
GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID")
GOOGLE_CLIENT_SECRET = os.getenv("GOOGLE_CLIENT_SECRET")
GOOGLE_REDIRECT_URI = os.getenv("GOOGLE_REDIRECT_URI", "https://glitchgarb-api-mkma.onrender.com/api/auth/google/callback")

# Google OAuth endpoints
GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
GOOGLE_USER_INFO_URL = "https://www.googleapis.com/oauth2/v3/userinfo"


# ─────────────────────────────────────────────────────────────
#  POST /api/auth/signup
# ─────────────────────────────────────────────────────────────

@router.post("/signup", status_code=201)
async def signup(body: SignupRequest, db: AsyncSession = Depends(get_db), background_tasks: BackgroundTasks = BackgroundTasks()):
    # Validate
    if len(body.name.strip()) < 1:
        raise HTTPException(400, "Name is required")
    if len(body.password) < 6:
        raise HTTPException(400, "Password must be at least 6 characters")
    
    # Check duplicate email
    result = await db.execute(select(User).where(User.email == body.email.lower()))
    if result.scalar_one_or_none():
        raise HTTPException(400, "User already exists with this email")
    
    # Create user
    user = User(
        name=body.name.strip(),
        email=body.email.lower(),
        hashed_password=hash_password(body.password),
        is_admin=False,
        is_vip=False,
        purchase_history=[],
        watchlist=[],
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)

    token = create_access_token(user.id)
    refresh_token = create_refresh_token(user.id, db)
    await db.commit()

    # Send welcome email (Rule: Send welcome email after registration)
    background_tasks.add_task(
        send_welcome_email,
        user_email=user.email,
        user_name=user.name
    )

    return {
        "success": True,
        "message": "User created successfully",
        "token": token,
        "refresh_token": refresh_token,
        "user": {
            "id": user.id,
            "name": user.name,
            "email": user.email,
            "is_admin": user.is_admin,
            "is_vip": user.is_vip,
        },
    }


# ─────────────────────────────────────────────────────────────
#  POST /api/auth/login
# ─────────────────────────────────────────────────────────────

@router.post("/login")
async def login(body: LoginRequest, db: AsyncSession = Depends(get_db)):
    import traceback
    try:
        result = await db.execute(select(User).where(User.email == body.email.lower()))
        user = result.scalar_one_or_none()
        print(f"Login attempt: {body.email}, user found: {user is not None}")

        if not user or not verify_password(body.password, user.hashed_password):
            raise HTTPException(401, "Invalid email or password")

        token = create_access_token(user.id)
        refresh_token = create_refresh_token(user.id, db)
        await db.commit()

        return {
            "success": True,
            "message": "Login successful",
            "token": token,
            "refresh_token": refresh_token,
            "user": {
                "id": user.id,
                "name": user.name,
                "email": user.email,
                "is_admin": user.is_admin,
                "is_vip": user.is_vip,
            },
        }
    except Exception as e:
        print(f"Login error: {e}")
        print(traceback.format_exc())
        raise


# ─────────────────────────────────────────────────────────────
#  POST /api/auth/logout
# ─────────────────────────────────────────────────────────────

@router.post("/logout")
async def logout():
    # JWT is stateless — client clears the token
    return {
        "success": True,
        "message": "Logged out successfully. Please clear token on client side.",
    }


# ─────────────────────────────────────────────────────────────
#  GET /api/auth/me
# ─────────────────────────────────────────────────────────────

@router.get("/me")
async def get_me(user: User = Depends(get_current_user)):
    return {
        "success": True,
        "user": {
            "id": user.id,
            "name": user.name,
            "email": user.email,
            "is_admin": user.is_admin,
            "is_vip": user.is_vip,
            "purchase_history": user.purchase_history or [],
            "watchlist": user.watchlist or [],
            "created_at": user.created_at.isoformat() if user.created_at else None,
            "updated_at": user.updated_at.isoformat() if user.updated_at else None,
        },
    }


# ─────────────────────────────────────────────────────────────
#  PUT /api/auth/me
# ─────────────────────────────────────────────────────────────

@router.put("/me")
async def update_me(
    body: UpdateProfileRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if body.email and body.email.lower() != user.email:
        # Check if new email is taken
        result = await db.execute(select(User).where(User.email == body.email.lower()))
        if result.scalar_one_or_none():
            raise HTTPException(400, "Email is already taken")
        user.email = body.email.lower()

    if body.name:
        user.name = body.name.strip()

    user.updated_at = datetime.utcnow()
    await db.commit()
    await db.refresh(user)

    return {
        "success": True,
        "user": {
            "id": user.id,
            "name": user.name,
            "email": user.email,
            "is_admin": user.is_admin,
            "is_vip": user.is_vip,
        },
    }


# ─────────────────────────────────────────────────────────────
#  PUT /api/auth/password
# ─────────────────────────────────────────────────────────────

@router.put("/password")
async def update_password(
    body: UpdatePasswordRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if len(body.new_password) < 6:
        raise HTTPException(400, "Password must be at least 6 characters")

    user.hashed_password = hash_password(body.new_password)
    user.updated_at = datetime.utcnow()
    await db.commit()

    return {"success": True, "message": "Password updated successfully. Please login again."}


# ─────────────────────────────────────────────────────────────
#  POST /api/auth/vip
# ─────────────────────────────────────────────────────────────

@router.post("/vip")
async def upgrade_vip(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    user.is_vip = True
    user.updated_at = datetime.utcnow()
    await db.commit()

    return {"success": True, "message": "Upgraded to VIP successfully"}


# ─────────────────────────────────────────────────────────────
#  GET /api/auth/users  (admin only)
# ─────────────────────────────────────────────────────────────

@router.get("/users/")
async def get_all_users(
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(User).order_by(User.created_at.desc()))
    users = result.scalars().all()

    return {
        "success": True,
        "count": len(users),
        "users": [
            {
                "id": u.id,
                "name": u.name,
                "email": u.email,
                "is_admin": u.is_admin,
                "is_vip": u.is_vip,
                "purchase_history": u.purchase_history or [],
                "watchlist": u.watchlist or [],
                "created_at": u.created_at.isoformat() if u.created_at else None,
            }
            for u in users
        ],
    }


# ─────────────────────────────────────────────────────────────
#  POST /api/auth/verify-token
# ─────────────────────────────────────────────────────────────

@router.post("/verify-token")
async def verify_token(
    body: dict,
    db: AsyncSession = Depends(get_db),
):
    id_token = body.get("idToken") or body.get("token")
    if not id_token:
        raise HTTPException(400, "No token provided")

    payload = decode_token(id_token)
    user_id = payload.get("sub")

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()

    if not user:
        raise HTTPException(401, "User not found")

    return {
        "success": True,
        "user": {
            "id": user.id,
            "name": user.name,
            "email": user.email,
            "is_admin": user.is_admin,
            "is_vip": user.is_vip,
        },
    }


# ──────────────────────────────────────────────────────────────
#  Google OAuth endpoints
# ──────────────────────────────────────────────────────────────

@router.get("/google/login")
async def google_login():
    """Redirect user to Google OAuth"""
    if not GOOGLE_CLIENT_ID:
        raise HTTPException(500, "Google OAuth not configured")

    from urllib.parse import urlencode

    params = {
        "client_id": GOOGLE_CLIENT_ID,
        "redirect_uri": GOOGLE_REDIRECT_URI,
        "response_type": "code",
        "scope": "openid email profile",
        "access_type": "offline",
        "prompt": "select_account consent",
        "max_auth_age": "0",
        "include_granted_scopes": "false",
    }

    auth_url = GOOGLE_AUTH_URL + "?" + urlencode(params)
    return RedirectResponse(url=auth_url)


@router.get("/google/callback")
async def google_callback(code: str, db: AsyncSession = Depends(get_db)):
    """Handle Google OAuth callback"""
    if not GOOGLE_CLIENT_ID or not GOOGLE_CLIENT_SECRET:
        raise HTTPException(500, "Google OAuth not configured")
    
    import httpx
    
    # Exchange code for tokens
    token_data = {
        "code": code,
        "client_id": GOOGLE_CLIENT_ID,
        "client_secret": GOOGLE_CLIENT_SECRET,
        "redirect_uri": GOOGLE_REDIRECT_URI,
        "grant_type": "authorization_code",
    }
    
    async with httpx.AsyncClient() as client:
        token_response = await client.post(GOOGLE_TOKEN_URL, data=token_data)
        if token_response.status_code != 200:
            raise HTTPException(400, "Failed to get Google token")
        
        tokens = token_response.json()
        access_token = tokens.get("access_token")
        
        # Get user info
        user_response = await client.get(
            GOOGLE_USER_INFO_URL,
            headers={"Authorization": f"Bearer {access_token}"}
        )
        
        if user_response.status_code != 200:
            raise HTTPException(400, "Failed to get user info")
        
        user_info = user_response.json()
        email = user_info.get("email")
        name = user_info.get("name", "")
        
        if not email:
            raise HTTPException(400, "Email not provided by Google")
        
        # Check if user exists
        result = await db.execute(select(User).where(User.email == email.lower()))
        user = result.scalar_one_or_none()
        
        if not user:
            # Create new user
            user = User(
                name=name,
                email=email.lower(),
                hashed_password=hash_password("google-oauth-" + os.urandom(16).hex()),
                is_admin=False,
                is_vip=False,
                purchase_history=[],
                watchlist=[],
            )
            db.add(user)
            await db.commit()
            await db.refresh(user)
        
        # Create JWT token
        token = create_access_token(user.id)
        refresh_token = create_refresh_token(user.id, db)
        
        # Redirect to frontend with token
        frontend_url = os.getenv("FRONTEND_URL", "http://localhost:5500")
        redirect_url = f"{frontend_url}/login.html?token={token}&refresh_token={refresh_token}&email={email}"
        
        return RedirectResponse(url=redirect_url)


# ──────────────────────────────────────────────────────
#  POST /api/auth/refresh
# ──────────────────────────────────────────────────────

@router.post("/refresh")
async def refresh_token(body: RefreshTokenRequest, db: AsyncSession = Depends(get_db)):
    """Rotate refresh token: validate old, issue new pair."""
    user_id = await verify_refresh_token(body.refresh_token, db)
    
    # Revoke old refresh token
    result = await db.execute(
        select(RefreshToken).where(RefreshToken.token == body.refresh_token)
    )
    old_rt = result.scalar_one_or_none()
    if old_rt:
        old_rt.revoked = True
    
    # Create new tokens
    new_access = create_access_token(user_id)
    new_refresh = create_refresh_token(user_id, db)
    
    await db.commit()
    
    return {
        "success": True,
        "token": new_access,
        "refresh_token": new_refresh,
    }


# ──────────────────────────────────────────────────────
#  DELETE /api/auth/me (account deletion - Rule 21)
# ──────────────────────────────────────────────────────

@router.delete("/me")
async def delete_account(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    request: Request = None,
):
    """Delete user account (Rule 21 - Build real account deletion flows)."""
    from audit import audit_logger
    from datetime import datetime
    
    user_id = user.id
    user_email = user.email
    
    try:
        # Log the deletion event
        audit_logger.log_deletion(
            resource_type="user_account",
            resource_id=user_id,
            user_id=user_id,
            ip=request.client.host if request and request.client else None
        )
        
        # Delete user's refresh tokens
        await db.execute(
            select(RefreshToken).where(RefreshToken.user_id == user_id)
        )
        refresh_tokens = result.scalars().all()
        for rt in refresh_tokens:
            await db.delete(rt)
        
        # Delete user's cart
        result = await db.execute(
            select(Cart).where(Cart.user_id == user_id)
        )
        cart = result.scalar_one_or_none()
        if cart:
            await db.delete(cart)
        
        # Delete user's orders (or anonymize - here we delete)
        result = await db.execute(
            select(Order).where(Order.user_id == user_id)
        )
        orders = result.scalars().all()
        for order in orders:
            await db.delete(order)
        
        # Finally delete the user
        await db.delete(user)
        await db.commit()
        
        return {"success": True, "message": "Account deleted successfully"}
        
    except Exception as e:
        await db.rollback()
        raise HTTPException(500, f"Failed to delete account: {str(e)}")


# ──────────────────────────────────────────────────────
#  POST /api/auth/forgot-password
# ──────────────────────────────────────────────────────

@router.post("/forgot-password")
async def forgot_password(
    body: ForgotPasswordRequest, 
    db: AsyncSession = Depends(get_db),
    background_tasks: BackgroundTasks = BackgroundTasks()
):
    """Generate a reset token and send email."""
    result = await db.execute(select(User).where(User.email == body.email.lower()))
    user = result.scalar_one_or_none()
    
    if not user:
        # Don't reveal if user exists or not for security
        return {"success": True, "message": "If an account exists with this email, a reset link has been sent."}
    
    # Create a 1-hour reset token (Rule: Use JWT for stateless resets)
    from datetime import timedelta
    from auth import SECRET_KEY, ALGORITHM, jwt
    
    reset_payload = {
        "sub": user.id,
        "exp": datetime.utcnow() + timedelta(hours=1),
        "purpose": "password_reset"
    }
    reset_token = jwt.encode(reset_payload, SECRET_KEY, algorithm=ALGORITHM)
    
    # Send email
    background_tasks.add_task(
        send_password_reset,
        user_email=user.email,
        reset_token=reset_token
    )
    
    return {"success": True, "message": "Reset link sent successfully"}


# ──────────────────────────────────────────────────────
#  POST /api/auth/reset-password
# ──────────────────────────────────────────────────────

@router.post("/reset-password")
async def reset_password(body: ResetPasswordRequest, db: AsyncSession = Depends(get_db)):
    """Verify reset token and update password."""
    from auth import decode_token, hash_password
    
    try:
        payload = decode_token(body.token)
        if payload.get("purpose") != "password_reset":
            raise HTTPException(401, "Invalid token purpose")
            
        user_id = payload.get("sub")
        result = await db.execute(select(User).where(User.id == user_id))
        user = result.scalar_one_or_none()
        
        if not user:
            raise HTTPException(404, "User not found")
            
        if len(body.new_password) < 6:
            raise HTTPException(400, "Password must be at least 6 characters")
            
        user.hashed_password = hash_password(body.new_password)
        user.updated_at = datetime.utcnow()
        await db.commit()
        
        return {"success": True, "message": "Password reset successful. Please login with your new password."}
        
    except HTTPException as e:
        raise e
    except Exception as e:
        raise HTTPException(401, "Invalid or expired reset token")

# --------------------------------------------------------
# POST /api/auth/self-promote-admin (TEMPORARY)
# Allows the first user to promote themselves to admin.
# REMOVE after initial setup!
# --------------------------------------------------------

@router.post("/self-promote-admin")
async def self_promote_admin(body: dict, db: AsyncSession = Depends(get_db)):
    email = body.get("email", "").lower().strip()
    if not email:
        raise HTTPException(400, "Email required")
    result = await db.execute(select(User).where(User.email == email))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(404, "User not found")
    if user.is_admin:
        return {"success": True, "message": "Already admin", "is_admin": True}
    user.is_admin = True
    await db.commit()
    await db.refresh(user)
    return {"success": True, "message": "Promoted to admin", "is_admin": True}

# --------------------------------------------------------
# POST /api/auth/create-admin (TEMPORARY)
# Creates a new admin user. REMOVE after initial setup!
# --------------------------------------------------------

@router.post("/create-admin")
async def create_admin(body: dict, db: AsyncSession = Depends(get_db)):
    email = body.get("email", "").lower().strip()
    password = body.get("password", "").strip()
    name = body.get("name", "Admin")
    if not email or not password:
        raise HTTPException(400, "Email and password required")
    if len(password) < 6:
        raise HTTPException(400, "Password must be at least 6 characters")
    from sqlalchemy import select
    from models import User
    from auth import hash_password
    result = await db.execute(select(User).where(User.email == email))
    existing = result.scalar_one_or_none()
    if existing:
        raise HTTPException(400, "User already exists with this email")
    user = User(
        name=name,
        email=email,
        hashed_password=hash_password(password),
        is_admin=True,
        is_vip=False,
        purchase_history=[],
        watchlist=[],
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return {"success": True, "message": "Admin created", "email": user.email, "is_admin": True}
