// GlitchGarb Main Script - Hybrid Storage (API + LocalStorage fallback)

// Configuration - Set to true to use Firebase API, false to use localStorage
const USE_FIREBASE_API = true;

// Auto-detect API URL based on environment
// For production: Set window.GG_API_URL before loading this script
// Or set window.GG_BACKEND_URL to your Render backend URL
function getApiBaseUrl() {
    // Check for explicit override
    if (window.GG_API_URL) {
        return window.GG_API_URL;
    }

    // Check for backend URL override
    if (window.GG_BACKEND_URL) {
        return window.GG_BACKEND_URL + '/api';
    }

    // Auto-detect based on hostname
    const hostname = window.location.hostname;
    if (hostname !== 'localhost' && hostname !== '127.0.0.1') {
        // Production - update this to your Render backend URL
        return 'https://glitchgarb-backend1.onrender.com/api';
    }

    // Local development
    return 'http://localhost:5000/api';
}

const API_BASE_URL = getApiBaseUrl();

document.addEventListener('DOMContentLoaded', () => {
    updateAuthUI();
    handleExclusivity();
    initPhase2();
    renderAllProducts();

    // Phase 6 Activity Feed
    if (typeof ActivityFeed !== 'undefined') {
        window.activityFeed = new ActivityFeed();
    }
});

// Helper function to fetch products from API or localStorage
async function fetchProducts() {
    if (USE_FIREBASE_API) {
        try {
            const response = await fetch(`${API_BASE_URL}/products`);
            const data = await response.json();
            if (data.success) {
                // Normalize product data - map dropDate to releaseDate for frontend compatibility
                return data.products.map(p => ({
                    ...p,
                    releaseDate: p.releaseDate || p.dropDate || new Date().toISOString(),
                    image: p.image || (p.images && p.images[0]) || 'https://images.unsplash.com/photo-1578587018452-892bacefd3f2?auto=format&fit=crop&q=80&w=300'
                }));
            }
            throw new Error('Failed to fetch products from API');
        } catch (error) {
            console.error('API Error, falling back to localStorage:', error);
            return storageService.getProducts();
        }
    } else {
        return storageService.getProducts();
    }
}

async function initPhase2() {
    // 1. Countdown Timer (Target: 2 hours from now for the Hoodie drop)
    const products = await fetchProducts();
    const upcomingDrop = products.find(p => new Date(p.releaseDate) > new Date());

    if (upcomingDrop) {
        new CountdownTimer(upcomingDrop.releaseDate, 'main-countdown', () => {
            console.log('Drop is live! Reloading products...');
            renderAllProducts();
        });
    } else {
        const fallbackDate = new Date();
        fallbackDate.setHours(fallbackDate.getHours() + 48);
        new CountdownTimer(fallbackDate, 'main-countdown');
    }

    // 2. Campaign Slider - Load from localStorage or use defaults
    const savedSlides = JSON.parse(localStorage.getItem('glitchgarb_hero_slides') || 'null');
    const defaultSlides = [
        {
            image: 'https://images.unsplash.com/photo-1552374196-1ab2a1c593e8?auto=format&fit=crop&q=80&w=1587',
            title: 'GLITCH<br>CORE',
            subtitle: 'THE FOUNDATION COLLECTION. LIMITED NUMBERS.',
            cta: 'Secure the Drop',
            link: 'shop.html',
            enabled: true
        },
        {
            image: 'https://images.unsplash.com/photo-1508427953056-b00b8d78ebf5?auto=format&fit=crop&q=80&w=1740',
            title: 'URBAN<br>UTILITY',
            subtitle: 'ENGINEERED FOR THE STREETS. GHANA PRIDE.',
            cta: 'View Collection',
            link: 'shop.html',
            enabled: true
        }
    ];

    // Use saved slides if available, otherwise use defaults
    let slides = savedSlides || defaultSlides;

    // Filter to only enabled slides
    slides = slides.filter(s => s.enabled !== false);

    new CampaignSlider('campaign-slider', slides);

    // 3. Scarcity Bar
    new ScarcityBar('scarcity-marquee-container', 'LIMITED QUANTITIES AVAILABLE // ONLY 50 PIECES PER DROP // SECURE YOURS NOW');
}

