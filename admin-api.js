/**
 * Admin API Service - Firebase Integration
 * Handles all admin operations with the Firebase backend
 */

class AdminAPIService {
    constructor() {
        // Auto-detect API URL based on environment
        this.baseURL = this.getApiBaseUrl();
        this.token = null;
        this.cacheDuration = 5 * 60 * 1000; // 5 minutes cache
    }

    /**
     * Get the API base URL based on environment
     */
    getApiBaseUrl() {
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
            return 'https://glitchgarb-backend.onrender.com/api';
        }

        // Local development
        return 'http://localhost:5000/api';
    }

    // Set the authentication token
    setToken(token) {
        this.token = token;
        if (token) {
            localStorage.setItem('admin_token', token);
        } else {
            localStorage.removeItem('admin_token');
        }
    }

    // Get stored token
    getStoredToken() {
        return localStorage.getItem('admin_token');
    }

    // Check if admin is authenticated
    isAuthenticated() {
        return !!this.getStoredToken();
    }

    // Cache helper functions
    getCachedData(key) {
        const cached = localStorage.getItem(key);
        if (cached) {
            const { data, timestamp } = JSON.parse(cached);
            if (Date.now() - timestamp < this.cacheDuration) {
                return data;
            }
        }
        return null;
    }

    setCachedData(key, data) {
        localStorage.setItem(key, JSON.stringify({
            data,
            timestamp: Date.now()
        }));
    }

    clearCache(key = null) {
        if (key) {
            localStorage.removeItem(key);
        } else {
            // Clear all admin cache
            localStorage.removeItem('admin_products_cache');
            localStorage.removeItem('admin_orders_cache');
            localStorage.removeItem('admin_users_cache');
        }
    }

    // Helper method for API requests
    async request(endpoint, options = {}) {
        const url = `${this.baseURL}${endpoint}`;
        const token = this.getStoredToken();

        const headers = {
            'Content-Type': 'application/json',
            ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
            ...options.headers
        };

        try {
            const response = await fetch(url, {
                ...options,
                headers
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.message || 'API request failed');
            }

            return data;
        } catch (error) {
            console.error('API Error:', error);
            throw error;
        }
    }

    // ============ AUTH ============

    // Login admin
    async login(email, password) {
        const data = await this.request('/auth/login', {
            method: 'POST',
            body: JSON.stringify({ email, password })
        });

        if (data.success && data.user && data.user.isAdmin) {
            return data;
        } else {
            throw new Error('Access denied. Admin privileges required.');
        }
    }

    // Verify token and get current user
    async getCurrentUser() {
        return await this.request('/auth/me');
    }

    // Verify Firebase ID token
    async verifyToken(idToken) {
        return await this.request('/auth/verify-token', {
            method: 'POST',
            body: JSON.stringify({ idToken })
        });
    }

    // ============ USERS ============

    // Get all users
    async getUsers() {
        const cacheKey = 'admin_users_cache';
        const cached = this.getCachedData(cacheKey);
        if (cached) {
            console.log('Using cached users');
            return cached;
        }

        const result = await this.request('/auth/users');
        this.setCachedData(cacheKey, result);
        return result;
    }

    // Get single user
    async getUser(userId) {
        return await this.request(`/auth/users/${userId}`);
    }

    // Update user
    async updateUser(userId, userData) {
        this.clearCache('admin_users_cache');
        return await this.request(`/auth/users/${userId}`, {
            method: 'PUT',
            body: JSON.stringify(userData)
        });
    }

    // Toggle user VIP status
    async toggleUserVIP(userId) {
        this.clearCache('admin_users_cache');
        return await this.request(`/auth/users/${userId}/vip`, {
            method: 'POST'
        });
    }

    // ============ PRODUCTS ============

    // Get all products
    async getProducts(filters = {}) {
        const cacheKey = 'admin_products_cache';
        const cached = this.getCachedData(cacheKey);
        if (cached) {
            console.log('Using cached products');
            return cached;
        }

        const params = new URLSearchParams(filters).toString();
        const endpoint = params ? `/products?${params}` : '/products';
        const result = await this.request(endpoint);

        // Cache the results
        this.setCachedData(cacheKey, result);
        return result;
    }

    // Get single product
    async getProduct(productId) {
        return await this.request(`/products/${productId}`);
    }

    // Create product
    async createProduct(productData) {
        this.clearCache('admin_products_cache');
        return await this.request('/products', {
            method: 'POST',
            body: JSON.stringify(productData)
        });
    }

    // Update product
    async updateProduct(productId, productData) {
        this.clearCache('admin_products_cache');
        return await this.request(`/products/${productId}`, {
            method: 'PUT',
            body: JSON.stringify(productData)
        });
    }

    // Delete product
    async deleteProduct(productId) {
        this.clearCache('admin_products_cache');
        return await this.request(`/products/${productId}`, {
            method: 'DELETE'
        });
    }

    // ============ ORDERS ============

    // Get all orders
    async getOrders(filters = {}) {
        const cacheKey = 'admin_orders_cache';
        const cached = this.getCachedData(cacheKey);
        if (cached) {
            console.log('Using cached orders');
            return cached;
        }

        const params = new URLSearchParams(filters).toString();
        const endpoint = params ? `/orders?${params}` : '/orders';
        const result = await this.request(endpoint);

        // Cache the results
        this.setCachedData(cacheKey, result);
        return result;
    }

    // Get single order
    async getOrder(orderId) {
        return await this.request(`/orders/${orderId}`);
    }

    // Update order status
    async updateOrderStatus(orderId, status) {
        this.clearCache('admin_orders_cache');
        return await this.request(`/orders/${orderId}/status`, {
            method: 'PUT',
            body: JSON.stringify({ status })
        });
    }

    // Get orders by user
    async getOrdersByUser(userId) {
        return await this.request(`/orders/user/${userId}`);
    }

    // ============ STATS ============

    // Get dashboard stats
    async getStats() {
        const [users, products, orders] = await Promise.all([
            this.getUsers(),
            this.getProducts(),
            this.getOrders()
        ]);

        const totalRevenue = orders.orders?.reduce((sum, order) => sum + (order.total || 0), 0) || 0;

        return {
            totalUsers: users.count || 0,
            totalProducts: products.count || 0,
            totalOrders: orders.count || 0,
            totalRevenue
        };
    }
}

// Create singleton instance
const adminAPI = new AdminAPIService();
