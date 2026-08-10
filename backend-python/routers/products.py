"""
routers/products.py — Product CRUD endpoints
Matches all original Node.js /api/products/* routes exactly.
"""

import base64
import binascii
import re

from fastapi import APIRouter, Depends, HTTPException, Query, Response, Request
from fastapi.responses import RedirectResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, or_
from datetime import datetime
from typing import Optional

from database import get_db
from models import Product, User
from schemas import ProductCreate, ProductUpdate, StockUpdateRequest
from auth import get_current_user, require_admin
from fastapi import BackgroundTasks
from fastapi import BackgroundTasks

router = APIRouter()

FALLBACK_IMAGE = "https://images.unsplash.com/photo-1578587018452-892bacefd3f2?auto=format&fit=crop&q=80&w=300"
_DATA_URI_RE = re.compile(r"^data:image/(?P<mime>[\w.+-]+);base64,(?P<b64>.+)$", re.DOTALL)


def _decode_data_uri(value: str):
    """Decode a base64 data-URI (or bare base64) into (mime, bytes). Returns None if not decodable."""
    if not value:
        return None
    m = _DATA_URI_RE.match(value)
    if m:
        mime = m.group("mime")
        b64 = m.group("b64")
    elif value.startswith("/api/") or value.startswith("http://") or value.startswith("https://"):
        return None  # it's a URL, not image data
    else:
        mime = "jpeg"
        b64 = value
    try:
        data = base64.b64decode(b64)
    except (binascii.Error, ValueError):
        return None
    if not data:
        return None
    return (mime, data)


def _image_url(p: Product, index: int = 0) -> str:
    """Return the binary-serving URL for images[index], or the fallback if not set."""
    images = p.images or []
    if not images or index >= len(images) or not images[index]:
        return FALLBACK_IMAGE
    return f"/api/products/{p.id}/image/{index}"


def _gallery_url(p: Product, index: int = 0) -> str:
    return f"/api/products/{p.id}/gallery/{index}"


def _is_self_reference(value, product_id):
    """True if an admin-saved image value is our own binary URL (i.e. unchanged image)."""
    if not isinstance(value, str):
        return False
    return value.startswith(f"/api/products/{product_id}/")


def _product_out(p: Product) -> dict:
     gallery_out = []
     gallery = p.gallery or []
     for i, item in enumerate(gallery):
         if isinstance(item, dict):
             gallery_out.append({"url": _gallery_url(p, i), "label": item.get("label", "View")})
         elif isinstance(item, str):
             gallery_out.append({"url": _gallery_url(p, i), "label": "View"})
     return {
         "id": p.id,
         "name": p.name,
         "description": p.description or "",
         "price": p.price,
         "original_price": p.original_price,
         "category": p.category,
         "images": [_image_url(p, i) for i in range(len(p.images or []))],
         "gallery": gallery_out,
         "sizes": p.sizes or [],
         "colors": p.colors or [],
         "stock": p.stock,
         "status": p.status,
         "featured": p.featured,
         "drop_date": p.drop_date.isoformat() if p.drop_date else None,
         "releaseDate": p.drop_date.isoformat() if p.drop_date else None,
         "image": _image_url(p, 0),
         "tags": p.tags or [],
         "created_at": p.created_at.isoformat() if p.created_at else None,
         "updated_at": p.updated_at.isoformat() if p.updated_at else None,
     }


def _serve_image(value):
    """Turn a stored image value into a binary Response (or redirect for external URLs)."""
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


# ─────────────────────────────────────────────────────────────
#  GET /api/products
# ─────────────────────────────────────────────────────────────

@router.get("/")
async def get_products(
    category: Optional[str] = None,
    featured: Optional[str] = None,
    search: Optional[str] = None,
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db),
):
    query = select(Product)

    if category:
        query = query.where(Product.category == category)
    if featured == "true":
        query = query.where(Product.featured == True)
    if search:
        pattern = f"%{search.lower()}%"
        query = query.where(
            or_(
                Product.name.ilike(pattern),
                Product.description.ilike(pattern),
            )
        )

    query = query.offset(offset).limit(limit)
    result = await db.execute(query)
    products = result.scalars().all()

    return {
        "success": True,
        "count": len(products),
        "products": [_product_out(p) for p in products],
    }


