"""
routers/settings.py — Site settings API endpoints (hero slides, next drop, etc.)
"""

from typing import Any, Dict, List, Optional
import base64
import binascii
import re

from fastapi import APIRouter, Depends, HTTPException, Response
from fastapi.responses import RedirectResponse
from pydantic import BaseModel

from database import get_db
from models import SiteSetting, User, HeroSlide
from auth import get_current_user, require_admin
from schemas import HeroSlidesUpdate, NextDropUpdate
from sqlalchemy.orm.attributes import flag_modified


from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete

router = APIRouter()

_DATA_URI_RE = re.compile(r"^data:image/(?P<mime>[\w.+-]+);base64,(?P<b64>.+)$", re.DOTALL)


class TelegramSettings(BaseModel):
    bot_token: Optional[str] = None
    chat_id: Optional[str] = None
    enabled: bool = False


def _decode_data_uri(value: str):
    if not value:
        return None
    m = _DATA_URI_RE.match(value)
    if m:
        mime, b64 = m.group("mime"), m.group("b64")
    elif value.startswith("/api/") or value.startswith("http://") or value.startswith("https://"):
        return None
    else:
        mime, b64 = "jpeg", value
    try:
        data = base64.b64decode(b64)
    except (binascii.Error, ValueError):
        return None
    if not data:
        return None
    return (mime, data)


def _slide_image_url(slide_id: str) -> str:
    return f"/api/settings/hero-slides/{slide_id}/image"


def _slide_out(slide) -> dict:
    out = dict(slide) if isinstance(slide, dict) else {}
    stored_image = str(out.get("image") or "")
    if stored_image.startswith("http://") or stored_image.startswith("https://"):
        out["image"] = stored_image
    elif stored_image.startswith("/api/"):
        out["image"] = stored_image
    else:
        out["image"] = _slide_image_url(str(out.get("id") or ""))
    return out


# ─────────────────────────────────────────────────────────────
#  Hero Slides
# ─────────────────────────────────────────────────────────────

@router.get("/hero-slides/", tags=["Settings"])
async def get_hero_slides(db: AsyncSession = Depends(get_db)):
    """Get hero slides from database"""
    # Try new HeroSlide table first
    try:
        result = await db.execute(
            select(HeroSlide).where(HeroSlide.enabled == True).order_by(HeroSlide.sort_order)
        )
        slides = result.scalars().all()
        if slides:
            return {
                "success": True,
                "slides": [
                    _slide_out({"id": s.id, "image": s.image, "title": s.title, "subtitle": s.subtitle,
                     "cta": s.cta, "link": s.link, "enabled": s.enabled, "sort_order": s.sort_order})
                    for s in slides
                ]
            }
    except Exception:
        pass  # Table doesn't exist yet
    
    # Fallback: read from SiteSetting JSON blob
    result = await db.execute(select(SiteSetting).filter(SiteSetting.key == "hero_slides"))
    setting = result.scalar_one_or_none()
    if setting and setting.value:
        return {"success": True, "slides": [_slide_out(s) for s in setting.value]}
    
    # Return defaults
    return {"success": True, "slides": [
        {"id": "default-1", "image": "https://images.unsplash.com/photo-1552374196-1ab2a1c593e8?auto=format&fit=crop&q=80&w=1587",
         "title": "GLITCH<br>CORE", "subtitle": "THE FOUNDATION COLLECTION. LIMITED NUMBERS.",
         "cta": "Secure the Drop", "link": "shop.html", "enabled": True, "sort_order": 0},
        {"id": "default-2", "image": "https://images.unsplash.com/photo-1508427953056-b00b8d78ebf5?auto=format&fit=crop&q=80&w=1740",
         "title": "URBAN<br>UTILITY", "subtitle": "ENGINEERED FOR THE STREETS. GHANA PRIDE.",
         "cta": "View Collection", "link": "shop.html", "enabled": True, "sort_order": 1}
    ]}


@router.get("/hero-slides/{slide_id}/image", tags=["Settings"])
async def get_hero_slide_image(
    slide_id: str,
    db: AsyncSession = Depends(get_db),
):
    """Serve a hero slide image as binary (base64 stored in DB -> image bytes)."""
    # Try HeroSlide table
    try:
        result = await db.execute(select(HeroSlide).where(HeroSlide.id == slide_id))
        slide = result.scalar_one_or_none()
        if slide:
            return _serve_slide_image(slide.image)
    except Exception:
        pass

    # Fallback: SiteSetting JSON blob
    result = await db.execute(select(SiteSetting).filter(SiteSetting.key == "hero_slides"))
    setting = result.scalar_one_or_none()
    if setting and setting.value:
        for s in setting.value:
            if isinstance(s, dict) and str(s.get("id") or "") == slide_id:
                return _serve_slide_image(s.get("image", ""))

    raise HTTPException(404, "Image not found")


def _serve_slide_image(value: str):
    if not value:
        raise HTTPException(404, "Image not found")
    if value.startswith("http://") or value.startswith("https://"):
        return RedirectResponse(value, status_code=302)
    decoded = _decode_data_uri(value)
    if decoded is None:
        raise HTTPException(404, "Image not found")
    mime, data = decoded
    return Response(
        content=data,
        media_type=f"image/{mime}",
        headers={
            "Cache-Control": "public, max-age=86400",
            "Content-Length": str(len(data)),
        },
    )


