"""
notifications.py - Email & Telegram notification helpers
Supports Resend HTTPS API (Render free tier) and SMTP (paid tiers / local)
Set EMAIL_PROVIDER=resend or EMAIL_PROVIDER=smtp to choose (auto-detects by default)
"""
import os
import smtplib
import httpx
import re
import asyncio
import traceback
from email.message import EmailMessage
from email.utils import formataddr, formatdate, make_msgid
from dotenv import load_dotenv

load_dotenv()

# Provider selection: 'resend' or 'smtp' (auto-detected from env vars)
EMAIL_PROVIDER = os.getenv("EMAIL_PROVIDER", "").lower()

# Resend config
RESEND_API_KEY = os.getenv("RESEND_API_KEY", "")

# SMTP config
SMTP_SERVER = os.getenv("SMTP_SERVER", "smtp.gmail.com")
SMTP_PORT = int(os.getenv("SMTP_PORT", "587"))
SMTP_USERNAME = os.getenv("SMTP_USERNAME", "")
SMTP_PASSWORD = os.getenv("SMTP_PASSWORD", "")

# Shared config
FROM_EMAIL = os.getenv("FROM_EMAIL", "noreply@glitchgarb.com")
FROM_NAME = os.getenv("FROM_NAME", "GlitchGarb")
REPLY_TO_EMAIL = os.getenv("REPLY_TO_EMAIL", FROM_EMAIL)
FROM_DOMAIN = FROM_EMAIL.split("@")[1] if "@" in FROM_EMAIL else "glitchgarb.com"

FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:5500")
LOGO_URL = os.getenv("LOGO_URL", f"{FRONTEND_URL}/logo.png")

LOGO_HTML = f'<img src="{LOGO_URL}" alt="GlitchGarb" style="width: 100px; height: auto; margin-bottom: 20px;" />'


