/**
 * admin-api.js - Admin-specific API service with authentication and admin features
 */

class AdminAPI {
    constructor() {
        this.TOKEN_KEY = 'admin_token';
        this.REFRESH_TOKEN_KEY = 'admin_refresh_token';
        this.USER_KEY = 'admin_user';
        this.API_URL = this._detectAPIURL();
        this.apiAvailable = false;
        this.apiChecked = false;
        this.cache = new Map();
        this._waitForAPI();
    }

    _detectAPIURL() {
        // Explicit API URL via global config (set in config.js)
        if (typeof window.GLITCHGARB_API_URL === 'string' && window.GLITCHGARB_API_URL) {
            console.log(`admin-api: using GLITCHGARB_API_URL = ${window.GLITCHGARB_API_URL}`);
            return window.GLITCHGARB_API_URL;
        }

        const host = window.location.hostname;
        console.warn(`admin-api: GLITCHGARB_API_URL not set, falling back to hostname detection`);

        if (host === 'localhost' || host === '127.0.0.1') {
            return 'http://localhost:5001/api';
        }

        // For production, use the known Render API URL as fallback
        return '/api';
    }

    async _waitForAPI() {
        if (this.apiChecked) return;
        // Quick 5s health check, but don't block requests if it fails
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 5000);
            const response = await fetch(`${this.API_URL}/health`, {
                signal: controller.signal
            });
            clearTimeout(timeoutId);
            this.apiAvailable = response.ok;
        } catch (e) {
            this.apiAvailable = true; // Try anyway
        }
        this.apiChecked = true;
    }

    getStoredToken() {
        return localStorage.getItem(this.TOKEN_KEY);
    }

    setToken(token, refreshToken, user) {
        if (token) localStorage.setItem(this.TOKEN_KEY, token);
        if (refreshToken) localStorage.setItem(this.REFRESH_TOKEN_KEY, refreshToken);
        if (user) localStorage.setItem(this.USER_KEY, typeof user === 'string' ? user : JSON.stringify(user));
    }

    clearToken() {
        localStorage.removeItem(this.TOKEN_KEY);
        localStorage.removeItem(this.REFRESH_TOKEN_KEY);
        localStorage.removeItem(this.USER_KEY);
    }

    getAuthHeaders() {
        const token = this.getStoredToken();
        const headers = { 'Content-Type': 'application/json' };
        if (token) {
            headers['Authorization'] = `Bearer ${token}`;
        }
        return headers;
    }

    async apiRequest(endpoint, options = {}) {
        let url = `${this.API_URL}${endpoint}`;
        if (url.startsWith('http://')) {
            url = 'https://' + url.slice(7);
        }
        
        // Wait for initial API check
        if (!this.apiChecked) {
            await this._waitForAPI();
            url = `${this.API_URL}${endpoint}`;
            if (url.startsWith('http://')) {
                url = 'https://' + url.slice(7);
            }
        }

        const headers = this.getAuthHeaders();
        const config = {
            headers: headers,
            ...options,
            signal: AbortSignal.timeout(30000)
        };
        
        console.log(`admin-api: ${config.method || 'GET'} ${url}`);
        
        const response = await fetch(url, config);
        console.log(`admin-api: response ${response.status}`);
        const data = await response.json();
        
        if (!response.ok) {
            if (response.status === 401) {
                this.clearToken();
                throw new Error('Session expired. Please login again.');
            }
            let errorMessage = data.message || data.detail || 'API request failed';
            if (Array.isArray(errorMessage)) {
                errorMessage = errorMessage.map(e => e.msg || JSON.stringify(e)).join(', ');
            }
            throw new Error(errorMessage);
        }
        return data;
    }

    clearCache(key) {
        if (key) {
            this.cache.delete(key);
        } else {
            this.cache.clear();
        }
    }

    // ============================================
    // AUTHENTICATION
    // ============================================
    
    async login(email, password) {
        const response = await this.apiRequest('/auth/login', {
            method: 'POST',
            body: JSON.stringify({ email, password })
        });

        if (response.success) {
            this.setToken(response.token, response.refresh_token, response.user);
        }

        return response;
    }

    async logout() {
        try {
            await this.apiRequest('/auth/logout', { method: 'POST' });
        } catch (error) {
            console.warn('Logout API call failed:', error);
        }
        this.clearToken();
    }

    async getCurrentUser() {
        try {
            const response = await this.apiRequest('/auth/me');
            if (response.success) {
                this.setToken(null, null, response.user);
                return response.user;
            }
            return null;
        } catch (error) {
            console.error('Failed to get current user:', error);
            return null;
        }
    }

    async refreshToken() {
        const refreshToken = localStorage.getItem(this.REFRESH_TOKEN_KEY);
        if (!refreshToken) {
            throw new Error('No refresh token available');
        }

        const response = await fetch(`${this.API_URL}/auth/refresh`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ refresh_token: refreshToken })
        });
        
        if (!response.ok) {
            const errData = await response.json().catch(() => ({}));
            throw new Error(errData.message || 'Token refresh failed');
        }
        
        const data = await response.json();
        
        if (data.success) {
            localStorage.setItem(this.TOKEN_KEY, data.token);
            if (data.refresh_token) {
                localStorage.setItem(this.REFRESH_TOKEN_KEY, data.refresh_token);
            }
            return data;
        }
        
        throw new Error(data.message || 'Token refresh failed');
    }

    // ============================================
    // USERS MANAGEMENT
    // ============================================
    
    async getAllUsers() {
        try {
            const response = await this.apiRequest('/auth/users/');
            return response.users || [];
        } catch (error) {
            console.error('Failed to get users:', error);
            return [];
        }
    }

    // ============================================
    // PRODUCTS MANAGEMENT
    // ============================================
    
    async getProducts() {
        const cacheKey = 'admin_products_cache';
        try {
             const response = await this.apiRequest('/products/');
            const products = response.products || [];
            this.cache.set(cacheKey, products);
            return { success: true, products };
        } catch (error) {
            console.error('Failed to get products:', error);
            return { success: false, products: [], message: error.message };
        }
    }

    clearProductCache() {
        this.cache.delete('admin_products_cache');
    }

    async addProduct(productData) {
        const response = await this.apiRequest('/products/', {
            method: 'POST',
            body: JSON.stringify(productData)
        });
        
        if (response.success) {
            this.clearCache('admin_products_cache');
        }
        
        return response;
    }

    async updateProduct(productId, productData) {
        const response = await this.apiRequest(`/products/${productId}`, {
            method: 'PUT',
            body: JSON.stringify(productData)
        });
        
        if (response.success) {
            this.clearCache('admin_products_cache');
        }
        
        return response;
    }

    async deleteProduct(productId) {
        const response = await this.apiRequest(`/products/${productId}`, {
            method: 'DELETE'
        });
        
        if (response.success) {
            this.clearCache('admin_products_cache');
        }
        
        return response;
    }

    // ============================================
    // ORDERS MANAGEMENT
    // ============================================
    
    async getOrders() {
        try {
            const response = await this.apiRequest('/orders/');
            const orders = response.orders || [];
            return { success: true, orders };
        } catch (error) {
            console.error('Failed to get orders:', error);
            return { success: false, orders: [], message: error.message };
        }
    }

    clearOrdersCache() {
        this.cache.delete('admin_orders_cache');
    }

    async updateOrderStatus(orderId, status) {
        const response = await this.apiRequest(`/orders/${orderId}/status`, {
            method: 'PUT',
            body: JSON.stringify({ status })
        });
        
        if (response.success) {
            this.clearCache('admin_orders_cache');
        }
        
        return response;
    }

    // ============================================
    // STATISTICS
    // ============================================
    
    async getStats() {
        try {
            const [productsResult, ordersResult, users] = await Promise.all([
                this.getProducts(),
                this.getOrders(),
                this.getAllUsers()
            ]);
            
            const totalProducts = productsResult.success ? (productsResult.products ? productsResult.products.length : 0) : 0;
            const totalOrders = ordersResult.success ? (ordersResult.orders ? ordersResult.orders.length : 0) : 0;
            const totalUsers = Array.isArray(users) ? users.length : 0;
            
            let totalRevenue = 0;
            if (ordersResult.success && ordersResult.orders) {
                ordersResult.orders.forEach(order => {
                    if (order.payment_status === 'paid' || order.status === 'delivered' || order.status === 'completed') {
                        const amount = order.total || order.price || 0;
                        totalRevenue += parseFloat(amount);
                    }
                });
            }
            
            return {
                success: true,
                totalProducts,
                totalUsers,
                totalOrders,
                totalRevenue: parseFloat(totalRevenue.toFixed(2))
            };
        } catch (error) {
            console.error('Failed to get stats:', error);
            return {
                success: false,
                totalProducts: 0,
                totalUsers: 0,
                totalOrders: 0,
                totalRevenue: 0,
                message: error.message
            };
        }
    }

    // ============================================
    // SETTINGS MANAGEMENT
    // ============================================
    
    async getHeroSlides() {
        try {
            const response = await this.apiRequest('/settings/hero-slides/');
            const slides = response.slides || [];
            if (slides.length > 0) {
                localStorage.setItem('glitchgarb_hero_slides', JSON.stringify(slides));
            }
            return { success: true, slides };
        } catch (error) {
            console.error('Failed to get hero slides:', error);
            try {
                const stored = localStorage.getItem('glitchgarb_hero_slides');
                if (stored) {
                    const slides = JSON.parse(stored);
                    if (Array.isArray(slides) && slides.length > 0) {
                        return { success: true, slides };
                    }
                }
            } catch (e) {
                console.error('Failed to load fallback hero slides:', e);
            }
            // Return default slides so admin always has something to manage
            const defaultSlides = [
                {
                    id: 1,
                    image: 'https://images.unsplash.com/photo-1552374196-1ab2a1c593e8?auto=format&fit=crop&q=80&w=1587',
                    title: 'GLITCH<br>CORE',
                    subtitle: 'THE FOUNDATION COLLECTION. LIMITED NUMBERS.',
                    cta: 'Secure the Drop',
                    link: '/shop',
                    enabled: true
                },
                {
                    id: 2,
                    image: 'https://images.unsplash.com/photo-1508427953056-b00b8d78ebf5?auto=format&fit=crop&q=80&w=1740',
                    title: 'URBAN<br>UTILITY',
                    subtitle: 'ENGINEERED FOR THE STREETS. GHANA PRIDE.',
                    cta: 'View Collection',
                    link: '/shop',
                    enabled: true
                }
            ];
            localStorage.setItem('glitchgarb_hero_slides', JSON.stringify(defaultSlides));
            return { success: true, slides: defaultSlides };
        }
    }

    async updateHeroSlides(slides) {
        const response = await this.apiRequest('/settings/hero-slides/', {
            method: 'PUT',
            body: JSON.stringify({ slides })
        });
        
        if (response.success) {
            localStorage.setItem('glitchgarb_hero_slides', JSON.stringify(slides));
        }
        
        return response;
    }

    async getNextDrop() {
        try {
            const response = await this.apiRequest('/settings/next-drop/');
            return { success: true, config: response.config };
        } catch (error) {
            console.error('Failed to get next drop:', error);
            try {
                const stored = localStorage.getItem('glitchgarb_next_drop');
                if (stored) {
                    const config = JSON.parse(stored);
                    return { success: true, config };
                }
            } catch (e) {
                console.error('Failed to load fallback next drop:', e);
            }
            return { success: false, config: null, message: error.message };
        }
    }

    async updateNextDrop(config) {
        const response = await this.apiRequest('/settings/next-drop/', {
            method: 'PUT',
            body: JSON.stringify(config)
        });
        
        if (response.success) {
            localStorage.setItem('glitchgarb_next_drop', JSON.stringify(config));
        }
        
        return response;
    }

    // ============================================
    // TELEGRAM NOTIFICATIONS
    // ============================================
    
    async getTelegramSettings() {
        try {
            const response = await this.apiRequest('/settings/telegram');
            if (response.success && response.settings) {
                return { success: true, settings: response.settings };
            }
            return { success: true, settings: { enabled: false, bot_token: '', chat_id: '' } };
        } catch (error) {
            console.error('Failed to get telegram settings:', error);
            return { success: false, settings: { enabled: false, bot_token: '', chat_id: '' } };
        }
    }

    async updateTelegramSettings(settings) {
        const response = await this.apiRequest('/settings/telegram', {
            method: 'PUT',
            body: JSON.stringify(settings)
        });
        return response;
    }

    async testTelegramNotification(botToken, chatId) {
        try {
            const response = await this.apiRequest('/settings/telegram/test', { method: 'POST', body: JSON.stringify({ bot_token: botToken, chat_id: chatId }) });
            return response;
        } catch (error) {
            return { success: false, message: error.message };
        }
    }
}

// Create singleton instance
window.adminAPI = new AdminAPI();