async function renderAllProducts(category = 'all', searchTerm = '') {
    const products = await fetchProducts();
    const featuredGrid = document.getElementById('featured-products');
    const shopLiveGrid = document.getElementById('live-products');
    const shopArchiveGrid = document.getElementById('archived-products');

    // Filter by category if specified
    let filteredProducts = category === 'all'
        ? products
        : products.filter(p => p.category === category);

    // Filter by search term if specified
    if (searchTerm && searchTerm.trim()) {
        const term = searchTerm.toLowerCase().trim();
        filteredProducts = filteredProducts.filter(p =>
            p.name.toLowerCase().includes(term) ||
            (p.description && p.description.toLowerCase().includes(term)) ||
            (p.category && p.category.toLowerCase().includes(term))
        );
    }

    if (featuredGrid) {
        // Show only live products on home page
        const liveProducts = filteredProducts.filter(p => new Date(p.releaseDate) <= new Date() && p.stock > 0);
        renderProductGrid(featuredGrid, liveProducts.slice(0, 3));
    }

    if (shopLiveGrid && shopArchiveGrid) {
        // Split products for the shop page
        const liveAndUpcoming = filteredProducts.filter(p => p.stock > 0);
        const archived = filteredProducts.filter(p => p.stock === 0);

        renderProductGrid(shopLiveGrid, liveAndUpcoming);
        renderProductGrid(shopArchiveGrid, archived);
    } else if (document.querySelector('.product-grid')) {
        // Fallback for single grid pages if any exist
        renderProductGrid(document.querySelector('.product-grid'), filteredProducts);
    }
}

function renderProductGrid(container, products) {
    container.innerHTML = '';
    products.forEach((product, index) => {
        const isLive = new Date(product.releaseDate) <= new Date();
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

        card.innerHTML = `
            <div class="product-image" style="background: url('${product.image}') center/cover; cursor: pointer;" onclick="${isSoldOut ? '' : `location.href='product.html?id=${product.id}'`}">
                ${overlayHtml}
            </div>
            <div class="product-info">
                <h3 style="cursor: ${isSoldOut ? 'default' : 'pointer'};" onclick="${isSoldOut ? '' : `location.href='product.html?id=${product.id}'`}">${product.name}</h3>
                <p class="product-price">${isSoldOut ? '<span class="sold-out-text">SOLD OUT</span> • ' : ''}GH₵ ${product.price.toFixed(2)}</p>
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
    const user = storageService.getCurrentUser();
    if (!user) {
        alert('Please login to purchase');
        window.location.href = 'login.html';
        return;
    }

    const result = storageService.purchaseProduct(productId);
    if (result.success) {
        alert(`Successfully purchased ${result.product.name}!`);
        renderAllProducts(); // Re-render to show updated stock
    } else {
        alert(result.message);
    }
}

function updateAuthUI() {
    const user = storageService.getCurrentUser();
    const authLink = document.getElementById('auth-link');
    const profileLink = document.getElementById('profile-link');

    if (user) {
        if (authLink) {
            authLink.textContent = 'Logout';
            authLink.href = '#';
            authLink.addEventListener('click', (e) => {
                e.preventDefault();
                storageService.logout();
            });
        }
        if (profileLink) profileLink.style.display = 'inline-block';
    } else {
        if (authLink) {
            authLink.textContent = 'Login';
            authLink.href = 'login.html';
        }
        if (profileLink) profileLink.style.display = 'none';
    }
}

function handleExclusivity() {
    const user = storageService.getCurrentUser();
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
