/**
 * api-service.js - Hybrid Storage (API + LocalStorage fallback)
 */

class HybridStorageService {
    constructor() {
        this.TOKEN_KEY = 'glitchgarb_token';
        this.REFRESH_TOKEN_KEY = 'glitchgarb_refresh_token';
        this.USER_KEY = 'glitchgarb_user';
        this.API_URL = this._detectAPIURL();
        this.apiAvailable = false;
        this._waitForAPI();
    }

    _detectAPIURL() {
        const host = window.location.hostname;
        const isLocalhost = host === 'localhost' || host === '127.0.0.1';
        
        // Local development only - check this first so localhost doesn't hit Render
        if (isLocalhost) {
            return 'http://localhost:5001/api';
        }
        
        // Explicit API URL via global config (set in index.html for production)
        if (typeof window.GLITCHGARB_API_URL === 'string' && window.GLITCHGARB_API_URL) {
            return window.GLITCHGARB_API_URL;
        }
        
        // Production fallback – Vercel proxies /api to Render
        return '/api';
    }

    async _waitForAPI() {
        // Quick health check - don't block for long
        if (this.apiChecked) return;
        
        const checkUrl = async (url) => {
            try {
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 5000);
                const response = await fetch(`${url}/health`, {
                    method: 'GET',
                    signal: controller.signal
                });
                clearTimeout(timeoutId);
                if (response.ok) return url;
            } catch (e) {}
            return null;
        };

