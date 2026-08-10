"""
routers/orders.py — Order management endpoints
Matches all original Node.js /api/orders/* routes exactly.
"""

import random
import string
import uuid
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from database import get_db
from models import Order, Product, User, SiteSetting, Cart
from schemas import OrderCreate, OrderFromCart, OrderStatusUpdate, OrderTrackingUpdate, PaymentUpdate
from auth import get_current_user, require_admin, get_current_user_optional
from notifications import send_order_update, send_order_confirmation, send_telegram_order_notification

router = APIRouter()

VALID_STATUSES = [
    "pending", "confirmed", "processing",
    "in_transit", "in transit", "shipped", 
    "delivered", "cancelled", "refunded",
]


def _generate_order_number() -> str:
    ts = datetime.utcnow().strftime("%y%m%d%H%M%S")
    rnd = "".join(random.choices(string.ascii_uppercase + string.digits, k=4))
    return f"GG-{ts}-{rnd}"


def _order_out(o: Order) -> dict:
    return {
        "id": o.id,
        "order_number": o.order_number,
        "user_id": o.user_id,
        "items": o.items or [],
        "shipping_address": o.shipping_address,
        "billing_address": o.billing_address,
        "payment_method": o.payment_method,
        "customer_info": o.customer_info,
        "subtotal": o.subtotal,
        "shipping": o.shipping,
        "tax": o.tax,
        "total": o.total,
        "discount": o.discount,
        "promo_code": o.promo_code,
        "status": o.status,
        "payment_status": o.payment_status,
        "payment_reference": o.payment_reference,
        "tracking_number": o.tracking_number,
        "carrier": o.carrier,
        "tracking_url": o.tracking_url,
        "created_at": o.created_at.isoformat() if o.created_at else None,
        "updated_at": o.updated_at.isoformat() if o.updated_at else None,
    }


async def _deduct_stock(db: AsyncSession, items: list):
    """Decrement product stock for each item in the order."""
    print(f"[DEBUG] _deduct_stock called with {len(items)} items")
    for item in items:
        pid = item.get("productId") or item.get("product_id")
        qty = int(item.get("quantity", 1))
        print(f"[DEBUG] Processing item: pid={pid}, qty={qty}")
        if not pid:
            print(f"[DEBUG] No pid found for item: {item}")
            continue
        result = await db.execute(select(Product).where(Product.id == pid))
        product = result.scalar_one_or_none()
        if product:
            print(f"[DEBUG] Found product: {product.name}, current stock: {product.stock}")
            if product.stock < qty:
                print(f"[DEBUG] Insufficient stock for {product.name}: needs {qty}, has {product.stock}")
                raise HTTPException(400, f"Product {product.name} is no longer available in the requested quantity")
            
            # Use explicit subtraction and add to session
            product.stock = int(product.stock) - qty
            product.updated_at = datetime.utcnow()
            db.add(product)
            print(f"[DEBUG] New stock for {product.name}: {product.stock}")
        else:
            print(f"[DEBUG] Product not found for pid: {pid}")


# ─────────────────────────────────────────────────────────────
#  POST /api/orders
# ─────────────────────────────────────────────────────────────