def _html_to_text(html: str) -> str:
    """Strip HTML tags to produce a plain-text alternative."""
    text = re.sub(r"<br\s*/?>", "\n", html, flags=re.IGNORECASE)
    text = re.sub(r"</p>", "\n\n", text, flags=re.IGNORECASE)
    text = re.sub(r"</h[1-6]>", "\n\n", text, flags=re.IGNORECASE)
    text = re.sub(r"</li>", "\n", text, flags=re.IGNORECASE)
    text = re.sub(r"</tr>", "\n", text, flags=re.IGNORECASE)
    text = re.sub(r"<[^>]+>", "", text)
    text = re.sub(r"&nbsp;", " ", text)
    text = re.sub(r"&amp;", "&", text)
    text = re.sub(r"&lt;", "<", text)
    text = re.sub(r"&gt;", ">", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def _detect_provider():
    """Auto-detect email provider from configured env vars."""
    if EMAIL_PROVIDER == "resend":
        return "resend"
    if EMAIL_PROVIDER == "smtp":
        return "smtp"
    # Auto-detect: prefer Resend if API key set, fallback to SMTP if credentials set
    if RESEND_API_KEY:
        return "resend"
    if SMTP_USERNAME and SMTP_PASSWORD:
        return "smtp"
    return None


def _send_email_resend(to_email: str, subject: str, html_body: str, plain: str) -> bool:
    """Send via Resend HTTPS API (works on Render free tier)."""
    headers = {
        "Authorization": f"Bearer {RESEND_API_KEY}",
        "Content-Type": "application/json",
    }
    payload = {
        "from": f"{FROM_NAME} <{FROM_EMAIL}>",
        "to": [to_email],
        "subject": subject,
        "html": html_body,
        "text": plain,
        "reply_to": REPLY_TO_EMAIL,
    }
    response = httpx.post(
        "https://api.resend.com/emails",
        headers=headers,
        json=payload,
        timeout=15,
    )
    if response.status_code in (200, 201, 202):
        print(f"  [EMAIL/RESEND] Sent: {subject} to {to_email}")
        return True
    else:
        print(f"  [EMAIL/RESEND] API error {response.status_code}: {response.text}")
        return False


def _send_email_smtp(to_email: str, subject: str, html_body: str, plain: str) -> bool:
    """Send via SMTP (requires Render paid tier or local dev)."""
    try:
        msg = EmailMessage()
        msg["Subject"] = subject
        msg["From"] = formataddr((FROM_NAME, FROM_EMAIL))
        msg["To"] = to_email
        msg["Reply-To"] = REPLY_TO_EMAIL
        msg["Date"] = formatdate(localtime=True)
        msg["Message-ID"] = make_msgid(domain=FROM_DOMAIN)
        msg["X-Mailer"] = "GlitchGarb-Mailer/1.0"
        msg.set_content(plain)
        msg.add_alternative(html_body, subtype="html")

        if SMTP_PORT == 465:
            with smtplib.SMTP_SSL(SMTP_SERVER, SMTP_PORT, timeout=15) as server:
                server.ehlo()
                server.login(SMTP_USERNAME, SMTP_PASSWORD)
                server.send_message(msg)
        else:
            with smtplib.SMTP(SMTP_SERVER, SMTP_PORT, timeout=15) as server:
                server.ehlo()
                server.starttls()
                server.ehlo()
                server.login(SMTP_USERNAME, SMTP_PASSWORD)
                server.send_message(msg)

        print(f"  [EMAIL/SMTP] Sent: {subject} to {to_email}")
        return True
    except Exception as e:
        print(f"  [EMAIL/SMTP] Failed to send to {to_email}: {e}")
        traceback.print_exc()
        return False


def _send_email(to_email: str, subject: str, html_body: str, text_body: str = "") -> bool:
    """Send an email using the configured provider."""
    provider = _detect_provider()
    print(f"  [EMAIL] Attempting to send to {to_email} via {provider or 'NONE'}")

    if not provider:
        print(f"  [EMAIL] No provider configured - set RESEND_API_KEY or SMTP_USERNAME/SMTP_PASSWORD")
        return False

    plain = text_body if text_body else _html_to_text(html_body)

    if provider == "resend":
        return _send_email_resend(to_email, subject, html_body, plain)
    elif provider == "smtp":
        return _send_email_smtp(to_email, subject, html_body, plain)
    else:
        return False

    try:
        plain = text_body if text_body else _html_to_text(html_body)

        headers = {
            "Authorization": f"Bearer {RESEND_API_KEY}",
            "Content-Type": "application/json",
        }

        payload = {
            "from": f"{FROM_NAME} <{FROM_EMAIL}>",
            "to": [to_email],
            "subject": subject,
            "html": html_body,
            "text": plain,
            "reply_to": REPLY_TO_EMAIL,
        }

        # Use a thread since httpx sync is blocking
        response = httpx.post(
            "https://api.resend.com/emails",
            headers=headers,
            json=payload,
            timeout=15,
        )

        if response.status_code in (200, 201, 202):
            print(f"  [EMAIL] Sent: {subject} to {to_email}")
            return True
        else:
            print(f"  [EMAIL] Resend API error {response.status_code}: {response.text}")
            return False

    except Exception as e:
        print(f"  [EMAIL] Failed to send to {to_email}: {e}")
        traceback.print_exc()
        return False


# ============================================
#  Order Confirmation (sent on order placement)
# ============================================

async def send_order_confirmation(
    user_email: str,
    order_number: str,
    items: list,
    subtotal: float = 0.0,
    shipping: float = 0.0,
    tax: float = 0.0,
    total: float = 0.0,
    discount: float = 0.0,
    shipping_address: dict = None,
):
    items_rows = ""
    for item in items:
        name = item.get("name", "Item")
        qty = item.get("quantity", 1)
        price = item.get("price", 0)
        items_rows += f"""
            <tr>
                <td style="padding: 10px; border-bottom: 1px solid #333;">{name}</td>
                <td style="padding: 10px; border-bottom: 1px solid #333; text-align: center;">{qty}</td>
                <td style="padding: 10px; border-bottom: 1px solid #333; text-align: right;">GH₵ {float(price):.2f}</td>
            </tr>"""

    discount_row = f'<tr><td colspan="2" style="padding: 10px;">Discount</td><td style="padding: 10px; text-align: right;">- GH₵ {discount:.2f}</td></tr>' if discount else ""

    addr = shipping_address or {}
    address_html = ""
    if addr:
        address_html = f"""
            <div style="background: #1a1a1a; padding: 20px; border-radius: 8px; margin: 20px 0;">
                <h3 style="color: #00ff9d;">Shipping Address</h3>
                <p>{addr.get('name', '')}</p>
                <p>{addr.get('address', addr.get('line1', ''))}</p>
                <p>{addr.get('city', '')}, {addr.get('state', '')} {addr.get('postalCode', addr.get('zip', ''))}</p>
                <p>{addr.get('country', '')}</p>
            </div>"""

    subject = f"GlitchGarb | Order Confirmation #{order_number}"

    html_body = f"""
    <html>
    <body style="font-family: Arial, sans-serif; background: #0a0a0a; color: #e0e0e0;">
        <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
            {LOGO_HTML}
            <p>Thank you for your order!</p>
            <div style="background: #1a1a1a; padding: 20px; border-radius: 8px; margin: 20px 0;">
                <h3>Order #{order_number}</h3>
                <p><strong>Status:</strong> Confirmed</p>
            </div>
            <h3 style="color: #00ff9d;">Items</h3>
            <table style="width: 100%; border-collapse: collapse;">
                <thead>
                    <tr style="border-bottom: 2px solid #00ff9d;">
                        <th style="padding: 10px; text-align: left;">Product</th>
                        <th style="padding: 10px; text-align: center;">Qty</th>
                        <th style="padding: 10px; text-align: right;">Price</th>
                    </tr>
                </thead>
                <tbody>
                    {items_rows}
                </tbody>
            </table>
            <div style="margin-top: 20px; text-align: right;">
                <p>Subtotal: GH₵ {subtotal:.2f}</p>
                <p>Shipping: GH₵ {shipping:.2f}</p>
                <p>Tax: GH₵ {tax:.2f}</p>
                {discount_row}
                <p style="font-size: 1.2em; color: #00ff9d;"><strong>Total: GH₵ {total:.2f}</strong></p>
            </div>
            {address_html}
            <p style="margin-top: 20px;">We'll send you another email when your order ships.</p>
            <a href="{FRONTEND_URL}/profile.html"
               style="display: inline-block; background: #00ff9d; color: #0a0a0a;
                      padding: 12px 24px; text-decoration: none; border-radius: 4px; margin-top: 10px;">
                View Order Details
            </a>
        </div>
    </body>
    </html>
    """

    return await asyncio.to_thread(_send_email, user_email, subject, html_body)


# ============================================
#  Order Notifications (Rule: Order Updates)
# ============================================

async def send_order_update(user_email: str, order_number: str, status: str, order_total: float = 0.0):
    """Send order status update email (Rule: Order Updates)."""
    status_messages = {
        "pending": "Your order is pending confirmation.",
        "confirmed": "Your order has been confirmed and is being prepared.",
        "processing": "Your order is now being processed.",
        "shipped": "Your order has been shipped!",
        "delivered": "Your order has been delivered. Enjoy!",
        "cancelled": "Your order has been cancelled.",
        "refunded": "Your order has been refunded.",
    }
    
    status_message = status_messages.get(status, f"Your order status is now: {status}")
    
    subject = f"GlitchGarb | Order #{order_number} - {status.upper()}"
    
    html_body = f"""
    <html>
    <body style="font-family: Arial, sans-serif; background: #0a0a0a; color: #e0e0e0;">
        <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
            {LOGO_HTML}
            <p>Hi there,</p>
            <p>{status_message}</p>
            <div style="background: #1a1a1a; padding: 20px; border-radius: 8px; margin: 20px 0;">
                <h3>Order #{order_number}</h3>
                <p><strong>Status:</strong> {status}</p>
                <p><strong>Total:</strong> GH₵ {order_total:.2f}</p>
            </div>
            <a href="{FRONTEND_URL}/profile.html" 
               style="display: inline-block; background: #00ff9d; color: #0a0a0a; 
                      padding: 12px 24px; text-decoration: none; border-radius: 4px;">
                View Order Details
            </a>
        </div>
    </body>
    </html>
    """
    
    return await asyncio.to_thread(_send_email, user_email, subject, html_body)


# ============================================
#  New Drop Notifications (Rule: New Drops)
# ============================================

async def send_new_drop(user_email: str, product_name: str, drop_date: str, product_url: str):
    """Send new product drop notification (Rule: New Drops)."""
    subject = f"GlitchGarb | New Drop: {product_name}"
    
    html_body = f"""
    <html>
    <body style="font-family: Arial, sans-serif; background: #0a0a0a; color: #e0e0e0;">
        <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
            {LOGO_HTML}
            <p>Hi there,</p>
            <p>A new drop is available: <strong>{product_name}</strong></p>
            <p><strong>Drop Date:</strong> {drop_date}</p>
            <a href="{product_url}" 
               style="display: inline-block; background: #00ff9d; color: #0a0a0a; 
                      padding: 12px 24px; text-decoration: none; border-radius: 4px;">
                Shop Now
            </a>
        </div>
    </body>
    </html>
    """
    
    return await asyncio.to_thread(_send_email, user_email, subject, html_body)


# ============================================
#  Welcome Email (Rule: Welcome after registration)
# ============================================

async def send_welcome_email(user_email: str, user_name: str):
    """Send welcome email after registration."""
    subject = "Welcome to GlitchGarb!"
    
    html_body = f"""
    <html>
    <body style="font-family: Arial, sans-serif; background: #0a0a0a; color: #e0e0e0;">
        <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
            {LOGO_HTML}
            <h2 style="color: #00ff9d; margin: 0;">Welcome, {user_name}!</h2>
            <p>Thank you for joining the GlitchGarb community.</p>
            <p>Start shopping the latest urban streetwear drops.</p>
            <a href="{FRONTEND_URL}/shop.html" 
               style="display: inline-block; background: #00ff9d; color: #0a0a0a; 
                      padding: 12px 24px; text-decoration: none; border-radius: 4px;">
                Start Shopping
            </a>
        </div>
    </body>
    </html>
    """
    
    return await asyncio.to_thread(_send_email, user_email, subject, html_body)


# ============================================
#  Payment Failed Notification
# ============================================

async def send_payment_failed(user_email: str, order_number: str, amount: float):
    """Send payment failed notification."""
    subject = f"GlitchGarb | Payment Failed - Order #{order_number}"
    
    html_body = f"""
    <html>
    <body style="font-family: Arial, sans-serif; background: #0a0a0a; color: #e0e0e0;">
        <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
            {LOGO_HTML}
            <h2 style="color: #ff3333; margin: 0;">Payment Failed</h2>
            <p>Hi there,</p>
            <p>Your payment of <strong>GH₵ {amount:.2f}</strong> for order #{order_number} could not be processed.</p>
            <p>Please try again or use a different payment method.</p>
            <a href="{FRONTEND_URL}/checkout.html" 
               style="display: inline-block; background: #00ff9d; color: #0a0a0a; 
                      padding: 12px 24px; text-decoration: none; border-radius: 4px;">
                Retry Payment
            </a>
        </div>
    </body>
    </html>
    """
    
    return await asyncio.to_thread(_send_email, user_email, subject, html_body)


# ============================================
#  Order Cancelled Notification
# ============================================

async def send_order_cancelled(user_email: str, order_number: str, reason: str = "requested by customer"):
    """Send order cancellation notification."""
    subject = f"GlitchGarb | Order #{order_number} Cancelled"
    
    html_body = f"""
    <html>
    <body style="font-family: Arial, sans-serif; background: #0a0a0a; color: #e0e0e0;">
        <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
            {LOGO_HTML}
            <h2 style="color: #ff3333; margin: 0;">Order Cancelled</h2>
            <p>Hi there,</p>
            <p>Your order #{order_number} has been cancelled.</p>
            <p><strong>Reason:</strong> {reason}</p>
            <p>If you did not request this cancellation, please contact support.</p>
            <a href="{FRONTEND_URL}/contact.html" 
               style="display: inline-block; background: #00ff9d; color: #0a0a0a; 
                      padding: 12px 24px; text-decoration: none; border-radius: 4px;">
                Contact Support
            </a>
        </div>
    </body>
    </html>
    """
    
    return await asyncio.to_thread(_send_email, user_email, subject, html_body)


# ============================================
#  Promotional Offers (Rule: Promotional Offers)
# ============================================

async def send_promotional_offer(user_email: str, offer_title: str, offer_details: str, code: str = ""):
    """Send promotional offer notification (Rule: Promotional Offers)."""
    subject = f"GlitchGarb | {offer_title}"
    
    code_section = f"<p><strong>Use code:</strong> {code}</p>" if code else ""
    
    html_body = f"""
    <html>
    <body style="font-family: Arial, sans-serif; background: #0a0a0a; color: #e0e0e0;">
        <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
            {LOGO_HTML}
            <h2 style="color: #00ff9d; margin: 0;">{offer_title}</h2>
            <p>Hi there,</p>
            <p>{offer_details}</p>
            {code_section}
            <a href="{FRONTEND_URL}/shop.html" 
               style="display: inline-block; background: #00ff9d; color: #0a0a0a; 
                      padding: 12px 24px; text-decoration: none; border-radius: 4px;">
                Shop Now
            </a>
        </div>
    </body>
    </html>
    """
    
    return await asyncio.to_thread(_send_email, user_email, subject, html_body)

# ============================================
#  Password Reset Notification
# ============================================

async def send_password_reset(user_email: str, reset_token: str):
    """Send password reset link email."""
    subject = "GlitchGarb | Password Reset Request"
    
    reset_url = f"{FRONTEND_URL}/reset-password.html?token={reset_token}"
    
    html_body = f"""
    <html>
    <body style="font-family: Arial, sans-serif; background: #0a0a0a; color: #e0e0e0;">
        <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
            {LOGO_HTML}
            <p>Hi there,</p>
            <p>We received a request to reset your password. Click the button below to choose a new one:</p>
            <a href="{reset_url}" 
               style="display: inline-block; background: #00ff9d; color: #0a0a0a; 
                      padding: 12px 24px; text-decoration: none; border-radius: 4px; margin: 20px 0;">
                Reset Password
            </a>
            <p>If you did not request a password reset, you can safely ignore this email.</p>
            <p>This link will expire in 1 hour.</p>
        </div>
    </body>
    </html>
    """
    
    return await asyncio.to_thread(_send_email, user_email, subject, html_body)


async def send_telegram_order_notification(bot_token: str, chat_id: str, order_data: dict):
    if not bot_token or not chat_id:
        return
    order_number = order_data.get("order_number", "N/A")
    customer_info = order_data.get("customer_info", {})
    customer_name = customer_info.get("name", "Guest") if isinstance(customer_info, dict) else "Guest"
    customer_phone = customer_info.get("phone", "") if isinstance(customer_info, dict) else ""
    customer_email = customer_info.get("email", "") if isinstance(customer_info, dict) else ""
    total = order_data.get("total", 0)
    items = order_data.get("items", [])
    items_text = ""
    for item in items[:5]:
        name = item.get("name", "Item")
        qty = item.get("quantity", 1)
        price = item.get("price", 0)
        items_text += f"  - {name} x{qty} (GHS {float(price):.2f})\n"
    if len(items) > 5:
        items_text += f"  ... and {len(items) - 5} more item(s)\n"
    phone_line = f"Phone: {customer_phone}\n" if customer_phone else ""
    email_line = f"Email: {customer_email}\n" if customer_email else ""
    message = (
        f" NEW ORDER!\n\n"
        f"Order: {order_number}\n"
        f"Customer: {customer_name}\n"
        f"{phone_line}{email_line}"
        f"Total: GHS {float(total):.2f}\n\n"
        f"Items:\n{items_text}"
    )
    try:
        import httpx
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.post(
                f"https://api.telegram.org/bot{bot_token}/sendMessage",
                json={"chat_id": chat_id, "text": message},
            )
            if resp.status_code != 200:
                print(f"[Telegram] Failed: {resp.text}")
            else:
                print(f"[Telegram] Notification sent for order {order_number}")
    except Exception as e:
        print(f"[Telegram] Error: {e}")
