"""
routers/products.py — Product CRUD endpoints
Matches all original Node.js /api/products/* routes exactly.
"""

from fastapi import APIRouter, Depends, HTTPException, Query
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


def _product_out(p: Product) -> dict:
     return {
         "id": p.id,
         "name": p.name,
         "description": p.description or "",
         "price": p.price,
         "original_price": p.original_price,
         "category": p.category,
         "images": p.images or [],
         "gallery": p.gallery or [],
         "sizes": p.sizes or [],
         "colors": p.colors or [],
         "stock": p.stock,
         "status": p.status,
         "featured": p.featured,
         "drop_date": p.drop_date.isoformat() if p.drop_date else None,
         "releaseDate": p.drop_date.isoformat() if p.drop_date else None,
         "image": p.images[0] if p.images and len(p.images) > 0 else "https://images.unsplash.com/photo-1578587018452-892bacefd3f2?auto=format&fit=crop&q=80&w=300",
         "tags": p.tags or [],
         "created_at": p.created_at.isoformat() if p.created_at else None,
         "updated_at": p.updated_at.isoformat() if p.updated_at else None,
     }


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
