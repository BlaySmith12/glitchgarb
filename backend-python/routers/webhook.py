"""
routers/webhook.py — Payment webhook endpoints (Rule 19 & 24)
Verify webhook signatures before processing payment data.
Never touch real systems in test environment (Rule 24).
"""
from fastapi import APIRouter, Request, Response, HTTPException
from fastapi.responses import JSONResponse
import hmac
import hashlib
import os
import json

router = APIRouter()

PAYSTACK_SECRET = os.getenv("PAYSTACK_SECRET_KEY", "")

# ============================================
#  Paystack Webhook (Rule 19: Verify signature)
# ============================================

@router.post("/paystack")
async def paystack_webhook(request: Request):
    """Handle Paystack payment webhook with signature verification."""
    from dotenv import load_dotenv
    load_dotenv()
    
    # Get signature from header
    signature = request.headers.get("X-Paystack-Signature", "")
    
    if not signature:
        raise HTTPException(400, "Missing signature")
    
    # Read body
    body = await request.body()
    
    # Verify signature (Rule 19)
    if not verify_paystack_signature(body, signature):
        raise HTTPException(401, "Invalid signature")
    
    # Never touch real systems in test environment (Rule 24)
    env = os.getenv("ENV", "development")
    if env == "test":
        print(f"  [WEBHOOK] Test mode - skipping real processing")
        return JSONResponse(
            status_code=200,
            content={"success": True, "message": "Test mode - webhook logged only"}
        )
    
    # Parse webhook data
    try:
        data = json.loads(body)
    except:
        raise HTTPException(400, "Invalid JSON")
    
    event = data.get("event")
    data = data.get("data", {})
    
    if event == "charge.success":
        # Payment successful
        reference = data.get("reference")
        status = data.get("status")
        
        if reference and status == "success":
            # Update order status to confirmed
            from database import get_db
            from models import Order
            
            async with get_db() as db:
                result = await db.execute(
                    select(Order).where(Order.payment_reference == reference)
                )
                order = result.scalar_one_or_none()
                
                if order:
                    old_status = order.status
                    order.status = "confirmed"
                    order.updated_at = datetime.utcnow()
                    
                    # Send confirmation email
                    if order.user_id:
                        from models import User
                        user_result = await db.execute(
                            select(User).where(User.id == order.user_id)
                        )
                        user = user_result.scalar_one_or_none()
                        if user:
                            from notifications import send_order_update
                            await send_order_update(
                                user_email=user.email,
                                order_number=order.order_number,
                                status="confirmed",
                                order_total=order.total
                            )
                    
                    await db.commit()
            
            return {"success": True, "message": "Payment confirmed"}
    
    elif event in ["charge.failed", "charge.unsuccessful"]:
        # Payment failed
        reference = data.get("reference")
        amount = data.get("amount", 0) / 100  # Convert from kobo to cedis
        
        if reference:
            from database import get_db
            from models import Order
            
            async with get_db() as db:
                result = await db.execute(
                    select(Order).where(Order.payment_reference == reference)
                )
                order = result.scalar_one_or_none()
                
                if order:
                    # Send payment failed notification
                    if order.user_id:
                        from models import User
                        user_result = await db.execute(
                            select(User).where(User.id == order.user_id)
                        )
                        user = user_result.scalar_one_or_none()
                        if user:
                            from notifications import send_payment_failed
                            await send_payment_failed(
                                user_email=user.email,
                                order_number=order.order_number,
                                amount=amount
                            )
                    
                    await db.commit()
            
            return {"success": True, "message": "Payment failure logged"}
    
    return {"success": True, "message": "Event not handled"}


def verify_paystack_signature(payload: bytes, signature: str) -> bool:
    """Verify Paystack webhook signature (Rule 19)."""
    if not PAYSTACK_SECRET:
        return False
    
    expected = hmac.new(
        PAYSTACK_SECRET.encode('utf-8'),
        payload,
        hashlib.sha512
    ).hexdigest()
    
    return hmac.compare_digest(expected, signature)
