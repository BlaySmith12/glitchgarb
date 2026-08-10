"""
routers/cart.py — Shopping cart endpoints
Matches all original Node.js /api/cart/* routes exactly.
"""

from datetime import datetime
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel

from database import get_db
from models import Cart, User, PromoCode
from schemas import CartItemAdd, CartItemUpdate, PromoCodeRequest
from auth import get_current_user, get_current_user_optional

router = APIRouter()


# ─────────────────────────────────────────────────────────────
#  Helpers
# ─────────────────────────────────────────────────────────────

def _calc_totals(items: list) -> dict:
    subtotal = sum(float(i.get("price", 0)) * int(i.get("quantity", 1)) for i in items)
    shipping = 0.0 if subtotal > 100 else 9.99
    tax = round(subtotal * 0.08, 2)
    total = round(subtotal + shipping + tax, 2)
    return {
        "subtotal": round(subtotal, 2),
        "shipping": round(shipping, 2),
        "tax": tax,
        "total": total,
    }


async def _get_or_create_cart(user_id: str, db: AsyncSession) -> Cart:
    result = await db.execute(select(Cart).where(Cart.user_id == user_id))
    cart = result.scalar_one_or_none()
    if not cart:
        cart = Cart(
            user_id=user_id,
            items=[],
            subtotal=0, shipping=0, tax=0, total=0, discount=0,
        )
        db.add(cart)
        await db.flush()
    return cart


def _cart_out(cart: Cart) -> dict:
    return {
        "items": cart.items or [],
        "subtotal": cart.subtotal,
        "shipping": cart.shipping,
        "tax": cart.tax,
        "total": cart.total,
        "discount": cart.discount,
        "promo_code": cart.promo_code,
    }


# ─────────────────────────────────────────────────────────────
#  GET /api/cart
# ─────────────────────────────────────────────────────────────

@router.get("/")
async def get_cart(
    db: AsyncSession = Depends(get_db),
    user: Optional[User] = Depends(get_current_user_optional),
):
    # Allow guest carts - if not logged in, return empty cart
    if not user:
        return {
            "items": [],
            "subtotal": 0,
            "shipping": 0,
            "tax": 0,
            "total": 0
        }
    
    cart = await _get_or_create_cart(user.id, db)
    await db.commit()
    return {"success": True, "cart": _cart_out(cart)}


# ─────────────────────────────────────────────────────────────
#  GET /api/cart/count
# ─────────────────────────────────────────────────────────────