# ─────────────────────────────────────────────────────────────
#  GET /api/products/live
# ─────────────────────────────────────────────────────────────

@router.get("/live")
async def get_live_products(db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Product)
        .where(Product.status == "live")
        .order_by(Product.drop_date.desc().nullslast())
    )
    products = result.scalars().all()

    return {
        "success": True,
        "count": len(products),
        "products": [_product_out(p) for p in products],
    }


# ─────────────────────────────────────────────────────────────
#  GET /api/products/upcoming
# ─────────────────────────────────────────────────────────────

@router.get("/upcoming")
async def get_upcoming_products(db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Product)
        .where(Product.status == "upcoming")
        .order_by(Product.drop_date.asc().nullslast())
    )
    products = result.scalars().all()

    return {
        "success": True,
        "count": len(products),
        "products": [_product_out(p) for p in products],
    }


# ─────────────────────────────────────────────────────────────
#  GET /api/products/:id
# ─────────────────────────────────────────────────────────────

@router.get("/{product_id}")
async def get_product(product_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Product).where(Product.id == product_id))
    product = result.scalar_one_or_none()

    if not product:
        raise HTTPException(404, "Product not found")

    return {"success": True, "product": _product_out(product)}


# ─────────────────────────────────────────────────────────────
#  GET /api/products/:id/image/:index  (binary image, cached)
# ─────────────────────────────────────────────────────────────

@router.get("/{product_id}/image/{index}")
async def get_product_image(
    product_id: str,
    index: int = 0,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Product).where(Product.id == product_id))
    product = result.scalar_one_or_none()
    if not product:
        raise HTTPException(404, "Product not found")

    images = product.images or []
    if index < 0 or index >= len(images):
        raise HTTPException(404, "Image not found")
    return _serve_image(images[index])


# ─────────────────────────────────────────────────────────────
#  GET /api/products/:id/gallery/:index  (binary image, cached)
# ─────────────────────────────────────────────────────────────

@router.get("/{product_id}/gallery/{index}")
async def get_product_gallery_image(
    product_id: str,
    index: int = 0,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Product).where(Product.id == product_id))
    product = result.scalar_one_or_none()
    if not product:
        raise HTTPException(404, "Product not found")

    gallery = product.gallery or []
    if index < 0 or index >= len(gallery):
        raise HTTPException(404, "Image not found")

    item = gallery[index]
    value = item.get("url", "") if isinstance(item, dict) else (item or "")
    return _serve_image(value)


# ─────────────────────────────────────────────────────────────
#  POST /api/products  (admin)
# ─────────────────────────────────────────────────────────────

@router.post("/", status_code=201)
async def create_product(
    body: ProductCreate,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
    background_tasks: BackgroundTasks = BackgroundTasks(),
):
    if not body.name or body.price is None:
        raise HTTPException(400, "Please provide name and price")

    try:
        product = Product(
            name=body.name,
            description=body.description or "",
            price=body.price,
            original_price=body.original_price,
            category=body.category or "general",
            images=body.images or [],
            gallery=body.gallery or [],
            sizes=body.sizes or ["S", "M", "L", "XL"],
            colors=body.colors or [],
            stock=body.stock or 0,
            drop_date=body.drop_date,
            status=body.status or "draft",
            featured=body.featured or False,
            tags=body.tags or [],
        )
        db.add(product)
        await db.commit()
        await db.refresh(product)
    except Exception as e:
        await db.rollback()
        import traceback
        traceback.print_exc()
        raise HTTPException(500, f"Failed to create product: {str(e)}")

    # Send new drop notification (Rule: New Drops)
    if body.status in ["live", "upcoming"] and product.drop_date:
        # Get users who subscribed to new drops
        result = await db.execute(
            select(User).where(
                User.notification_prefs.contains({"new_drops": True})
            )
        )
        subscribers = result.scalars().all()
        
        if subscribers:
            from notifications import send_new_drop
            from datetime import datetime
            
            product_url = f"{os.getenv('FRONTEND_URL', 'http://localhost:5500')}/product.html?id={product.id}"
            drop_date_str = product.drop_date.strftime("%B %d, %Y") if product.drop_date else "Soon"
            
            # Send emails in background
            for user in subscribers:
                background_tasks.add_task(
                    send_new_drop,
                    user_email=user.email,
                    product_name=product.name,
                    drop_date=drop_date_str,
                    product_url=product_url
                )

    return {
        "success": True,
        "message": "Product created successfully",
        "product": _product_out(product),
    }


