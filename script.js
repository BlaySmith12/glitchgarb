// GlitchGarb Main Script - Hybrid Storage (API + LocalStorage fallback)

// GlitchGarb Main Script - Hybrid Storage (API + LocalStorage fallback)

document.addEventListener('DOMContentLoaded', () => {
    updateAuthUI();
    handleExclusivity();
    initPhase2();
    renderAllProducts();

    // Phase 6 Activity Feed
    if (typeof ActivityFeed !== 'undefined') {
        window.activityFeed = new ActivityFeed();
    }

    if (typeof updateGlobalCartCount === 'function') {
        updateGlobalCartCount();
    }
});

window.addEventListener('storage', () => {
    if (typeof updateGlobalCartCount === 'function') {
        updateGlobalCartCount();
    }
});

async function initPhase2() {
    // 1. Get next drop configuration first
    const nextDropConfig = await apiService.getNextDrop();
    const nextDropEnabled = nextDropConfig && nextDropConfig.enabled === true;

    // 2. Countdown Timer - Only show if next drop is enabled in admin portal
    const timerContainer = document.getElementById('drop-timer-container');
    const nextDropSection = document.getElementById('next-drop-section');

    if (nextDropEnabled && nextDropConfig.productId) {
        const products = await apiService.getProducts();
        const nextProduct = products.find(p => p.id === nextDropConfig.productId || p.id === nextDropConfig.product_id);

        if (nextProduct && nextProduct.releaseDate) {
            // Show main countdown timer
            if (timerContainer) timerContainer.style.display = 'block';
            new CountdownTimer(nextProduct.releaseDate, 'main-countdown', () => {
                console.log('Drop is live! Reloading products...');
                renderAllProducts();
            });

            // Show next drop section
            if (nextDropSection) nextDropSection.style.display = 'block';
            updateNextDropSection(nextProduct, nextDropConfig);
        }
    } else {
        // Hide both countdowns when next drop is not enabled
        if (timerContainer) timerContainer.style.display = 'none';
        if (nextDropSection) nextDropSection.style.display = 'none';
    }

    // 3. Campaign Slider - Load from API
    let slides = await apiService.getHeroSlides();

    // Filter to only enabled slides
    slides = slides.filter(s => s.enabled !== false);

    new CampaignSlider('campaign-slider', slides);

    // 4. Scarcity Bar
    new ScarcityBar('scarcity-marquee-container', 'LIMITED QUANTITIES AVAILABLE // ONLY 50 PIECES PER DROP // SECURE YOURS NOW');
}

// Helper function to update next drop section
async function updateNextDropSection(nextProduct, nextDropConfig) {
    // Update banner image
    const bannerImage = document.getElementById('nd-banner-image');
    if (bannerImage) {
        const imgSrc = nextProduct.image || (nextProduct.images && nextProduct.images[0]) || 'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?auto=format&fit=crop&q=80&w=800';
        bannerImage.style.backgroundImage = `url('${imgSrc}')`;
        bannerImage.style.backgroundSize = 'cover';
        bannerImage.style.backgroundPosition = 'center';
    }

    // Update title
    const titleEl = document.getElementById('nd-title');
    if (titleEl) {
        titleEl.textContent = nextDropConfig.title || nextProduct.name || 'Next Drop';
    }

    // Update description
    const descEl = document.getElementById('nd-description');
    if (descEl) {
        descEl.textContent = nextDropConfig.description || nextProduct.description || '';
    }

    // Update product info
    const productInfo = document.getElementById('nd-product-info');
    if (productInfo) {
        const imgSrc = nextProduct.image || (nextProduct.images && nextProduct.images[0]) || 'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?auto=format&fit=crop&q=80&w=300';
        productInfo.innerHTML = `
            <div class="next-drop-product">
                <img src="${imgSrc}" alt="${nextProduct.name}" onerror="this.src='https://images.unsplash.com/photo-1558618666-fcd25c85cd64?auto=format&fit=crop&q=80&w=300'">
                <div>
                    <h3>${nextProduct.name}</h3>
                    <p>GH₵ ${nextProduct.price.toFixed(2)} | ${nextProduct.category || 'General'}</p>
                </div>
            </div>
        `;
    }

    // Update countdown
    const ndCountdown = document.getElementById('nd-countdown');
    if (ndCountdown && nextProduct.releaseDate) {
        new CountdownTimer(nextProduct.releaseDate, 'nd-countdown');
    }

    // Update CTA button
    const ctaBtn = document.getElementById('nd-cta-btn');
    if (ctaBtn) {
        ctaBtn.href = `product.html?id=${nextProduct.id}`;
        ctaBtn.textContent = nextDropConfig.ctaText || 'View Product';
    }
}