@router.post("/", status_code=201)
async def create_order(
    body: OrderCreate,
    db: AsyncSession = Depends(get_db),
    user: Optional[User] = Depends(get_current_user_optional),
):
    if not body.items or not body.shipping_address or not body.customer_info:
        raise HTTPException(400, "Please provide items, shipping address, and customer info")

    order_number = _generate_order_number()
    
    # Set payment status based on whether a payment reference is provided
    payment_status = "paid" if body.payment_reference else "pending"

    # For guest orders, set user_id to None
    user_id = user.id if user else None

    order = Order(
        order_number=order_number,
        user_id=user_id,
        items=body.items,
        shipping_address=body.shipping_address,
        billing_address=body.billing_address or body.shipping_address,
        payment_method=body.payment_method or "card",
        customer_info=body.customer_info,
        subtotal=round(body.subtotal or 0, 2),
        shipping=round(body.shipping or 0, 2),
        tax=round(body.tax or 0, 2),
        total=round(body.total or 0, 2),
        discount=round(body.discount or 0, 2),
        promo_code=body.promo_code,
        status="confirmed" if body.payment_reference else "pending",
        payment_status=payment_status,
        payment_reference=body.payment_reference,
    )
    db.add(order)

    # Deduct stock
    await _deduct_stock(db, body.items)

    # Update user purchase history (only for logged-in users)
    if user:
        history = list(user.purchase_history or [])
        history.append(order_number)
        user.purchase_history = history
        user.updated_at = datetime.utcnow()

    await db.commit()
    await db.refresh(order)

    # Send Telegram notification
    tg_result = await db.execute(select(SiteSetting).filter(SiteSetting.key == "telegram_settings"))
    tg_setting = tg_result.scalar_one_or_none()
    if tg_setting and tg_setting.value and tg_setting.value.get("enabled"):
        cfg = tg_setting.value
        await send_telegram_order_notification(cfg.get("bot_token", ""), cfg.get("chat_id", ""), _order_out(order))

    # Send order confirmation email to customer
    customer_email = None
    if user:
        customer_email = user.email
    elif isinstance(order.customer_info, dict):
        customer_email = order.customer_info.get("email")
    
    print(f"  [ORDER] Order {order.order_number} created. Customer email: {customer_email}")
    
    if customer_email:
        print(f"  [ORDER] Sending confirmation email to {customer_email}...")
        email_sent = await send_order_confirmation(
            user_email=customer_email,
            order_number=order.order_number,
            items=order.items or [],
            subtotal=order.subtotal,
            shipping=order.shipping,
            tax=order.tax,
            total=order.total,
            discount=order.discount,
            shipping_address=order.shipping_address,
        )
        print(f"  [ORDER] Email send result: {'sent' if email_sent else 'FAILED'}")
    else:
        print(f"  [ORDER] No customer email found - skipping confirmation email")

    return {
        "success": True,
        "message": "Order created successfully",
        "order": _order_out(order),
    }


# ─────────────────────────────────────────────────────────────
#  POST /api/orders/cart
# ─────────────────────────────────────────────────────────────

@router.post("/cart", status_code=201)
async def create_order_from_cart(
    body: OrderFromCart,
    user: Optional[User] = Depends(get_current_user_optional),
    db: AsyncSession = Depends(get_db),
):
    # For authenticated users, get cart from database
    items = []
    if user:
        result = await db.execute(select(Cart).where(Cart.user_id == user.id))
        cart = result.scalar_one_or_none()

        if not cart or not cart.items:
            raise HTTPException(400, "Cart is empty")

        items = cart.items
    else:
        # For guest users, items should be in the request body
        if not body.items:
            raise HTTPException(400, "Cart is empty")
        items = body.items

    if not body.shipping_address:
        raise HTTPException(400, "Please provide shipping address")

    order_number = _generate_order_number()

    # Calculate totals for guest orders if not provided
    if not user or not body.subtotal:
        # Calculate from items
        subtotal = 0.0
        for i in items:
            price = float(i.get("price", 0))
            qty = int(i.get("quantity", 1))
            subtotal += price * qty
        shipping = 0.0 if subtotal > 100 else 9.99
        tax = round(subtotal * 0.08, 2)
        total = round(subtotal + shipping + tax, 2)
    else:
        subtotal = body.subtotal
        shipping = body.shipping
        tax = body.tax
        total = body.total

    # Set payment status based on whether a payment reference is provided
    payment_status = "paid" if body.payment_reference else "pending"

    # For guest orders, set user_id to None
    user_id = user.id if user else None

    order = Order(
        order_number=order_number,
        user_id=user_id,
        items=items,
        shipping_address=body.shipping_address,
        billing_address=body.billing_address or body.shipping_address,
        payment_method=body.payment_method or "card",
        customer_info=body.customer_info or ({"name": user.name, "email": user.email} if user else {}),
        subtotal=round(subtotal, 2),
        shipping=round(shipping, 2),
        tax=round(tax, 2),
        total=round(total, 2),
        discount=round(body.discount or 0, 2),
        promo_code=body.promo_code,
        status="confirmed" if body.payment_reference else "pending",
        payment_status=payment_status,
        payment_reference=body.payment_reference,
    )
    db.add(order)

    # Deduct stock
    await _deduct_stock(db, items)

    # Clear the cart if authenticated user
    if user:
        result = await db.execute(select(Cart).where(Cart.user_id == user.id))
        cart = result.scalar_one_or_none()
        if cart:
            cart.items = []
            cart.subtotal = 0
            cart.shipping = 0
            cart.tax = 0
            cart.total = 0
            cart.discount = 0
            cart.promo_code = None
            cart.updated_at = datetime.utcnow()

    # Update purchase history (only for logged-in users)
    if user:
        history = list(user.purchase_history or [])
        history.append(order_number)
        user.purchase_history = history
        user.updated_at = datetime.utcnow()

    await db.commit()
    await db.refresh(order)

    # Send Telegram notification
    tg_result = await db.execute(select(SiteSetting).filter(SiteSetting.key == "telegram_settings"))
    tg_setting = tg_result.scalar_one_or_none()
    if tg_setting and tg_setting.value and tg_setting.value.get("enabled"):
        cfg = tg_setting.value
        await send_telegram_order_notification(cfg.get("bot_token", ""), cfg.get("chat_id", ""), _order_out(order))

    # Send order confirmation email to customer
    customer_email = None
    if user:
        customer_email = user.email
    elif isinstance(order.customer_info, dict):
        customer_email = order.customer_info.get("email")
    
    print(f"  [ORDER/CART] Order {order.order_number} created. Customer email: {customer_email}")
    
    if customer_email:
        print(f"  [ORDER/CART] Sending confirmation email to {customer_email}...")
        email_sent = await send_order_confirmation(
            user_email=customer_email,
            order_number=order.order_number,
            items=order.items or [],
            subtotal=order.subtotal,
            shipping=order.shipping,
            tax=order.tax,
            total=order.total,
            discount=order.discount,
            shipping_address=order.shipping_address,
        )
        print(f"  [ORDER/CART] Email send result: {'sent' if email_sent else 'FAILED'}")
    else:
        print(f"  [ORDER/CART] No customer email found - skipping confirmation email")

    return {
        "success": True,
        "message": "Order created successfully",
        "order": _order_out(order),
    }


