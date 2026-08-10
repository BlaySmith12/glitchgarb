"""
schemas.py — Pydantic v2 request / response models
"""

from __future__ import annotations
from datetime import datetime
from typing import Any, List, Optional
from pydantic import BaseModel, EmailStr, field_validator


# ─────────────────────────────────────────────────────────────
#  Auth
# ─────────────────────────────────────────────────────────────

class SignupRequest(BaseModel):
    name: str
    email: EmailStr
    password: str

class LoginRequest(BaseModel):
    email: EmailStr
    password: str

class UpdateProfileRequest(BaseModel):
    name: Optional[str] = None
    email: Optional[EmailStr] = None

class UpdatePasswordRequest(BaseModel):
    new_password: str

class ForgotPasswordRequest(BaseModel):
    email: EmailStr

class ResetPasswordRequest(BaseModel):
    token: str
    new_password: str

class UserOut(BaseModel):
    id: str
    name: str
    email: str
    is_admin: bool
    is_vip: bool
    purchase_history: List[str] = []
    watchlist: List[str] = []
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    model_config = {"from_attributes": True}

class TokenResponse(BaseModel):
    success: bool
    token: str
    refresh_token: str
    user: UserOut

class RefreshTokenRequest(BaseModel):
    refresh_token: str

class RefreshTokenResponse(BaseModel):
    success: bool
    token: str
    refresh_token: str


# ─────────────────────────────────────────────────────────────
#  Products
# ─────────────────────────────────────────────────────────────

class ProductCreate(BaseModel):
    name: str
    description: Optional[str] = ""
    price: float
    original_price: Optional[float] = None
    category: Optional[str] = "general"
    images: Optional[List[str]] = []
    gallery: Optional[List[Any]] = []
    sizes: Optional[List[str]] = ["S", "M", "L", "XL"]
    colors: Optional[List[str]] = []
    stock: Optional[int] = 0
    drop_date: Optional[datetime] = None
    status: Optional[str] = "draft"
    featured: Optional[bool] = False
    tags: Optional[List[str]] = []

class ProductUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    price: Optional[float] = None
    original_price: Optional[float] = None
    category: Optional[str] = None
    images: Optional[List[str]] = None
    gallery: Optional[List[Any]] = None
    sizes: Optional[List[str]] = None
    colors: Optional[List[str]] = None
    stock: Optional[int] = None
    drop_date: Optional[datetime] = None
    status: Optional[str] = None
    featured: Optional[bool] = None
    tags: Optional[List[str]] = None

class StockUpdateRequest(BaseModel):
    stock: int
    operation: str = "set"  # set | add | subtract

class ProductOut(BaseModel):
    id: str
    name: str
    description: str = ""
    price: float
    original_price: Optional[float] = None
    category: str = "general"
    images: List[str] = []
    gallery: List[dict] = []
    sizes: List[str] = []
    colors: List[str] = []
    stock: int = 0
    status: str = "draft"
    featured: bool = False
    drop_date: Optional[datetime] = None
    tags: List[str] = []
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


# ─────────────────────────────────────────────────────────────
#  Orders
# ─────────────────────────────────────────────────────────────

class OrderCreate(BaseModel):
    items: List[Any]
    shipping_address: dict
    billing_address: Optional[dict] = None
    payment_method: Optional[str] = "card"
    customer_info: dict
    user_id: Optional[str] = None
    subtotal: Optional[float] = 0
    shipping: Optional[float] = 0
    tax: Optional[float] = 0
    total: Optional[float] = 0
    discount: Optional[float] = 0
    promo_code: Optional[str] = None
    payment_reference: Optional[str] = None

class OrderFromCart(BaseModel):
    shipping_address: dict
    billing_address: Optional[dict] = None
    payment_method: Optional[str] = "card"
    payment_reference: Optional[str] = None
    items: Optional[list] = None  # For guest orders
    subtotal: Optional[float] = None
    shipping: Optional[float] = None
    tax: Optional[float] = None
    total: Optional[float] = None
    discount: Optional[float] = None
    promo_code: Optional[str] = None
    customer_info: Optional[dict] = None

class OrderStatusUpdate(BaseModel):
    status: str

class OrderTrackingUpdate(BaseModel):
    tracking_number: str
    carrier: Optional[str] = None
    tracking_url: Optional[str] = None

class PaymentUpdate(BaseModel):
    payment_reference: str

class OrderOut(BaseModel):
    id: str
    order_number: str
    user_id: Optional[str] = None
    items: List[Any] = []
    shipping_address: dict
    billing_address: Optional[dict] = None
    payment_method: str = "card"
    customer_info: dict
    subtotal: float = 0
    shipping: float = 0
    tax: float = 0
    total: float = 0
    discount: float = 0
    promo_code: Optional[str] = None
    status: str = "pending"
    payment_status: str = "pending"
    payment_reference: Optional[str] = None
    tracking_number: Optional[str] = None
    carrier: Optional[str] = None
    tracking_url: Optional[str] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


# ─────────────────────────────────────────────────────────────
#  Cart
# ─────────────────────────────────────────────────────────────

class CartItemAdd(BaseModel):
    product_id: str
    name: str
    price: float
    quantity: Optional[int] = 1
    size: Optional[str] = None
    color: Optional[str] = None
    image: Optional[str] = None

class CartItemUpdate(BaseModel):
    quantity: int

class PromoCodeRequest(BaseModel):
    code: str

# ─────────────────────────────────────────────────────────────
#  Settings
# ─────────────────────────────────────────────────────────────

class HeroSlide(BaseModel):
    id: str | int | None = None
    image: Optional[str] = None
    title: Optional[str] = None
    subtitle: Optional[str] = None
    cta: Optional[str] = None
    link: Optional[str] = None
    enabled: Optional[bool] = None
    sort_order: Optional[int] = 0

class HeroSlidesUpdate(BaseModel):
    slides: Optional[List[HeroSlide]] = []

class NextDropUpdate(BaseModel):
    enabled: bool
    productId: Optional[str] = None
    dropDate: Optional[str] = None
    title: Optional[str] = None
    description: Optional[str] = None
    bannerImage: Optional[str] = None

class CartOut(BaseModel):
    items: List[Any] = []
    subtotal: float = 0
    shipping: float = 0
    tax: float = 0
    total: float = 0
    discount: float = 0
    promo_code: Optional[str] = None