// Enhanced product rendering with static fallback
async function renderAllProducts(category = 'all', searchTerm = '') {
    let products = [];
    try {
        // Try API first
        products = await apiService.getProducts();
        localStorage.setItem('glitchgarb_products', JSON.stringify(products));
    } catch (apiErr) {
        console.error('API fetch failed:', apiErr);
        // Try cached data
        const cached = localStorage.getItem('glitchgarb_products');
        if (cached) {
            try {
                products = JSON.parse(cached);
            } catch (parseErr) {
                console.error('Cache parse error:', parseErr);
            }
        }
        // If still empty, use static mock data
        if (!products || products.length === 0) {
            console.warn('Using static mock products as fallback');
            products = [
                { id: 'mock1', name: 'Mock Product 1', description: 'Sample product', price: 9.99, stock: 10, category: 'General', image: '' },
                { id: 'mock2', name: 'Mock Product 2', description: 'Sample product', price: 19.99, stock: 5, category: 'General', image: '' }
            ];
        }
    }

    const featuredGrid = document.getElementById('featured-products');
    const shopLiveGrid = document.getElementById('live-products');
    const shopArchiveGrid = document.getElementById('archived-products');

    // Category filter
    let filteredProducts = category === 'all' ? products : products.filter(p => p.category === category);

    // Search term filter
    if (searchTerm && searchTerm.trim()) {
        const term = searchTerm.toLowerCase().trim();
        filteredProducts = filteredProducts.filter(p =>
            p.name.toLowerCase().includes(term) ||
            (p.description && p.description.toLowerCase().includes(term)) ||
            (p.category && p.category.toLowerCase().includes(term))
        );
    }

    if (featuredGrid) {
        const liveProducts = filteredProducts.filter(p => {
            const hasStock = p.stock > 0;
            if (!p.releaseDate) return hasStock;
            return new Date(p.releaseDate) <= new Date() && hasStock;
        });
        renderProductGrid(featuredGrid, liveProducts.slice(0, 3));
    }

    if (shopLiveGrid && shopArchiveGrid) {
        const liveAndUpcoming = filteredProducts.filter(p => {
            if (p.stock === 0) return false;
            if (!p.releaseDate) return true;
            return new Date(p.releaseDate) <= new Date();
        });
        const archived = filteredProducts.filter(p => p.stock === 0);
        renderProductGrid(shopLiveGrid, liveAndUpcoming);
        renderProductGrid(shopArchiveGrid, archived);
    } else if (document.querySelector('.product-grid')) {
        renderProductGrid(document.querySelector('.product-grid'), filteredProducts);
    }
}