        const url = await checkUrl(this.API_URL);
        if (url) {
            this.apiAvailable = true;
            console.log(`API available at: ${url}`);
        } else {
            // Even if health check fails, still try the API for requests
            // (Render cold starts can be slow but work on actual requests)
            this.apiAvailable = true;
            console.log('API health check failed but will try requests anyway');
        }
        this.apiChecked = true;
    }

    getAuthHeaders() {
        const token = localStorage.getItem(this.TOKEN_KEY);
        const headers = {
            'Content-Type': 'application/json'
        };
        if (token) {
            headers['Authorization'] = `Bearer ${token}`;
        }
        return headers;
    }

    async apiRequest(endpoint, options = {}) {
        let url = `${this.API_URL}${endpoint}`;
        
        // Ensure URL always uses HTTPS (guards against any http:// that slips through)
        if (url.startsWith('http://')) {
            url = 'https://' + url.slice(7);
        }

        const headers = this.getAuthHeaders();
        
        const config = {
            headers: headers,
            ...options
        };
        
        // Add timeout via AbortController
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 30000);
        config.signal = controller.signal;
        
        try {
            const response = await fetch(url, config);
            clearTimeout(timeoutId);
            console.log(`apiRequest response: ${response.status} ${response.statusText}`, response);
            
            const data = await response.json();
            console.log(`apiRequest data:`, data);
            
            if (!response.ok) {
                // If 401 and we have a refresh token, try to refresh
                if (response.status === 401) {
                    const refreshToken = localStorage.getItem(this.REFRESH_TOKEN_KEY);
                    if (refreshToken) {
                        try {
                            const refreshData = await this.refreshToken();
                            // Retry original request with new token
                            config.headers['Authorization'] = `Bearer ${refreshData.token}`;
                            const retryResponse = await fetch(url, config);
                            const retryData = await retryResponse.json();
                            
                            if (!retryResponse.ok) {
                                throw new Error(retryData.message || retryData.detail || 'API request failed');
                            }
                            return retryData;
                        } catch (refreshError) {
                            // Refresh failed - clear tokens and rethrow
                            localStorage.removeItem(this.TOKEN_KEY);
                            localStorage.removeItem(this.REFRESH_TOKEN_KEY);
                            throw new Error('Session expired. Please login again.');
                        }
                    }
                }
                let errorMessage = data.message || data.detail || (typeof data === 'string' ? data : 'API request failed');
                if (Array.isArray(errorMessage)) {
                    errorMessage = errorMessage.map(e => e.msg || JSON.stringify(e)).join(', ');
                }
                throw new Error(errorMessage);
            }
            return data;
        } catch (error) {
            console.error(`apiRequest FAILED: ${config.method || 'GET'} ${url}`, error);
            if (error.name === 'AbortError' || error.name === 'TimeoutError') {
                throw new Error('Request timeout. Please try again.');
            }
            throw error;
        }
    }

    // ============================================
    // AUTH
    // ============================================
    
    getCurrentUser() {
        const user = localStorage.getItem(this.USER_KEY);
        return user ? JSON.parse(user) : null;
    }

    isLoggedIn() {
        return !!localStorage.getItem(this.TOKEN_KEY);
    }

    isAdmin() {
        const user = this.getCurrentUser();
        return user && user.is_admin === true;
    }

    logout() {
        localStorage.removeItem(this.TOKEN_KEY);
        localStorage.removeItem(this.REFRESH_TOKEN_KEY);
        localStorage.removeItem(this.USER_KEY);
        window.dispatchEvent(new Event('storage'));
    }

    setAuth(token, refreshToken, user) {
        if (token) localStorage.setItem(this.TOKEN_KEY, token);
        if (refreshToken) localStorage.setItem(this.REFRESH_TOKEN_KEY, refreshToken);
        if (user) localStorage.setItem(this.USER_KEY, typeof user === 'string' ? user : JSON.stringify(user));
        window.dispatchEvent(new Event('storage'));
    }

    async signup(userData) {
        const response = await this.apiRequest('/auth/signup', {
            method: 'POST',
            body: JSON.stringify(userData)
        });
        
        if (response.success) {
            this.setAuth(response.token, response.refresh_token, response.user);
        }
        
        return response;
    }

    // Alias for backward compatibility
    async registerUser(userData) {
        return this.signup(userData);
    }

    async login(email, password) {
        const response = await this.apiRequest('/auth/login', {
            method: 'POST',
            body: JSON.stringify({ email, password })
        });

        if (response.success) {
            this.setAuth(response.token, response.refresh_token, response.user);

            // Merge guest cart with user cart
            await this.mergeGuestCart();
        }

        return response;
    }

    // Alias for backward compatibility
    async loginUser(email, password) {
        return this.login(email, password);
    }

    async mergeGuestCart() {
        try {
            // Get guest cart from localStorage
            const stored = localStorage.getItem('glitchgarb_cart');
            if (!stored) return { success: true, message: 'No guest cart to merge' };

            const cart = JSON.parse(stored);
            const items = cart.items || (Array.isArray(cart) ? cart : []);

            if (!items.length) return { success: true, message: 'No guest cart to merge' };

            // Call backend to merge
            const response = await this.apiRequest('/cart/merge', {
                method: 'POST',
                body: JSON.stringify({ items })
            });

            if (response.success) {
                // Clear localStorage cart after successful merge
                localStorage.removeItem('glitchgarb_cart');
                this._lastCart = null; // Clear cache
                console.log('Guest cart merged successfully');
            }

            return response;
        } catch (e) {
            console.error('Failed to merge guest cart:', e);
            return { success: false, message: e.message };
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

    async verifyToken() {
        try {
            const response = await this.apiRequest('/auth/verify-token');
            return response;
        } catch (error) {
            return { success: false, message: error.message };
        }
    }

    async getAllUsers() {
        try {
            const response = await this.apiRequest('/auth/users/');
            return response.users || [];
        } catch (e) {
            console.error('Failed to get users:', e);
            return [];
        }
    }

    async updateProfile(updateData) {
        const response = await this.apiRequest('/auth/me', {
            method: 'PUT',
            body: JSON.stringify(updateData)
        });
        
        if (response.success) {
            const currentUser = this.getCurrentUser();
            localStorage.setItem(this.USER_KEY, JSON.stringify({...currentUser, ...updateData}));
        }
        
        return response;
    }

    async updatePassword(currentPassword, newPassword) {
        const response = await this.apiRequest('/auth/password', {
            method: 'PUT',
            body: JSON.stringify({ current_password: currentPassword, new_password: newPassword })
        });
        
        return response;
    }

    async upgradeToVIP() {
        const response = await this.apiRequest('/auth/vip', {
            method: 'POST'
        });
        
        if (response.success) {
            const currentUser = this.getCurrentUser();
            localStorage.setItem(this.USER_KEY, JSON.stringify({...currentUser, isVIP: true}));
        }
        
        return response;
    }

    async forgotPassword(email) {
        return await this.apiRequest('/auth/forgot-password', {
            method: 'POST',
            body: JSON.stringify({ email })
        });
    }

    async resetPassword(token, new_password) {
        return await this.apiRequest('/auth/reset-password', {
            method: 'POST',
            body: JSON.stringify({ token, new_password })
        });
    }

    // ============================================
    // PRODUCTS
    // ============================================
    
    async getProducts() {
        const response = await this.apiRequest('/products/');
        return response.products || [];
    }

    async getProduct(id) {
        const response = await this.apiRequest(`/products/${id}`);
        return response.product;
    }

    async purchaseProduct(productId) {
        // This is a local-only operation for legacy support
        const products = await this.getProducts();
        const product = products.find(p => String(p.id) === String(productId));
        
        if (!product) {
            return { success: false, message: 'Product not found' };
        }
        
        if (product.stock <= 0) {
            return { success: false, message: 'Product out of stock' };
        }
        
        // Update local storage
        product.stock -= 1;
        localStorage.setItem('glitchgarb_products', JSON.stringify(products));
        
        return { success: true, product };
    }

    async addProduct(productData) {
        // Map 'image' to 'images' for backend compatibility
        const body = { ...productData };
        if (body.image && (!body.images || body.images.length === 0)) {
            body.images = [body.image];
        }
        
        const response = await this.apiRequest('/products/', {
            method: 'POST',
            body: JSON.stringify(body)
        });
        return response;
    }

    async updateProduct(productId, productData) {
        // Map 'image' to 'images' for backend compatibility
        const body = { ...productData };
        if (body.image && (!body.images || body.images.length === 0)) {
            body.images = [body.image];
        }
        
        const response = await this.apiRequest(`/products/${productId}`, {
            method: 'PUT',
            body: JSON.stringify(body)
        });
        return response;
    }

    async deleteProduct(productId) {
        const response = await this.apiRequest(`/products/${productId}`, {
            method: 'DELETE'
        });
        return response;
    }

    async updateProductStock(productId, stock, operation = 'set') {
        const response = await this.apiRequest(`/products/${productId}/stock`, {
            method: 'PUT',
            body: JSON.stringify({ stock, operation })
        });
        return response;
    }

    // ============================================
    // CART
    // ============================================

    async getCart() {
        try {
            const response = await this.apiRequest('/cart/');

            let cart = response.cart || response;

            if (!cart.items || !Array.isArray(cart.items) || cart.items.length === 0) {
                const localCart = localStorage.getItem('glitchgarb_cart');
                if (localCart) {
                    try {
                        const parsed = JSON.parse(localCart);
                        const localItems = parsed.items || (Array.isArray(parsed) ? parsed : []);
                        if (localItems.length > 0) {
                            const items = localItems;
                            const subtotal = items.reduce((sum, item) => {
                                const price = parseFloat(item.price) || 0;
                                const quantity = parseInt(item.quantity) || 1;
                                return sum + (price * quantity);
                            }, 0);
                            const shipping = subtotal > 100 ? 0 : 9.99;
                            const tax = Math.round(subtotal * 0.08 * 100) / 100;
                            const total = Math.round((subtotal + shipping + tax) * 100) / 100;
                            const result = { items, subtotal, shipping, tax, total };
                            this._lastCart = result;
                            return result;
                        }
                    } catch (e) {
                        console.error('Failed to parse localStorage cart:', e);
                    }
                }
            }

            this._lastCart = cart && cart.items ? cart : { items: [], subtotal: 0, shipping: 0, tax: 0, total: 0 };
            return this._lastCart;
        } catch (e) {
            console.warn('API failed, using localStorage for cart');
            try {
                const stored = localStorage.getItem('glitchgarb_cart');
                if (!stored) return { items: [], subtotal: 0, shipping: 0, tax: 0, total: 0 };

                const cart = JSON.parse(stored);
                let items = [];

                // Handle all possible formats
                if (cart && Array.isArray(cart)) {
                    // Old format: array directly
                    items = cart;
                } else if (cart && cart.items && Array.isArray(cart.items)) {
                    // New format: { items: [...] }
                    items = cart.items;
                } else {
                    // Invalid format
                    localStorage.removeItem('glitchgarb_cart');
                    return { items: [], subtotal: 0, shipping: 0, tax: 0, total: 0 };
                }

                // Calculate totals
                if (!Array.isArray(items) || items.length === 0) return { items: [], subtotal: 0, shipping: 0, tax: 0, total: 0 };

                const subtotal = items.reduce((sum, item) => {
                    const price = parseFloat(item.price) || 0;
                    const quantity = parseInt(item.quantity) || 1;
                    return sum + (price * quantity);
                }, 0);

                const shipping = subtotal > 100 ? 0 : 9.99;
                const tax = Math.round(subtotal * 0.08 * 100) / 100;
                const total = Math.round((subtotal + shipping + tax) * 100) / 100;

                const result = { items, subtotal, shipping, tax, total };
                this._lastCart = result;
                return result;
            } catch (parseError) {
                console.error('Failed to parse cart from localStorage:', parseError);
                localStorage.removeItem('glitchgarb_cart');
                return { items: [], subtotal: 0, shipping: 0, tax: 0, total: 0 };
            }
        }
    }

    async addToCart(item) {
        try {
            const response = await this.apiRequest('/cart/', {
                method: 'POST',
                body: JSON.stringify(item)
            });

            // If backend indicates guest mode, save to localStorage
            if (response.guest) {
                return this._addToLocalCart(item);
            }

            // Update last cart cache for getCartCount() to work
            if (response.cart) {
                this._lastCart = response.cart;
            }

            return response;
        } catch (e) {
            console.warn('API failed, using localStorage for addToCart');
            return this._addToLocalCart(item);
        }
    }

    _addToLocalCart(item) {
        // Read cart from localStorage (API format: { items: [...] })
        let cart = { items: [], subtotal: 0, shipping: 0, tax: 0, total: 0 };
        try {
            const stored = JSON.parse(localStorage.getItem('glitchgarb_cart') || '{}');
            if (stored.items) cart = stored;
            else if (Array.isArray(stored)) cart.items = stored; // Handle old format
        } catch (parseError) {
            console.error('Failed to parse cart from localStorage:', parseError);
        }

        // Add new item
        const newItem = { ...item, id: Date.now() };
        cart.items.push(newItem);

        // Recalculate totals
        const subtotal = cart.items.reduce((sum, i) => {
            const price = parseFloat(i.price) || 0;
            const quantity = parseInt(i.quantity) || 1;
            return sum + (price * quantity);
        }, 0);

        cart.subtotal = Math.round(subtotal * 100) / 100;
        cart.shipping = cart.subtotal > 100 ? 0 : 9.99;
        cart.tax = Math.round(cart.subtotal * 0.08 * 100) / 100;
        cart.total = Math.round((cart.subtotal + cart.shipping + cart.tax) * 100) / 100;

        localStorage.setItem('glitchgarb_cart', JSON.stringify(cart));
        return { success: true, item: newItem };
    }

    async updateCartItem(itemId, updates) {
        const quantity = updates.quantity !== undefined ? updates.quantity : updates;
        const url = `/cart/${encodeURIComponent(itemId)}`;
        console.log('[updateCartItem]', { itemId, quantity, url, apiUrl: this.API_URL });
        try {
            const response = await this.apiRequest(url, {
                method: 'PUT',
                body: JSON.stringify({ quantity })
            });
            console.log('[updateCartItem] success:', response);
            return response;
        } catch (e) {
            console.warn('[updateCartItem] API failed:', e.message);
            try {
                const stored = localStorage.getItem('glitchgarb_cart');
                if (stored) {
                    const cart = JSON.parse(stored);
                    const items = cart.items || (Array.isArray(cart) ? cart : []);
                    const item = items.find(i => String(i.id) === String(itemId));
                    if (item) {
                        item.quantity = quantity;
                        localStorage.setItem('glitchgarb_cart', JSON.stringify(cart));
                        console.log('[updateCartItem] localStorage update OK');
                    } else {
                        console.warn('[updateCartItem] item not found in localStorage. Item IDs:', items.map(i => i.id));
                    }
                }
            } catch (e2) {
                console.error('[updateCartItem] localStorage fallback failed:', e2);
            }
            return { success: true };
        }
    }

    async removeFromCart(itemId) {
        try {
            const response = await this.apiRequest(`/cart/${itemId}`, {
                method: 'DELETE'
            });
            return response;
        } catch (e) {
            console.warn('API failed, using localStorage for removeFromCart');
            let cart = await this.getCart();
            cart.items = cart.items.filter(i => String(i.id) !== String(itemId));
            localStorage.setItem('glitchgarb_cart', JSON.stringify(cart));
            return { success: true };
        }
    }

    async clearCart() {
        try {
            const response = await this.apiRequest('/cart/', {
                method: 'DELETE'
            });
            return response;
        } catch (e) {
            console.warn('API failed, using localStorage for clearCart');
            localStorage.removeItem('glitchgarb_cart');
            return { success: true };
        }
    }

    getCartCount() {
        try {
            // First check if we have a cached cart from the last API call
            if (this._lastCart && this._lastCart.items) {
                return this._lastCart.items.reduce((sum, item) => sum + (item.quantity || 1), 0);
            }
            // Fallback to localStorage
            const stored = localStorage.getItem('glitchgarb_cart');
            if (!stored) return 0;
            const cart = JSON.parse(stored);
            const items = cart.items || (Array.isArray(cart) ? cart : []);
            if (!Array.isArray(items)) return 0;
            return items.reduce((sum, item) => sum + (item.quantity || 1), 0);
        } catch (e) {
            localStorage.removeItem('glitchgarb_cart');
            return 0;
        }
    }

    async getCartCountAsync() {
        try {
            const cart = await this.getCart();
            if (!cart || !cart.items) return 0;
            return cart.items.reduce((sum, item) => sum + (item.quantity || 1), 0);
        } catch (e) {
            return 0;
        }
    }

    async getCartTotal() {
        try {
            await this._waitForAPI();
            if (this.apiAvailable) {
                const response = await this.apiRequest('/cart/total');
                if (response.success) return response.total || 0;
            }

            const stored = localStorage.getItem('glitchgarb_cart');
            if (!stored) return 0;
            const cart = JSON.parse(stored);
            
            // If cart has total property, return it
            if (cart.total !== undefined) return cart.total;
            
            // Otherwise calculate from items
            const items = cart.items || (Array.isArray(cart) ? cart : []);
            if (!Array.isArray(items) || items.length === 0) return 0;
            
            return items.reduce((sum, item) => {
                const price = parseFloat(item.price) || 0;
                const quantity = parseInt(item.quantity) || 1;
                return sum + (price * quantity);
            }, 0);
        } catch (e) {
            console.error('getCartTotal failed:', e);
            return 0;
        }
    }

    async applyPromo(code) {
        try {
            const response = await this.apiRequest('/cart/promo', {
                method: 'POST',
                body: JSON.stringify({ code })
            });
            return response;
        } catch (e) {
            return { success: false, message: 'Promo code API not available' };
        }
    }

    // ============================================
    // ORDERS
    // ============================================

    async getOrders() {
        try {
            const response = await this.apiRequest('/orders/');
            if (response.orders) {
                // Keep local orders in sync
                response.orders.forEach(o => this._saveOrderLocally(o));
            }
            return response.orders || [];
        } catch (e) {
            console.warn('API failed, using localStorage for orders');
            return JSON.parse(localStorage.getItem('glitchgarb_orders') || '[]');
        }
    }

    async getOrder(orderId) {
        if (!orderId) return null;
        await this._waitForAPI();
        if (!this.apiAvailable) {
            try {
                const stored = localStorage.getItem('glitchgarb_orders');
                if (stored) {
                    const orders = JSON.parse(stored);
                    return orders.find(o => String(o.id) === String(orderId) || String(o.order_number) === String(orderId)) || null;
                }
            } catch (e2) {}
            return null;
        }
        try {
            const response = await this.apiRequest(`/orders/${orderId}`);
            if (response.order) {
                this._saveOrderLocally(response.order);
            }
            return response.order || null;
        } catch (e) {
            console.warn('Failed to get order via API:', e.message);
            try {
                const stored = localStorage.getItem('glitchgarb_orders');
                if (stored) {
                    const orders = JSON.parse(stored);
                    return orders.find(o => String(o.id) === String(orderId) || String(o.order_number) === String(orderId)) || null;
                }
            } catch (e2) {}
            return null;
        }
    }

    async createOrder(orderData) {
        await this._waitForAPI();
        try {
            const response = await this.apiRequest('/orders/', {
                method: 'POST',
                body: JSON.stringify(orderData)
            });
            if (response.success && response.order) {
                this._saveOrderLocally(response.order);
            }
            return response;
        } catch (e) {
            console.error('API createOrder failed, using local fallback:', e);
            const localOrder = this._createLocalOrder(orderData);
            return { success: true, order: localOrder, fallback: true };
        }
    }

    async createOrderFromCart(orderData) {
        await this._waitForAPI();
        try {
            const response = await this.apiRequest('/orders/cart', {
                method: 'POST',
                body: JSON.stringify(orderData)
            });
            if (response.success && response.order) {
                this._saveOrderLocally(response.order);
            }
            return response;
        } catch (e) {
            console.error('API createOrderFromCart failed, using local fallback:', e);
            const localOrder = this._createLocalOrder(orderData);
            return { success: true, order: localOrder, fallback: true };
        }
    }

    _createLocalOrder(orderData) {
        const localOrder = {
            id: orderData.id || 'local-' + Date.now(),
            order_number: orderData.order_number || 'GG-' + Date.now() + '-' + Math.floor(Math.random() * 1000),
            user_id: this.getCurrentUser()?.id || null,
            items: orderData.items || [],
            shipping_address: orderData.shipping_address || {},
            billing_address: orderData.billing_address || orderData.shipping_address || {},
            payment_method: orderData.payment_method || 'card',
            customer_info: orderData.customer_info || {},
            subtotal: parseFloat(orderData.subtotal) || 0,
            shipping: parseFloat(orderData.shipping) || 0,
            tax: parseFloat(orderData.tax) || 0,
            total: parseFloat(orderData.total) || 0,
            discount: parseFloat(orderData.discount) || 0,
            promo_code: orderData.promo_code || null,
            status: orderData.payment_reference ? 'confirmed' : 'pending',
            payment_status: orderData.payment_reference ? 'paid' : 'pending',
            payment_reference: orderData.payment_reference || null,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
        };
        this._saveOrderLocally(localOrder);
        return localOrder;
    }

    _saveOrderLocally(order) {
        if (!order) return;
        try {
            let localOrders = [];
            const stored = localStorage.getItem('glitchgarb_orders');
            if (stored) {
                localOrders = JSON.parse(stored);
            }
            // Avoid duplicate
            const index = localOrders.findIndex(o => o.id === order.id || o.order_number === order.order_number);
            if (index > -1) {
                localOrders[index] = order;
            } else {
                localOrders.push(order);
            }
            localStorage.setItem('glitchgarb_orders', JSON.stringify(localOrders));

            // Also save to gg_orders for compatibility
            let ggOrders = [];
            const storedGG = localStorage.getItem('gg_orders');
            if (storedGG) {
                ggOrders = JSON.parse(storedGG);
            }
            const indexGG = ggOrders.findIndex(o => o.id === order.id || o.order_number === order.order_number);
            if (indexGG > -1) {
                ggOrders[indexGG] = order;
            } else {
                ggOrders.push(order);
            }
            localStorage.setItem('gg_orders', JSON.stringify(ggOrders));
        } catch (e) {
            console.error('Failed to save order locally:', e);
        }
    }

    async updateOrderPayment(orderId, paymentReference) {
        const response = await this.apiRequest(`/orders/${orderId}/payment`, {
            method: 'PUT',
            body: JSON.stringify({ payment_reference: paymentReference })
        });
        return response;
    }

    async updateOrderStatus(orderNumber, status) {
        const response = await this.apiRequest(`/orders/${orderNumber}/status`, {
            method: 'PUT',
            body: JSON.stringify({ status })
        });
        return response;
    }

    async updateOrderTracking(orderNumber, trackingData) {
        const response = await this.apiRequest(`/orders/${orderNumber}/tracking`, {
            method: 'PUT',
            body: JSON.stringify(trackingData)
        });
        return response;
    }

    // ============================================
    // SETTINGS (Hero Slides, Next Drop)
    // ============================================

    async getHeroSlides() {
        await this._waitForAPI();
        if (this.apiAvailable) {
            try {
                const response = await this.apiRequest(`/settings/hero-slides/?t=${Date.now()}`);
                // Ensure we return a valid array
                if (Array.isArray(response.slides)) {
                    return response.slides;
                }
                console.warn('getHeroSlides: response.slides is not an array:', response.slides);
                return [];
            } catch (error) {
                console.warn('API getHeroSlides failed, falling back to local:', error.message);
            }
        }

        // Fallback to localStorage
        try {
            const stored = localStorage.getItem('glitchgarb_hero_slides');
            if (stored) {
                const slides = JSON.parse(stored);
                if (Array.isArray(slides)) {
                    return slides;
                }
            }
        } catch (e) {
            console.warn('parse error from localStorage:', e);
        }

        // Default slides
        return [
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
    }

    async updateHeroSlides(slides) {
        await this._waitForAPI();
        if (this.apiAvailable) {
            try {
                // Ensure slides is a valid array and filter out invalid entries
                const cleanSlides = Array.isArray(slides) 
                    ? slides.filter(s => s && typeof s === 'object' && !Array.isArray(s))
                    : [];
                
                console.log('Updating hero slides with payload:', JSON.stringify({ slides: cleanSlides }, null, 2));
                
                const response = await this.apiRequest('/settings/hero-slides/', {
                    method: 'PUT',
                    body: JSON.stringify({ slides: cleanSlides })
                });
                return { success: true };
            } catch (error) {
                console.error('API updateHeroSlides failed:', error.message);
                return { success: false, message: 'Server error: ' + error.message };
            }
        }

        // Fallback to localStorage (Offline mode)
        localStorage.setItem('glitchgarb_hero_slides', JSON.stringify(slides));
        return { success: true };
    }

    async getNextDrop() {
        await this._waitForAPI();
        if (this.apiAvailable) {
            try {
                const response = await this.apiRequest(`/settings/next-drop/?t=${Date.now()}`);
                return response.config;
            } catch (error) {
                console.warn('API getNextDrop failed, falling back to local:', error.message);
            }
        }

        // Fallback to localStorage
        return JSON.parse(localStorage.getItem('glitchgarb_next_drop') || 'null');
    }

    async updateNextDrop(config) {
        await this._waitForAPI();
        if (this.apiAvailable) {
            try {
                await this.apiRequest('/settings/next-drop/', {
                    method: 'PUT',
                    body: JSON.stringify(config)
                });
                return { success: true };
            } catch (error) {
                console.error('API updateNextDrop failed:', error.message);
                return { success: false, message: 'Server error: ' + error.message };
            }
        }

        // Fallback to localStorage (Offline mode)
        localStorage.setItem('glitchgarb_next_drop', JSON.stringify(config));
        return { success: true };
    }
}

// Create singleton instance
window.storageService = new HybridStorageService();

// Also expose as apiService for compatibility
window.apiService = window.storageService;



