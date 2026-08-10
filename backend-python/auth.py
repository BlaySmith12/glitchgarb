"""
auth.py — JWT creation, verification, and FastAPI dependencies
"""

from datetime import datetime, timedelta
from typing import Optional

from jose import JWTError, jwt
import bcrypt

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

import os
from dotenv import load_dotenv
from datetime import datetime, timedelta
import time

from database import get_db
from models import User

load_dotenv()

# ─────────────────────────────────────────────────────
#  Config
# ─────────────────────────────────────────────────────

SECRET_KEY  = os.getenv("JWT_SECRET", "change-this-secret")
ALGORITHM   = os.getenv("JWT_ALGORITHM", "HS256")
EXPIRE_MIN  = int(os.getenv("JWT_EXPIRE_MINUTES", "10080"))  # 7 days
REFRESH_EXPIRE_DAYS = int(os.getenv("REFRESH_EXPIRE_DAYS", "30"))  # 30 days for refresh token

# Secret rotation check (Rule 04)
def check_secret_rotation():
    """Warn if JWT_SECRET is too old (90+ days)."""
    secret_file = os.getenv("JWT_SECRET_FILE", ".secret_created")
    if os.path.exists(secret_file):
        created = os.path.getmtime(secret_file)
        age_days = (time.time() - created) / 86400
        if age_days > 90:
            print(f"\n  [WARN] JWT_SECRET is {age_days:.0f} days old. Rotate every 90 days!\n")
    else:
        # Touch file on first use
        with open(secret_file, 'w') as f:
            f.write(str(datetime.utcnow()))

check_secret_rotation()

def hash_password(plain: str) -> str:
    salt = bcrypt.gensalt()
    hashed = bcrypt.hashpw(plain.encode('utf-8'), salt)
    return hashed.decode('utf-8')

def verify_password(plain: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(plain.encode('utf-8'), hashed.encode('utf-8'))
    except Exception as e:
        print(f"Password verification error: {e}")
        return False

bearer = HTTPBearer()

# ─────────────────────────────────────────────────────
#  Token helpers
# ─────────────────────────────────────────────────────

def create_access_token(user_id: str, extra: dict = {}) -> str:
    payload = {
        "sub": user_id,
        "exp": datetime.utcnow() + timedelta(minutes=EXPIRE_MIN),
        **extra,
    }
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)

def decode_token(token: str) -> dict:
    """Decode and return payload; raises HTTPException on failure."""
    try:
        return jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
        )

def create_refresh_token(user_id: str, db: AsyncSession) -> str:
    """Create and store a refresh token; returns the token string."""
    import uuid
    from datetime import datetime, timedelta
    
    token_str = str(uuid.uuid4())
    expires_at = datetime.utcnow() + timedelta(days=REFRESH_EXPIRE_DAYS)
    
    # Store in database
    from models import RefreshToken
    rt = RefreshToken(
        user_id=user_id,
        token=token_str,
        expires_at=expires_at,
    )
    db.add(rt)
    return token_str

async def verify_refresh_token(token: str, db: AsyncSession) -> str:
    """Validate refresh token and return user_id; raises if invalid."""
    from models import RefreshToken
    from datetime import datetime
    
    result = await db.execute(
        select(RefreshToken).where(
            RefreshToken.token == token,
            RefreshToken.revoked == False,
            RefreshToken.expires_at > datetime.utcnow(),
        )
    )
    rt = result.scalar_one_or_none()
    
    if not rt:
        raise HTTPException(status_code=401, detail="Invalid or expired refresh token")
    
    return rt.user_id

# ─────────────────────────────────────────────────────
#  FastAPI dependencies
# ─────────────────────────────────────────────────────

async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(bearer),
    db: AsyncSession = Depends(get_db),
) -> User:
    payload  = decode_token(credentials.credentials)
    user_id  = payload.get("sub")
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid token payload")

    result = await db.execute(select(User).where(User.id == user_id))
    user   = result.scalar_one_or_none()

    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return user

async def get_current_user_optional(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(
        HTTPBearer(auto_error=False)
    ),
    db: AsyncSession = Depends(get_db),
) -> Optional[User]:
    """Same as get_current_user but returns None for unauthenticated requests."""
    if not credentials:
        return None
    try:
        return await get_current_user(credentials, db)
    except HTTPException:
        return None

def require_admin(user: User = Depends(get_current_user)) -> User:
    if not user.is_admin:
        raise HTTPException(status_code=403, detail="Admin access required")
    return user
