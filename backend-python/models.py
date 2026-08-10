"""
models.py -- SQLAlchemy ORM models for GlitchGarb
Cross-database compatible: works with both PostgreSQL and SQLite.
"""

import uuid
from sqlalchemy import (
    Column, String, Boolean, Float, Integer,
    DateTime, Text, ForeignKey, JSON,
    ARRAY,
)
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from database import Base


def _uuid() -> str:
    return str(uuid.uuid4())


# ---------------------------------------------------------------
#  Users
# ---------------------------------------------------------------

class User(Base):
    __tablename__ = "users"

    id                 = Column(String, primary_key=True, default=_uuid)
    name               = Column(String(255), nullable=False)
    email              = Column(String(255), unique=True, nullable=False, index=True)
    hashed_password    = Column(String(255), nullable=False)
    is_admin           = Column(Boolean, default=False, nullable=False)
    is_vip             = Column(Boolean, default=False, nullable=False)
    purchase_history   = Column(ARRAY(String), default=list, nullable=False)
    watchlist          = Column(ARRAY(String), default=list, nullable=False)
    notification_prefs = Column(JSON, default={"new_drops": True, "order_updates": True, "promotional_offers": False}, nullable=False)
    created_at         = Column(DateTime(timezone=True), server_default=func.now())
    updated_at         = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    orders = relationship("Order", back_populates="user", lazy="select")
    cart   = relationship("Cart",  back_populates="user", uselist=False, lazy="select")


# ---------------------------------------------------------------
#  Products
# ---------------------------------------------------------------

class Product(Base):
    __tablename__ = "products"

    id             = Column(String, primary_key=True, default=_uuid)
    name           = Column(String(255), nullable=False)
    description    = Column(Text, default="")
    price          = Column(Float, nullable=False)
    original_price = Column(Float, nullable=True)
    category       = Column(String(100), default="general", index=True)
    images         = Column(ARRAY(String), default=list)
    gallery        = Column(JSON, default=list, nullable=False)
    sizes          = Column(ARRAY(String), default=lambda: ["S", "M", "L", "XL"])
    colors         = Column(ARRAY(String), default=list)
    stock          = Column(Integer, default=0)
    # status: 'draft' | 'live' | 'upcoming'
    status         = Column(String(50), default="draft", index=True)
    featured       = Column(Boolean, default=False)
    drop_date      = Column(DateTime(timezone=True), nullable=True)
    tags           = Column(ARRAY(String), default=list)
    created_at     = Column(DateTime(timezone=True), server_default=func.now())
    updated_at     = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


# ---------------------------------------------------------------
#  Refresh Tokens
# ---------------------------------------------------------------

class RefreshToken(Base):
    __tablename__ = "refresh_tokens"

    id          = Column(String, primary_key=True, default=_uuid)
    user_id     = Column(String, ForeignKey("users.id"), nullable=False, index=True)
    token       = Column(String(500), unique=True, nullable=False, index=True)
    expires_at  = Column(DateTime(timezone=True), nullable=False, index=True)
    revoked     = Column(Boolean, default=False, nullable=False)
    created_at  = Column(DateTime(timezone=True), server_default=func.now())

    user = relationship("User", lazy="select")


# ---------------------------------------------------------------
#  Orders
# ---------------------------------------------------------------

class Order(Base):
    __tablename__ = "orders"

    id                = Column(String, primary_key=True, default=_uuid)
    order_number      = Column(String(50), unique=True, nullable=False, index=True)
    user_id           = Column(String, ForeignKey("users.id"), nullable=True, index=True)
    items             = Column(JSON, default=list, nullable=False)
    shipping_address  = Column(JSON, nullable=False)
    billing_address   = Column(JSON, nullable=True)
    payment_method    = Column(String(50), default="card")
    customer_info     = Column(JSON, nullable=False)
    subtotal          = Column(Float, default=0)
    shipping          = Column(Float, default=0)
    tax               = Column(Float, default=0)
    total             = Column(Float, default=0)
    discount          = Column(Float, default=0)
    promo_code        = Column(String(50), nullable=True)
    status            = Column(String(50), default="pending")
    payment_status    = Column(String(50), default="pending")
    payment_reference = Column(String(100), nullable=True, index=True)
    tracking_number   = Column(String(100), nullable=True)
    carrier           = Column(String(100), nullable=True)
    tracking_url      = Column(String(500), nullable=True)
    created_at        = Column(DateTime(timezone=True), server_default=func.now())
    updated_at        = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    user = relationship("User", back_populates="orders", lazy="select")


# ---------------------------------------------------------------
#  Carts (one cart per user)
# ---------------------------------------------------------------

class Cart(Base):
    __tablename__ = "carts"

    id         = Column(String, primary_key=True, default=_uuid)
    user_id    = Column(String, ForeignKey("users.id"), unique=True, nullable=False, index=True)
    items      = Column(JSON, default=list, nullable=False)
    subtotal   = Column(Float, default=0)
    shipping   = Column(Float, default=0)
    tax        = Column(Float, default=0)
    total      = Column(Float, default=0)
    discount   = Column(Float, default=0)
    promo_code = Column(String(50), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    user = relationship("User", back_populates="cart", lazy="select")


# ---------------------------------------------------------------
#  Promo Codes
# ---------------------------------------------------------------

class PromoCode(Base):
    __tablename__ = "promo_codes"

    code       = Column(String(50), primary_key=True)
    # type: 'percentage' | 'fixed'
    type       = Column(String(20), nullable=False)
    value      = Column(Float, nullable=False)
    expires_at = Column(DateTime(timezone=True), nullable=True)
    is_active  = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

# ---------------------------------------------------------------
#  Site Settings (Global config)
# ---------------------------------------------------------------

class SiteSetting(Base):
    __tablename__ = "site_settings"

    key        = Column(String(100), primary_key=True)
    value      = Column(JSON, nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


# ---------------------------------------------------------------
#  Hero Slides
# ---------------------------------------------------------------

class HeroSlide(Base):
    __tablename__ = "hero_slides"

    id         = Column(String, primary_key=True, default=_uuid)
    image      = Column(String(500), nullable=False)
    title      = Column(String(255), default="")
    subtitle   = Column(String(500), default="")
    cta        = Column(String(100), default="")
    link       = Column(String(255), default="shop.html")
    enabled    = Column(Boolean, default=True, nullable=False)
    sort_order = Column(Integer, default=0, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