# ─────────────────────────────────────────────────────────────
#  GET /api/orders
# ─────────────────────────────────────────────────────────────

@router.get("/")
async def get_orders(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if user.is_admin:
        result = await db.execute(select(Order).order_by(Order.created_at.desc()))
    else:
        result = await db.execute(
            select(Order)
            .where(Order.user_id == user.id)
            .order_by(Order.created_at.desc())
        )

    orders = result.scalars().all()

    return {
        "success": True,
        "count": len(orders),
        "orders": [_order_out(o) for o in orders],
    }


# ─────────────────────────────────────────────────────────────
#  GET /api/orders/guest/:email
# ─────────────────────────────────────────────────────────────

@router.get("/guest/{email}")
async def get_guest_orders(email: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Order)
        .where(Order.user_id == None)
        .order_by(Order.created_at.desc())
    )
    all_orders = result.scalars().all()

    # Filter by customer email stored inside JSONB customer_info
    email_lower = email.lower()
    orders = [
        o for o in all_orders
        if isinstance(o.customer_info, dict)
        and o.customer_info.get("email", "").lower() == email_lower
    ]

    return {
        "success": True,
        "count": len(orders),
        "orders": [_order_out(o) for o in orders],
    }


# ─────────────────────────────────────────────────────────────
#  GET /api/orders/ref/:paymentReference
# ─────────────────────────────────────────────────────────────

@router.get("/ref/{payment_ref}")
async def get_order_by_ref(payment_ref: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Order).where(Order.payment_reference == payment_ref))
    order = result.scalar_one_or_none()
    if not order:
        raise HTTPException(404, "Order not found")
    return {"success": True, "order": _order_out(order)}


# ─────────────────────────────────────────────────────────────
#  GET /api/orders/:orderNumber (also accepts UUID as id)
# ─────────────────────────────────────────────────────────────

@router.get("/{order_identifier}")
async def get_order(order_identifier: str, db: AsyncSession = Depends(get_db)):
    # Try to find by order_number first, then by id (UUID)
    result = await db.execute(
        select(Order).where(
            (Order.order_number == order_identifier) | (Order.id == order_identifier)
        )
    )
    order = result.scalar_one_or_none()

    if not order:
        raise HTTPException(404, "Order not found")

    return {"success": True, "order": _order_out(order)}


