class CountdownTimer {
    constructor(targetDate, elementId, onComplete = null) {
        this.targetDate = new Date(targetDate).getTime();
        this.element = document.getElementById(elementId);
        this.onComplete = onComplete;
        if (this.element) {
            this.start();
        }
    }

    start() {
        this.update();
        this.interval = setInterval(() => this.update(), 1000);
    }

    update() {
        const now = new Date().getTime();
        const distance = this.targetDate - now;

        if (distance < 0) {
            clearInterval(this.interval);
            this.element.innerHTML = "DROP IS LIVE";
            if (this.onComplete) this.onComplete();
            return;
        }

        const hours = Math.floor((distance % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        const minutes = Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((distance % (1000 * 60)) / 1000);

        this.element.innerHTML = `
            <div class="timer-unit"><span>${hours.toString().padStart(2, '0')}</span><label>HRS</label></div>
            <div class="timer-sep">:</div>
            <div class="timer-unit"><span>${minutes.toString().padStart(2, '0')}</span><label>MIN</label></div>
            <div class="timer-sep">:</div>
            <div class="timer-unit"><span>${seconds.toString().padStart(2, '0')}</span><label>SEC</label></div>
        `;
    }
}

class CampaignSlider {
    constructor(containerId, slides) {
        this.container = document.getElementById(containerId);
        this.slides = slides;
        this.currentIndex = 0;
        this.autoPlayInterval = null;
        if (this.container) {
            this.init();
        }
    }

    init() {
        this.render();
        this.setupEventListeners();
        this.startAutoPlay();
    }

    render() {
        this.container.innerHTML = `
            <div class="slider-wrapper">
                ${this.slides.map((slide, index) => `
                    <div class="slide ${index === 0 ? 'active' : ''}" style="background-image: url('${slide.image}')">
                        <div class="slide-content">
                            <h2 class="slide-title">${slide.title}</h2>
                            <p class="slide-subtitle">${slide.subtitle}</p>
                            <a href="${slide.link}" class="btn">${slide.cta}</a>
                        </div>
                    </div>
                `).join('')}
            </div>
            <div class="slider-dots">
                ${this.slides.map((_, index) => `
                    <span class="dot ${index === 0 ? 'active' : ''}" data-index="${index}"></span>
                `).join('')}
            </div>
        `;
    }

    setupEventListeners() {
        // Dot navigation
        const dots = this.container.querySelectorAll('.dot');
        dots.forEach(dot => {
            dot.addEventListener('click', (e) => {
                const index = parseInt(e.target.dataset.index);
                this.goToSlide(index);
                this.resetAutoPlay();
            });
        });

        // Pause on hover
        this.container.addEventListener('mouseenter', () => this.stopAutoPlay());
        this.container.addEventListener('mouseleave', () => this.startAutoPlay());
    }

    goToSlide(index) {
        const slideElements = this.container.querySelectorAll('.slide');
        const dotElements = this.container.querySelectorAll('.dot');

        if (!slideElements.length) return;

        slideElements[this.currentIndex].classList.remove('active');
        dotElements[this.currentIndex].classList.remove('active');

        this.currentIndex = index;

        slideElements[this.currentIndex].classList.add('active');
        dotElements[this.currentIndex].classList.add('active');
    }

    next() {
        const slideElements = this.container.querySelectorAll('.slide');
        const dotElements = this.container.querySelectorAll('.dot');

        if (!slideElements.length) return;

        slideElements[this.currentIndex].classList.remove('active');
        dotElements[this.currentIndex].classList.remove('active');

        this.currentIndex = (this.currentIndex + 1) % this.slides.length;

        slideElements[this.currentIndex].classList.add('active');
        dotElements[this.currentIndex].classList.add('active');
    }

    startAutoPlay() {
        if (this.autoPlayInterval) return;
        this.autoPlayInterval = setInterval(() => this.next(), 5000);
    }

    stopAutoPlay() {
        if (this.autoPlayInterval) {
            clearInterval(this.autoPlayInterval);
            this.autoPlayInterval = null;
        }
    }

    resetAutoPlay() {
        this.stopAutoPlay();
        this.startAutoPlay();
    }
}

class ScarcityBar {
    constructor(containerId, message) {
        this.container = document.getElementById(containerId);
        this.message = message;
        if (this.container) {
            this.render();
        }
    }

    render() {
        this.container.innerHTML = `
            <div class="scarcity-bar">
                <div class="scarcity-track">
                    <span class="scarcity-text">${this.message} &nbsp; • &nbsp; ${this.message} &nbsp; • &nbsp; ${this.message} &nbsp; • &nbsp; ${this.message}</span>
                    <span class="scarcity-text">${this.message} &nbsp; • &nbsp; ${this.message} &nbsp; • &nbsp; ${this.message} &nbsp; • &nbsp; ${this.message}</span>
                </div>
            </div>
        `;
    }
}

class StockCounter {
    constructor(containerId, initialStock, maxStock = 100) {
        this.container = document.getElementById(containerId);
        this.stock = initialStock;
        this.maxStock = maxStock;
        if (this.container) {
            this.render();
        }
    }

    update(newStock) {
        this.stock = newStock;
        this.render();
    }

    render() {
        const percentage = (this.stock / this.maxStock) * 100;
        const color = percentage < 20 ? '#ff4b2b' : percentage < 50 ? '#ffb347' : '#00ff00';

        this.container.innerHTML = `
            <div class="stock-counter">
                <div class="stock-label">
                    <span>${this.stock > 0 ? `${this.stock} PIECES LEFT` : 'SOLD OUT'}</span>
                    <span>${Math.round(percentage)}%</span>
                </div>
                <div class="stock-bar-bg">
                    <div class="stock-bar-fill" style="width: ${percentage}%; background: ${color}"></div>
                </div>
            </div>
        `;
    }
}
class ViewingStats {
    constructor(containerId) {
        this.container = document.getElementById(containerId);
        if (!this.container) return;
        this.count = Math.floor(Math.random() * 50) + 15;
        this.init();
    }

    init() {
        this.render();
        setInterval(() => {
            const change = Math.floor(Math.random() * 5) - 2;
            this.count = Math.max(5, this.count + change);
            this.render();
        }, 5000);
    }

    render() {
        this.container.innerHTML = `
            <div style="font-size: 0.7rem; color: var(--accent-color); font-weight: bold; letter-spacing: 0.1em; display: flex; align-items: center; gap: 0.5rem; margin-bottom: 1rem;">
                <span style="width: 6px; height: 6px; background: var(--accent-color); border-radius: 50%; box-shadow: 0 0 10px var(--accent-color); animation: blink 1.5s infinite;"></span>
                ${this.count} NOMADS CURRENTLY VIEWING
            </div>
        `;
    }
}

class ActivityFeed {
    constructor() {
        this.locations = ['Neo-Accra', 'Sector 7', 'Grid City', 'Void Terminal', 'Glitch District'];
        this.products = ['Utility Cargo', 'Glitch Tee', 'Cyber Hoodie', 'Tech Sneaker'];
        this.init();
    }

    init() {
        setInterval(() => {
            if (Math.random() > 0.7) {
                this.showToast();
            }
        }, 15000);
    }

    showToast() {
        const loc = this.locations[Math.floor(Math.random() * this.locations.length)];
        const prod = this.products[Math.floor(Math.random() * this.products.length)];
        const toast = document.createElement('div');
        toast.className = 'activity-toast fade-in';
        toast.style.cssText = `
            position: fixed;
            bottom: 2rem;
            left: 2rem;
            background: rgba(0,0,0,0.9);
            border-left: 3px solid var(--accent-color);
            padding: 1rem;
            color: #fff;
            font-size: 0.7rem;
            z-index: 1000;
            pointer-events: none;
        `;
        toast.innerHTML = `A Nomad from <b>${loc}</b> just secured <b>${prod}</b>`;
        document.body.appendChild(toast);
        setTimeout(() => {
            toast.style.opacity = '0';
            setTimeout(() => toast.remove(), 500);
        }, 5000);
    }
}

// Reusable Footer Component
class SiteFooter {
    constructor() {
        this.render();
    }

    render() {
        // Check if footer already exists
        if (document.querySelector('.professional-footer')) return;

        const footer = document.createElement('footer');
        footer.className = 'professional-footer';
        footer.style.cssText = 'margin-top: 8rem; background: linear-gradient(180deg, #1a1a1a 0%, #1a0f0a 50%, #2a1510 100%); border-top: 2px solid var(--accent-color);';

        footer.innerHTML = `
            <!-- Main Footer Content -->
            <div class="footer-main" style="padding: 5rem 0 3rem;">
                <div class="container">
                    <div class="footer-grid"
                        style="display: grid; grid-template-columns: 1.5fr 1fr 1fr 1fr 1.2fr; gap: 3rem; align-items: start;">
                        <!-- Brand Column -->
                        <div class="footer-brand">
                            <a href="index.html" class="logo"><img src="logo.png" alt="GLITCHGARB"
                                    style="height: 32px;"></a>
                            <p
                                style="margin-top: 1.5rem; opacity: 0.6; font-size: 0.85rem; line-height: 1.7; max-width: 280px;">
                                Defined by exclusivity. Built for the street. Ghana's premier drop-based label.
                            </p>
                            <!-- Social Links -->
                            <div class="footer-social" style="margin-top: 1.5rem; display: flex; gap: 1rem;">
                                <a href="https://www.tiktok.com/@glitchgarb.offici?_r=1&_t=ZS-93rcH8q20Ep" target="_blank"
                                    rel="noopener noreferrer"
                                    style="display: flex; align-items: center; justify-content: center; width: 40px; height: 40px; border-radius: 50%; background: rgba(255,255,255,0.05); color: #fff; transition: all 0.3s ease;"
                                    onmouseover="this.style.background='var(--accent-color)'"
                                    onmouseout="this.style.background='rgba(255,255,255,0.05)'">
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                                        <path
                                            d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5 20.1a6.34 6.34 0 0 0 10.86-4.43v-7a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-1-.1z" />
                                    </svg>
                                </a>
                                <a href="https://snapchat.com/t/PXm7qiXx" target="_blank" rel="noopener noreferrer"
                                    style="display: flex; align-items: center; justify-content: center; width: 40px; height: 40px; border-radius: 50%; background: rgba(255,255,255,0.05); color: #fff; transition: all 0.3s ease;"
                                    onmouseover="this.style.background='var(--accent-color)'"
                                    onmouseout="this.style.background='rgba(255,255,255,0.05)'">
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                                        <path
                                            d="M12.206.793c.99 0 4.347.276 5.93 3.821.529 1.193.403 3.219.299 4.847l-.003.06c-.012.18-.022.345-.03.51.075.045.203.09.401.09.3-.016.659-.12 1.033-.301.165-.088.344-.104.464-.104.182 0 .359.029.509.09.45.149.734.479.734.838.015.449-.39.839-1.213 1.168-.089.029-.209.075-.344.119-.45.135-1.139.36-1.333.81-.09.224-.061.524.12.868l.015.015c.06.136 1.526 3.475 4.791 4.014.255.044.435.27.42.509 0 .075-.015.149-.045.225-.24.569-1.273.988-3.146 1.271-.059.091-.12.375-.164.57-.029.179-.074.36-.134.553-.076.271-.27.405-.555.405h-.03c-.135 0-.313-.031-.538-.074-.36-.075-.765-.135-1.273-.135-.3 0-.599.015-.913.074-.6.104-1.123.464-1.723.884-.853.599-1.826 1.288-3.294 1.288-.06 0-.119-.015-.18-.015h-.149c-1.468 0-2.427-.675-3.279-1.288-.599-.42-1.122-.779-1.722-.884-.314-.045-.629-.074-.928-.074-.54 0-.958.089-1.272.149-.211.043-.391.074-.54.074-.374 0-.523-.224-.583-.42-.061-.192-.09-.389-.135-.567-.046-.181-.105-.494-.166-.57-1.918-.222-2.95-.642-3.189-1.226-.031-.063-.052-.15-.055-.225-.015-.243.165-.465.42-.509 3.264-.54 4.73-3.879 4.791-4.02l.016-.029c.18-.345.224-.645.119-.869-.195-.434-.885-.658-1.332-.809-.121-.029-.24-.074-.346-.119-1.107-.435-1.257-.93-1.197-1.273.09-.479.674-.793 1.168-.793.146 0 .27.029.383.074.42.194.789.3 1.104.3.234 0 .384-.06.465-.105l-.046-.569c-.098-1.626-.225-3.651.307-4.837C7.392 1.077 10.739.807 11.727.807l.419-.015h.06z" />
                                    </svg>
                                </a>
                                <a href="https://instagram.com" target="_blank" rel="noopener noreferrer"
                                    style="display: flex; align-items: center; justify-content: center; width: 40px; height: 40px; border-radius: 50%; background: rgba(255,255,255,0.05); color: #fff; transition: all 0.3s ease;"
                                    onmouseover="this.style.background='var(--accent-color)'"
                                    onmouseout="this.style.background='rgba(255,255,255,0.05)'">
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                                        <path
                                            d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z" />
                                    </svg>
                                </a>
                                <a href="https://twitter.com" target="_blank" rel="noopener noreferrer"
                                    style="display: flex; align-items: center; justify-content: center; width: 40px; height: 40px; border-radius: 50%; background: rgba(255,255,255,0.05); color: #fff; transition: all 0.3s ease;"
                                    onmouseover="this.style.background='var(--accent-color)'"
                                    onmouseout="this.style.background='rgba(255,255,255,0.05)'">
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                                        <path
                                            d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                                    </svg>
                                </a>
                            </div>
                        </div>

                        <!-- Shop Column -->
                        <div class="footer-column">
                            <h4
                                style="font-size: 0.75rem; font-weight: 700; letter-spacing: 0.1em; margin-bottom: 1.5rem; color: #fff;">
                                SHOP</h4>
                            <ul style="list-style: none; padding: 0; margin: 0;">
                                <li style="margin-bottom: 0.75rem;"><a href="shop.html"
                                        style="color: rgba(255,255,255,0.6); text-decoration: none; font-size: 0.85rem; transition: color 0.3s;"
                                        onmouseover="this.style.color='#fff'"
                                        onmouseout="this.style.color='rgba(255,255,255,0.6)'">All Products</a></li>
                                <li style="margin-bottom: 0.75rem;"><a href="collections.html"
                                        style="color: rgba(255,255,255,0.6); text-decoration: none; font-size: 0.85rem; transition: color 0.3s;"
                                        onmouseover="this.style.color='#fff'"
                                        onmouseout="this.style.color='rgba(255,255,255,0.6)'">Collections</a></li>
                                <li style="margin-bottom: 0.75rem;"><a href="shop.html?filter=new"
                                        style="color: rgba(255,255,255,0.6); text-decoration: none; font-size: 0.85rem; transition: color 0.3s;"
                                        onmouseover="this.style.color='#fff'"
                                        onmouseout="this.style.color='rgba(255,255,255,0.6)'">New Arrivals</a></li>
                                <li style="margin-bottom: 0.75rem;"><a href="shop.html?filter=sale"
                                        style="color: rgba(255,255,255,0.6); text-decoration: none; font-size: 0.85rem; transition: color 0.3s;"
                                        onmouseover="this.style.color='#fff'"
                                        onmouseout="this.style.color='rgba(255,255,255,0.6)'">Sale</a></li>
                            </ul>
                        </div>

                        <!-- Support Column -->
                        <div class="footer-column">
                            <h4
                                style="font-size: 0.75rem; font-weight: 700; letter-spacing: 0.1em; margin-bottom: 1.5rem; color: #fff;">
                                SUPPORT</h4>
                            <ul style="list-style: none; padding: 0; margin: 0;">
                                <li style="margin-bottom: 0.75rem;"><a href="contact.html"
                                        style="color: rgba(255,255,255,0.6); text-decoration: none; font-size: 0.85rem; transition: color 0.3s;"
                                        onmouseover="this.style.color='#fff'"
                                        onmouseout="this.style.color='rgba(255,255,255,0.6)'">Contact Us</a></li>
                                <li style="margin-bottom: 0.75rem;"><a href="faq.html"
                                        style="color: rgba(255,255,255,0.6); text-decoration: none; font-size: 0.85rem; transition: color 0.3s;"
                                        onmouseover="this.style.color='#fff'"
                                        onmouseout="this.style.color='rgba(255,255,255,0.6)'">FAQs</a></li>
                                <li style="margin-bottom: 0.75rem;"><a href="shipping.html"
                                        style="color: rgba(255,255,255,0.6); text-decoration: none; font-size: 0.85rem; transition: color 0.3s;"
                                        onmouseover="this.style.color='#fff'"
                                        onmouseout="this.style.color='rgba(255,255,255,0.6)'">Shipping Info</a></li>
                                <li style="margin-bottom: 0.75rem;"><a href="returns.html"
                                        style="color: rgba(255,255,255,0.6); text-decoration: none; font-size: 0.85rem; transition: color 0.3s;"
                                        onmouseover="this.style.color='#fff'"
                                        onmouseout="this.style.color='rgba(255,255,255,0.6)'">Returns</a></li>
                                <li style="margin-bottom: 0.75rem;"><a href="size-guide.html"
                                        style="color: rgba(255,255,255,0.6); text-decoration: none; font-size: 0.85rem; transition: color 0.3s;"
                                        onmouseover="this.style.color='#fff'"
                                        onmouseout="this.style.color='rgba(255,255,255,0.6)'">Size Guide</a></li>
                            </ul>
                        </div>

                        <!-- Company Column -->
                        <div class="footer-column">
                            <h4
                                style="font-size: 0.75rem; font-weight: 700; letter-spacing: 0.1em; margin-bottom: 1.5rem; color: #fff;">
                                COMPANY</h4>
                            <ul style="list-style: none; padding: 0; margin: 0;">
                                <li style="margin-bottom: 0.75rem;"><a href="about.html"
                                        style="color: rgba(255,255,255,0.6); text-decoration: none; font-size: 0.85rem; transition: color 0.3s;"
                                        onmouseover="this.style.color='#fff'"
                                        onmouseout="this.style.color='rgba(255,255,255,0.6)'">About Us</a></li>
                                <li style="margin-bottom: 0.75rem;"><a href="about.html#story"
                                        style="color: rgba(255,255,255,0.6); text-decoration: none; font-size: 0.85rem; transition: color 0.3s;"
                                        onmouseover="this.style.color='#fff'"
                                        onmouseout="this.style.color='rgba(255,255,255,0.6)'">Our Story</a></li>
                                <li style="margin-bottom: 0.75rem;"><a href="careers.html"
                                        style="color: rgba(255,255,255,0.6); text-decoration: none; font-size: 0.85rem; transition: color 0.3s;"
                                        onmouseover="this.style.color='#fff'"
                                        onmouseout="this.style.color='rgba(255,255,255,0.6)'">Careers</a></li>
                                <li style="margin-bottom: 0.75rem;"><a href="privacy.html"
                                        style="color: rgba(255,255,255,0.6); text-decoration: none; font-size: 0.85rem; transition: color 0.3s;"
                                        onmouseover="this.style.color='#fff'"
                                        onmouseout="this.style.color='rgba(255,255,255,0.6)'">Privacy Policy</a></li>
                                <li style="margin-bottom: 0.75rem;"><a href="terms.html"
                                        style="color: rgba(255,255,255,0.6); text-decoration: none; font-size: 0.85rem; transition: color 0.3s;"
                                        onmouseover="this.style.color='#fff'"
                                        onmouseout="this.style.color='rgba(255,255,255,0.6)'">Terms of Service</a></li>
                            </ul>
                        </div>

                        <!-- Newsletter Column -->
                        <div class="footer-newsletter">
                            <h4
                                style="font-size: 0.75rem; font-weight: 700; letter-spacing: 0.1em; margin-bottom: 1rem; color: #fff;">
                                JOIN THE DROP</h4>
                            <p
                                style="color: rgba(255,255,255,0.6); font-size: 0.85rem; margin-bottom: 1.25rem; line-height: 1.6;">
                                Subscribe for exclusive access to drops, early releases, and member-only offers.</p>
                            <form class="newsletter-form" style="display: flex; gap: 0.5rem;"
                                onsubmit="event.preventDefault(); alert('Thanks for subscribing!');">
                                <input type="email" placeholder="Enter your email" required
                                    style="flex: 1; padding: 0.875rem 1rem; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); border-radius: 4px; color: #fff; font-size: 0.85rem; outline: none; transition: border-color 0.3s;"
                                    onfocus="this.style.borderColor='var(--accent-color)'"
                                    onblur="this.style.borderColor='rgba(255,255,255,0.1)'">
                                <button type="submit"
                                    style="padding: 0.875rem 1.25rem; background: var(--accent-color); border: none; border-radius: 4px; color: #fff; font-weight: 600; font-size: 0.8rem; cursor: pointer; transition: opacity 0.3s;"
                                    onmouseover="this.style.opacity='0.9'" onmouseout="this.style.opacity='1'">
                                    JOIN
                                </button>
                            </form>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Payment & Trust Section -->
            <div class="footer-trust" style="border-top: 1px solid rgba(255,255,255,0.05); padding: 2rem 0;">
                <div class="container"
                    style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 1.5rem;">
                    <!-- Secure Payment Methods -->
                    <div class="payment-methods" style="display: flex; align-items: center; gap: 1rem;">
                        <div style="display: flex; align-items: center; gap: 0.5rem;">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#4ade80" stroke-width="2">
                                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                                <path d="M9 12l2 2 4-4" />
                            </svg>
                            <span
                                style="color: #4ade80; font-size: 0.7rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em;">Secure
                                Payment</span>
                        </div>
                        <div style="display: flex; gap: 0.5rem; align-items: center;">
                            <!-- Visa -->
                            <div
                                style="background: #1a1f71; padding: 0.4rem 0.6rem; border-radius: 4px; display: flex; align-items: center; justify-content: center;">
                                <span
                                    style="font-size: 0.75rem; font-weight: 800; color: #fff; font-style: italic;">VISA</span>
                            </div>
                            <!-- Mastercard -->
                            <div
                                style="background: #000; padding: 0.4rem 0.6rem; border-radius: 4px; display: flex; align-items: center; gap: 0.25rem;">
                                <div style="width: 12px; height: 12px; background: #eb001b; border-radius: 50%;"></div>
                                <div
                                    style="width: 12px; height: 12px; background: #f79e1b; border-radius: 50%; margin-left: -4px;">
                                </div>
                            </div>
                            <!-- MTN Momo -->
                            <div
                                style="background: #ffcc00; padding: 0.4rem 0.6rem; border-radius: 4px; display: flex; align-items: center; justify-content: center;">
                                <span style="font-size: 0.6rem; font-weight: 800; color: #000;">MTN</span>
                            </div>
                            <!-- Vodafone -->
                            <div
                                style="background: #e60000; padding: 0.4rem 0.6rem; border-radius: 4px; display: flex; align-items: center; justify-content: center;">
                                <span style="font-size: 0.55rem; font-weight: 700; color: #fff;">VODAFONE</span>
                            </div>
                            <!-- Apple Pay -->
                            <div
                                style="background: #000; padding: 0.4rem 0.6rem; border-radius: 4px; display: flex; align-items: center; justify-content: center;">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="#fff">
                                    <path
                                        d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z" />
                                </svg>
                            </div>
                            <!-- Google Pay -->
                            <div
                                style="background: #fff; padding: 0.4rem 0.6rem; border-radius: 4px; display: flex; align-items: center; justify-content: center; gap: 0.15rem;">
                                <span style="font-size: 0.6rem; font-weight: 500; color: #4285f4;">G</span>
                                <span style="font-size: 0.6rem; font-weight: 500; color: #ea4335;">o</span>
                                <span style="font-size: 0.6rem; font-weight: 500; color: #fbbc05;">o</span>
                                <span style="font-size: 0.6rem; font-weight: 500; color: #4285f4;">g</span>
                                <span style="font-size: 0.6rem; font-weight: 500; color: #34a853;">l</span>
                                <span style="font-size: 0.6rem; font-weight: 500; color: #ea4335;">e</span>
                            </div>
                        </div>
                    </div>

                    <!-- Trust Badges -->
                    <div class="trust-badges" style="display: flex; align-items: center; gap: 1.5rem;">
                        <div style="display: flex; align-items: center; gap: 0.5rem; color: rgba(255,255,255,0.5);">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#4ade80" stroke-width="2">
                                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                                <path d="M9 12l2 2 4-4" />
                            </svg>
                            <span style="font-size: 0.7rem;">Secure Checkout</span>
                        </div>
                        <div style="display: flex; align-items: center; gap: 0.5rem; color: rgba(255,255,255,0.5);">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#60a5fa" stroke-width="2">
                                <rect x="1" y="3" width="15" height="13" rx="2" ry="2" />
                                <path d="M16 8h4a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-1" />
                            </svg>
                            <span style="font-size: 0.7rem;">Fast Delivery</span>
                        </div>
                        <div style="display: flex; align-items: center; gap: 0.5rem; color: rgba(255,255,255,0.5);">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#f472b6" stroke-width="2">
                                <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                                <polyline points="22,6 12,13 2,6" />
                            </svg>
                            <span style="font-size: 0.7rem;">24/7 Support</span>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Bottom Bar -->
            <div class="footer-bottom" style="border-top: 1px solid rgba(255,255,255,0.05); padding: 1.5rem 0;">
                <div class="container"
                    style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 1rem;">
                    <div style="color: rgba(255,255,255,0.4); font-size: 0.75rem;">
                        &copy; 2026 GLITCHGARB. ALL RIGHTS RESERVED.
                    </div>
                    <div style="display: flex; gap: 2rem;">
                        <a href="privacy.html"
                            style="color: rgba(255,255,255,0.4); text-decoration: none; font-size: 0.75rem; transition: color 0.3s;"
                            onmouseover="this.style.color='rgba(255,255,255,0.8)'"
                            onmouseout="this.style.color='rgba(255,255,255,0.4)'">Privacy</a>
                        <a href="terms.html"
                            style="color: rgba(255,255,255,0.4); text-decoration: none; font-size: 0.75rem; transition: color 0.3s;"
                            onmouseover="this.style.color='rgba(255,255,255,0.8)'"
                            onmouseout="this.style.color='rgba(255,255,255,0.4)'">Terms</a>
                        <a href="#"
                            style="color: rgba(255,255,255,0.4); text-decoration: none; font-size: 0.75rem; transition: color 0.3s;"
                            onmouseover="this.style.color='rgba(255,255,255,0.8)'"
                            onmouseout="this.style.color='rgba(255,255,255,0.4)'">Cookies</a>
                    </div>
                </div>
            </div>

            <!-- Mobile Footer Styles -->
            <style>
                @media (max-width: 1024px) {
                    .footer-grid {
                        grid-template-columns: 1fr 1fr !important;
                        gap: 2.5rem !important;
                    }

                    .footer-newsletter {
                        grid-column: span 2;
                    }
                }

                @media (max-width: 640px) {
                    .footer-grid {
                        grid-template-columns: 1fr 1fr !important;
                        gap: 2rem !important;
                    }

                    .footer-brand {
                        grid-column: span 2;
                    }

                    .footer-newsletter {
                        grid-column: span 2;
                    }

                    .footer-trust .container {
                        flex-direction: column;
                        text-align: center;
                    }

                    .payment-methods {
                        flex-direction: column;
                    }

                    .trust-badges {
                        flex-wrap: wrap;
                        justify-content: center;
                    }

                    .footer-bottom .container {
                        flex-direction: column;
                        text-align: center;
                    }
                }
            </style>
        `;

        // Insert footer before closing body tag
        document.body.appendChild(footer);
    }
}

// Auto-initialize footer when DOM is ready
function initFooter() {
    new SiteFooter();
}

// Initialize on DOMContentLoaded or immediately if DOM is already ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initFooter);
} else {
    initFooter();
}