@router.get("/count")
async def get_cart_count(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    cart = await _get_or_create_cart(user.id, db)
    await db.commit()
    count = sum(int(i.get("quantity", 1)) for i in (cart.items or []))
    return {"success": True, "count": count}


# ─────────────────────────────────────────────────────────────
#  GET /api/cart/total
# ─────────────────────────────────────────────────────────────

@router.get("/total")
async def get_cart_total(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    cart = await _get_or_create_cart(user.id, db)
    await db.commit()
    return {
        "success": True,
        "subtotal": cart.subtotal,
        "shipping": cart.shipping,
        "tax": cart.tax,
        "total": cart.total,
        "discount": cart.discount,
    }


# ─────────────────────────────────────────────────────────────
#  POST /api/cart  — Add item
# ─────────────────────────────────────────────────────────────

@router.post("/")
async def add_to_cart(
    body: CartItemAdd,
    user: Optional[User] = Depends(get_current_user_optional),
    db: AsyncSession = Depends(get_db),
):
    # If not logged in, return success (frontend will use localStorage)
    if not user:
        return {"success": True, "message": "Item added to cart (guest)", "guest": True}

    cart = await _get_or_create_cart(user.id, db)

    items: list = list(cart.items or [])
    item_id = f"{body.product_id}-{body.size or 'default'}-{body.color or 'default'}"

    # Find existing
    existing = next(
        (i for i in items
         if i.get("product_id") == body.product_id
         and i.get("size") == body.size
         and i.get("color") == body.color),
        None,
    )

    if existing:
        existing["quantity"] = int(existing.get("quantity", 1)) + int(body.quantity or 1)
    else:
        items.append({
            "id": item_id,
            "product_id": body.product_id,
            "name": body.name,
            "price": float(body.price),
            "quantity": int(body.quantity or 1),
            "size": body.size,
            "color": body.color,
            "image": body.image,
            "addedAt": datetime.utcnow().isoformat(),
        })

    totals = _calc_totals(items)
    cart.items = items
    cart.subtotal = totals["subtotal"]
    cart.shipping = totals["shipping"]
    cart.tax = totals["tax"]
    cart.total = totals["total"]
    cart.updated_at = datetime.utcnow()

    await db.commit()
    await db.refresh(cart)

    return {"success": True, "message": "Item added to cart", "cart": _cart_out(cart)}

    
# ─────────────────────────────────────────────────────────────
#  POST /api/cart/merge — Merge guest cart with user cart
# ─────────────────────────────────────────────────────────────

class CartMergeRequest(BaseModel):
    items: list


@router.post("/merge")
async def merge_guest_cart(
    body: CartMergeRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Merge localStorage cart items into user's cart after login."""
    cart = await _get_or_create_cart(user.id, db)
    existing_items: list = list(cart.items or [])

    for guest_item in body.items:
        # Generate same item_id format
        item_id = f"{guest_item.get('product_id')}-{guest_item.get('size', 'default')}-{guest_item.get('color', 'default')}"

        # Check if item already exists in user's cart
        existing = next(
            (i for i in existing_items
             if i.get("product_id") == guest_item.get("product_id")
             and i.get("size") == guest_item.get("size")
             and i.get("color") == guest_item.get("color")),
            None,
        )

        if existing:
            # Update quantity
            existing["quantity"] = int(existing.get("quantity", 1)) + int(guest_item.get("quantity", 1))
        else:
            # Add new item
            existing_items.append({
                "id": item_id,
                "product_id": guest_item.get("product_id"),
                "name": guest_item.get("name"),
                "price": float(guest_item.get("price", 0)),
                "quantity": int(guest_item.get("quantity", 1)),
                "size": guest_item.get("size"),
                "color": guest_item.get("color"),
                "image": guest_item.get("image"),
                "addedAt": guest_item.get("addedAt") or datetime.utcnow().isoformat(),
            })

    totals = _calc_totals(existing_items)
    cart.items = existing_items
    cart.subtotal = totals["subtotal"]
    cart.shipping = totals["shipping"]
    cart.tax = totals["tax"]
    cart.total = totals["total"]
    cart.updated_at = datetime.utcnow()

    await db.commit()
    await db.refresh(cart)

    return {"success": True, "message": "Cart merged successfully", "cart": _cart_out(cart)}

@router.put("/{item_id}")
async def update_cart_item(
    item_id: str,
    body: CartItemUpdate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if body.quantity < 0:
        raise HTTPException(400, "Please provide a valid quantity")

    cart = await _get_or_create_cart(user.id, db)
    items: list = list(cart.items or [])

    idx = next((i for i, it in enumerate(items) if it.get("id") == item_id), None)
    if idx is None:
        raise HTTPException(404, "Item not found in cart")

    if body.quantity == 0:
        items.pop(idx)
        msg = "Item removed from cart"
    else:
        items[idx]["quantity"] = body.quantity
        msg = "Cart updated"

    totals = _calc_totals(items)
    cart.items = items
    cart.subtotal = totals["subtotal"]
    cart.shipping = totals["shipping"]
    cart.tax = totals["tax"]
    cart.total = totals["total"]
    cart.updated_at = datetime.utcnow()

    await db.commit()
    await db.refresh(cart)

    return {"success": True, "message": msg, "cart": _cart_out(cart)}


# ─────────────────────────────────────────────────────────────
#  DELETE /api/cart/:itemId  — Remove item
# ─────────────────────────────────────────────────────────────

@router.delete("/{item_id}")
async def remove_from_cart(
    item_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    cart = await _get_or_create_cart(user.id, db)
    items: list = list(cart.items or [])

    idx = next((i for i, it in enumerate(items) if it.get("id") == item_id), None)
    if idx is None:
        raise HTTPException(404, "Item not found in cart")

    items.pop(idx)

    totals = _calc_totals(items)
    cart.items = items
    cart.subtotal = totals["subtotal"]
    cart.shipping = totals["shipping"]
    cart.tax = totals["tax"]
    cart.total = totals["total"]
    cart.updated_at = datetime.utcnow()

    await db.commit()
    await db.refresh(cart)

    return {"success": True, "message": "Item removed from cart", "cart": _cart_out(cart)}


# ─────────────────────────────────────────────────────────────
#  DELETE /api/cart  — Clear cart
# ─────────────────────────────────────────────────────────────

@router.delete("/")
async def clear_cart(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    cart = await _get_or_create_cart(user.id, db)
    cart.items = []
    cart.subtotal = 0
    cart.shipping = 0
    cart.tax = 0
    cart.total = 0
    cart.discount = 0
    cart.promo_code = None
    cart.updated_at = datetime.utcnow()
    await db.commit()

    return {
        "success": True,
        "message": "Cart cleared",
        "cart": _cart_out(cart),
    }


# ─────────────────────────────────────────────────────────────
#  POST /api/cart/promo  — Apply promo code
# ─────────────────────────────────────────────────────────────

@router.post("/promo")
async def apply_promo(
    body: PromoCodeRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if not body.code:
        raise HTTPException(400, "Please provide a promo code")

    # Look up promo code
    result = await db.execute(
        select(PromoCode).where(PromoCode.code == body.code.upper())
    )
    promo = result.scalar_one_or_none()

    if not promo or not promo.is_active:
        raise HTTPException(400, "Invalid promo code")

    if promo.expires_at and promo.expires_at < datetime.utcnow():
        raise HTTPException(400, "Promo code has expired")

    cart = await _get_or_create_cart(user.id, db)

    # Calculate discount
    if promo.type == "percentage":
        discount = round(cart.subtotal * (promo.value / 100), 2)
    else:
        discount = round(promo.value, 2)

    discount = min(discount, cart.subtotal)
    new_total = round(cart.subtotal + cart.shipping + cart.tax - discount, 2)

    cart.discount = discount
    cart.promo_code = body.code.upper()
    cart.total = new_total
    cart.updated_at = datetime.utcnow()
    await db.commit()

    return {
        "success": True,
        "message": "Promo code applied",
        "discount": discount,
        "new_total": new_total,
    }