@router.put("/{order_id}/payment")
async def update_payment(
    order_id: str,
    body: PaymentUpdate,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Order).where(Order.id == order_id)
    )
    order = result.scalar_one_or_none()
    if not order:
        raise HTTPException(404, "Order not found")
    order.payment_reference = body.payment_reference
    order.payment_status = "paid"
    order.status = "confirmed"
    order.updated_at = datetime.utcnow()
    await db.commit()
    await db.refresh(order)
    return {"success": True, "order": _order_out(order)}


# ─────────────────────────────────────────────────────────────
#  PUT /api/orders/:orderNumber/status  (admin)
# ─────────────────────────────────────────────────────────────

@router.put("/{order_number}/status")
async def update_order_status(
    order_number: str,
    body: OrderStatusUpdate,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    if body.status not in VALID_STATUSES:
        raise HTTPException(400, f"Valid statuses: {', '.join(VALID_STATUSES)}")

    result = await db.execute(select(Order).where(Order.order_number == order_number))
    order = result.scalar_one_or_none()

    if not order:
        raise HTTPException(404, "Order not found")

    old_status = order.status
    order.status = body.status
    order.updated_at = datetime.utcnow()

    # Send email notification (Rule: Order Updates)
    if old_status != body.status:
        customer_email = None
        if order.user_id:
            user_result = await db.execute(select(User).where(User.id == order.user_id))
            user = user_result.scalar_one_or_none()
            if user:
                customer_email = user.email
        if not customer_email and isinstance(order.customer_info, dict):
            customer_email = order.customer_info.get("email")

        if customer_email:
            from notifications import send_order_update, send_order_cancelled

            if body.status == "cancelled":
                await send_order_cancelled(
                    user_email=customer_email,
                    order_number=order.order_number,
                    reason="updated by admin"
                )
            else:
                await send_order_update(
                    user_email=customer_email,
                    order_number=order.order_number,
                    status=body.status,
                    order_total=order.total
                )

    await db.commit()

    return {
        "success": True,
        "message": "Order status updated successfully",
        "order": _order_out(order),
    }


# ─────────────────────────────────────────────────────────────
#  GET /api/orders/user/:userId  (current user)
# ─────────────────────────────────────────────────────────────

@router.get("/user/{user_id}")
async def get_user_orders(
    user_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user)
):
    """Get all orders for a specific user"""
    # Security check: User can only see their own orders unless they are an admin
    if str(user.id) != str(user_id) and not user.is_admin:
        raise HTTPException(403, "You do not have permission to view these orders")
        
    result = await db.execute(
        select(Order)
        .where(Order.user_id == user_id)
        .order_by(Order.created_at.desc())
    )
    orders = result.scalars().all()
    
    return {
        "success": True,
        "orders": [_order_out(o) for o in orders]
    }


# ─────────────────────────────────────────────────────────────
#  PUT /api/orders/:orderNumber/tracking  (admin)
# ─────────────────────────────────────────────────────────────

@router.put("/{order_number}/tracking")
async def add_tracking(
    order_number: str,
    body: OrderTrackingUpdate,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    if not body.tracking_number:
        raise HTTPException(400, "Please provide tracking number")

    result = await db.execute(select(Order).where(Order.order_number == order_number))
    order = result.scalar_one_or_none()

    if not order:
        raise HTTPException(404, "Order not found")

    order.tracking_number = body.tracking_number
    order.carrier = body.carrier
    order.tracking_url = body.tracking_url
    order.status = "shipped"
    order.updated_at = datetime.utcnow()

    # Send shipping notification (Rule: Order Updates)
    customer_email = None
    if order.user_id:
        user_result = await db.execute(select(User).where(User.id == order.user_id))
        user = user_result.scalar_one_or_none()
        if user:
            customer_email = user.email
    if not customer_email and isinstance(order.customer_info, dict):
        customer_email = order.customer_info.get("email")

    if customer_email:
        from notifications import send_order_update
        await send_order_update(
            user_email=customer_email,
            order_number=order.order_number,
            status="shipped",
            order_total=order.total
        )

    await db.commit()

    return {"success": True, "message": "Tracking information added successfully"}