@router.put("/hero-slides/", tags=["Settings"])
async def update_hero_slides(
    data: HeroSlidesUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Update hero slides - saves to SiteSetting JSON blob (works with all deployments)"""
    if not current_user.is_admin:
        raise HTTPException(status_code=403, detail="Admin access required")
    
    slides_list = data.slides or []

    # Load existing stored slides so admin-saved image URLs can be mapped back to
    # the original base64 (the admin form round-trips our /api/... image URLs).
    existing_by_id = {}
    try:
        result = await db.execute(select(SiteSetting).filter(SiteSetting.key == "hero_slides"))
        setting = result.scalar_one_or_none()
        if setting and setting.value:
            for s in setting.value:
                if isinstance(s, dict) and s.get("id"):
                    existing_by_id[str(s["id"])] = s
    except Exception:
        pass

    # Save to SiteSetting JSON blob (always works)
    slides_data = []
    for s in slides_list:
        d = s.model_dump()
        image_value = d.get("image", "")
        sid = str(d.get("id") or "")
        if isinstance(image_value, str) and image_value.startswith("/api/settings/hero-slides/"):
            existing = existing_by_id.get(sid)
            if existing and existing.get("image"):
                image_value = existing["image"]
        slides_data.append({
            "id": sid,
            "image": image_value,
            "title": d.get("title", ""),
            "subtitle": d.get("subtitle", ""),
            "cta": d.get("cta", ""),
            "link": d.get("link", "shop.html"),
            "enabled": d.get("enabled", True),
            "sort_order": d.get("sort_order", 0)
        })
    
    try:
        result = await db.execute(select(SiteSetting).filter(SiteSetting.key == "hero_slides"))
        setting = result.scalar_one_or_none()
        if not setting:
            setting = SiteSetting(key="hero_slides", value=slides_data)
            db.add(setting)
        else:
            setting.value = slides_data
            flag_modified(setting, "value")
        
        await db.commit()
        return {"success": True, "message": "Hero slides updated", "count": len(slides_data)}
    except Exception as e:
        await db.rollback()
        print(f"ERROR saving slides: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")


# ─────────────────────────────────────────────────────────────
#  Next Drop
# ─────────────────────────────────────────────────────────────

@router.get("/next-drop", tags=["Settings"])
async def get_next_drop(db: AsyncSession = Depends(get_db)):
    """Get next drop configuration"""
    result = await db.execute(select(SiteSetting).filter(SiteSetting.key == "next_drop"))
    setting = result.scalar_one_or_none()
    if not setting:
        return {"success": True, "config": None}

    return {"success": True, "config": setting.value}


@router.put("/next-drop", tags=["Settings"])
async def update_next_drop(
    data: NextDropUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Update next drop configuration (admin only)"""
    config = data.model_dump()
    if not current_user.is_admin:
        raise HTTPException(status_code=403, detail="Admin access required")

    result = await db.execute(select(SiteSetting).filter(SiteSetting.key == "next_drop"))
    setting = result.scalar_one_or_none()
    if not setting:
        setting = SiteSetting(key="next_drop", value=config)
        db.add(setting)
    else:
        setting.value = config
        flag_modified(setting, "value")

    await db.commit()
    return {"success": True, "message": "Next drop updated"}


# ─────────────────────────────────────────────────────────────
#  Telegram Notifications Settings
# ─────────────────────────────────────────────────────────────

@router.get("/telegram", tags=["Settings"])
async def get_telegram_settings(db: AsyncSession = Depends(get_db)):
    """Get Telegram notification settings"""
    result = await db.execute(select(SiteSetting).filter(SiteSetting.key == "telegram_settings"))
    setting = result.scalar_one_or_none()
    if not setting:
        return {"success": True, "settings": {"enabled": False, "bot_token": "", "chat_id": ""}}
    return {"success": True, "settings": setting.value}


@router.put("/telegram", tags=["Settings"])
async def update_telegram_settings(
    data: TelegramSettings,
    current_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Update Telegram notification settings (admin only)"""
    settings_dict = data.model_dump()
    result = await db.execute(select(SiteSetting).filter(SiteSetting.key == "telegram_settings"))
    setting = result.scalar_one_or_none()
    if not setting:
        setting = SiteSetting(key="telegram_settings", value=settings_dict)
        db.add(setting)
    else:
        setting.value = settings_dict
        flag_modified(setting, "value")

    await db.commit()
    return {"success": True, "message": "Telegram settings updated"}


@router.post("/telegram/test", tags=["Settings"])
async def test_telegram_notification(
    body: dict,
    current_user: User = Depends(require_admin),
):
    """Send a test Telegram message to verify the bot token and chat ID work."""
    bot_token = (body.get("bot_token") or "").strip()
    chat_id = (body.get("chat_id") or "").strip()
    if not bot_token or not chat_id:
        raise HTTPException(400, "bot_token and chat_id are required")

    test_order = {
        "order_number": "GG-TEST-001",
        "customer_info": {"name": "Test Customer", "email": "test@test.com", "phone": "0123456789"},
        "total": 299.99,
        "items": [
            {"name": "GLITCH CORE TEE", "quantity": 1, "price": 199.99},
            {"name": "URBAN HOODIE", "quantity": 1, "price": 100.00},
        ],
    }

    try:
        from notifications import send_telegram_order_notification
        await send_telegram_order_notification(bot_token, chat_id, test_order)
        return {"success": True, "message": "Test message sent successfully"}
    except Exception as e:
        raise HTTPException(500, f"Failed to send test message: {str(e)}")