# ─────────────────────────────────────────────────────────────
#  PUT /api/products/:id  (admin)
# ─────────────────────────────────────────────────────────────

@router.put("/{product_id}")
async def update_product(
    product_id: str,
    body: ProductUpdate,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    try:
        result = await db.execute(select(Product).where(Product.id == product_id))
        product = result.scalar_one_or_none()

        if not product:
            raise HTTPException(404, "Product not found")

        updates = body.model_dump(exclude_none=True)

        # If admin saved unchanged images, they come back as our own /api/... URLs.
        # Keep the original stored data so base64 images are not clobbered.
        if "images" in updates:
            cleaned_images = []
            existing_images = product.images or []
            for i, value in enumerate(updates["images"]):
                if _is_self_reference(value, product_id) and i < len(existing_images):
                    cleaned_images.append(existing_images[i])
                else:
                    cleaned_images.append(value)
            updates["images"] = cleaned_images

        if "gallery" in updates:
            cleaned_gallery = []
            existing_gallery = product.gallery or []
            for i, item in enumerate(updates["gallery"]):
                if isinstance(item, dict) and _is_self_reference(item.get("url", ""), product_id) and i < len(existing_gallery):
                    existing = existing_gallery[i]
                    if isinstance(existing, dict):
                        cleaned_gallery.append({**existing, "label": item.get("label", existing.get("label", "View"))})
                    else:
                        cleaned_gallery.append(existing)
                else:
                    cleaned_gallery.append(item)
            updates["gallery"] = cleaned_gallery

        for field, value in updates.items():
            setattr(product, field, value)

        product.updated_at = datetime.utcnow()
        await db.commit()
        await db.refresh(product)
        print(f"[UPDATE] commit successful")

        return {
            "success": True,
            "message": "Product updated successfully",
            "product": _product_out(product),
        }
    except HTTPException:
        raise
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(500, f"Update failed: {str(e)}")


# ─────────────────────────────────────────────────────────────
#  DELETE /api/products/:id  (admin)
# ─────────────────────────────────────────────────────────────

@router.delete("/{product_id}")
async def delete_product(
    product_id: str,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Product).where(Product.id == product_id))
    product = result.scalar_one_or_none()

    if not product:
        raise HTTPException(404, "Product not found")

    await db.delete(product)
    await db.commit()

    return {"success": True, "message": "Product deleted successfully"}


# ─────────────────────────────────────────────────────────────
#  PUT /api/products/:id/stock  (admin)
# ─────────────────────────────────────────────────────────────

@router.put("/{product_id}/stock")
async def update_stock(
    product_id: str,
    body: StockUpdateRequest,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Product).where(Product.id == product_id))
    product = result.scalar_one_or_none()

    if not product:
        raise HTTPException(404, "Product not found")

    previous = product.stock

    if body.operation == "add":
        product.stock = previous + body.stock
    elif body.operation == "subtract":
        product.stock = max(0, previous - body.stock)
    else:
        product.stock = body.stock

    product.updated_at = datetime.utcnow()
    await db.commit()

    return {
        "success": True,
        "message": "Stock updated successfully",
        "previous_stock": previous,
        "new_stock": product.stock,
    }