function renderProductGrid(container, products) {
    container.innerHTML = '';
    products.forEach((product, index) => {
        const isLive = !product.releaseDate || new Date(product.releaseDate) <= new Date();
        const isSoldOut = product.stock === 0;

        const card = document.createElement('div');
        card.className = `product-card fade-in ${isSoldOut ? 'sold-out' : ''} ${!isLive ? 'coming-soon' : ''}`;
        card.style.animationDelay = `${index * 0.1}s`;

        let overlayHtml = '';
        if (isSoldOut) {
            overlayHtml = `
                <div class="sold-out-overlay">
                    <span class="sold-out-badge">SOLD OUT</span>
                </div>
            `;
        } else if (!isLive) {
            overlayHtml = `
                <div class="coming-soon-badge">
                    <span>COMING SOON</span>
                    <strong>${new Date(product.releaseDate).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</strong>
                </div>
            `;
        }

        const rawImgSrc = product.image || (product.images && product.images.length > 0 ? product.images[0] : '') || '';
        const imgSrc = rawImgSrc && !rawImgSrc.startsWith('http') && !rawImgSrc.startsWith('data:image/') 
            ? `data:image/jpeg;base64,${rawImgSrc}` 
            : rawImgSrc;

        card.innerHTML = `
            <div class="product-image" style="background: url('${imgSrc}') center/cover; cursor: pointer;" onclick="${isSoldOut ? '' : `location.href='product.html?id=${product.id}'`}">
                ${overlayHtml}
            </div>
            <div class="product-info">
                <h3 style="cursor: ${isSoldOut ? 'default' : 'pointer'};" onclick="${isSoldOut ? '' : `location.href='product.html?id=${product.id}'`}">${product.name}</h3>
                <p class="product-price">${isSoldOut ? '<span class="sold-out-text">SOLD OUT</span> � ' : ''}GH₵ ${product.price.toFixed(2)}</p>
                <div id="stock-container-${product.id}"></div>
                ${isLive && !isSoldOut ? `<button class="buy-btn" data-id="${product.id}">Buy Now</button>` : ''}
                ${isSoldOut ? '<p class="sold-out-message">This item is no longer available</p>' : ''}
            </div>
        `;

        container.appendChild(card);

        // Initialize Stock Counter
        if (isLive && !isSoldOut) {
            new StockCounter(`stock-container-${product.id}`, product.stock, 50);
        }
    });

    // Handle Purchases - Redirect to product page
    container.querySelectorAll('.buy-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const id = e.target.dataset.id;
            window.location.href = `product.html?id=${id}`;
        });
    });
}

function handlePurchase(productId) {
    const user = apiService.getCurrentUser();
    if (!user) {
        alert('Please login to purchase');
        window.location.href = '/login';
        return;
    }

    const result = apiService.purchaseProduct(productId);
    if (result.success) {
        alert(`Successfully purchased ${result.product.name}!`);
        renderAllProducts(); // Re-render to show updated stock
    } else {
        alert(result.message);
    }
}

function updateAuthUI() {
    const user = apiService.getCurrentUser();
    const authLink = document.getElementById('auth-link');
    const profileLink = document.getElementById('profile-link');

    if (user) {
        if (authLink) {
            authLink.textContent = 'Logout';
            authLink.href = '#';
            authLink.addEventListener('click', (e) => {
                e.preventDefault();
                apiService.logout();
            });
        }
        if (profileLink) profileLink.style.display = 'inline-block';
    } else {
        if (authLink) {
            authLink.textContent = 'Login';
            authLink.href = '/login';
        }
        if (profileLink) profileLink.style.display = 'none';
    }
}

function handleExclusivity() {
    const user = apiService.getCurrentUser();
    const lockOverlays = document.querySelectorAll('.exclusive-locked');

    lockOverlays.forEach(overlay => {
        const text = overlay.textContent;
        const isVIPProduct = text.includes('VIP') || text.includes('Inner Circle');
        const isMemberProduct = text.includes('Members Only');

        if (user) {
            if (isMemberProduct) {
                overlay.style.display = 'none';
            }
            if (isVIPProduct && user.isVIP) {
                overlay.style.display = 'none';
            }
        }
    });
}

// Global Cart Count Update
window.updateGlobalCartCount = async function() {
    const cartCountEl = document.getElementById('cart-count');
    if (cartCountEl && typeof apiService !== 'undefined' && typeof apiService.getCartCountAsync === 'function') {
        try {
            const count = await apiService.getCartCountAsync();
            cartCountEl.textContent = count;
            cartCountEl.style.display = count > 0 ? 'flex' : 'none';
        } catch (e) {
            console.error('Failed to update global cart count', e);
        }
    }
};
