/**
 * StorageService handles all data persistence using LocalStorage.
 * This simulates a backend for the GlitchGarb platform.
 */
class StorageService {
    constructor() {
        this.USERS_KEY = 'gg_users';
        this.CURRENT_USER_KEY = 'gg_current_user';
        this.PRODUCTS_KEY = 'gg_products';
        this.ORDERS_KEY = 'gg_orders';
        this.CART_KEY = 'gg_cart';
        this.init();
    }

    init() {
        // Initialize users
        if (!localStorage.getItem(this.USERS_KEY)) {
            localStorage.setItem(this.USERS_KEY, JSON.stringify([]));
        }

        // Check if admin user exists, create if not
        const users = this.getUsers();
        const adminExists = users.some(user => user.email === 'admin@glitchgarb.com');
        if (!adminExists) {
            const adminUser = {
                id: 'admin-' + Date.now().toString(),
                name: 'Admin User',
                email: 'admin@glitchgarb.com',
                password: 'admin123',
                isAdmin: true,
                isVIP: true,
                purchaseHistory: [],
                createdAt: new Date().toISOString()
            };
            users.push(adminUser);
            localStorage.setItem(this.USERS_KEY, JSON.stringify(users));
        }

        // Only seed products if none exist
        const existingProducts = localStorage.getItem(this.PRODUCTS_KEY);
        if (!existingProducts) {
            this.seedProducts();
        }
    }

    seedProducts() {
        // Initial product catalog - All products are now available to everyone
        const products = [
            {
                id: 'p1',
                name: 'Urban Utility Cargo',
                price: 450.00,
                image: 'https://images.unsplash.com/photo-1578587018452-892bacefd3f2?auto=format&fit=crop&q=80&w=300',
                releaseDate: new Date().toISOString(), // Live now
                stock: 25,
                isExclusive: false,
                category: 'pants',
                description: 'Heavyweight cargo trousers with reinforced knee panels and utility straps. Built for urban exploration.',
                sizes: ['S', 'M', 'L', 'XL']
            },
            {
                id: 'p2',
                name: 'Glitch Oversized Tee',
                price: 250.00,
                image: 'https://images.unsplash.com/photo-1554568218-0f1715e72254?auto=format&fit=crop&q=80&w=300',
                releaseDate: new Date().toISOString(), // Live now
                stock: 5,
                isExclusive: false,
                category: 'tshirt',
                description: 'Signature oversized fit with 3D glitch embroidered logo. 300GSM premium cotton.',
                sizes: ['M', 'L', 'XL']
            },
            {
                id: 'p3',
                name: 'Cyberpunk Hoodie',
                price: 550.00,
                image: 'https://images.unsplash.com/photo-1521572267360-ee0c2909d518?auto=format&fit=crop&q=80&w=300',
                releaseDate: new Date().toISOString(), // Live now
                stock: 15,
                isExclusive: false,
                category: 'hoodie',
                description: 'Futuristic hoodie with cyberpunk-inspired design. Premium comfort fit.',
                sizes: ['S', 'M', 'L', 'XL']
            },
            {
                id: 'p4',
                name: 'Distressed Denim Jacket',
                price: 750.00,
                image: 'https://images.unsplash.com/photo-1556821840-3a63f95609a7?auto=format&fit=crop&q=80&w=300',
                releaseDate: new Date().toISOString(), // Live now
                stock: 10,
                isExclusive: false,
                category: 'jacket',
                description: 'Vintage-wash denim jacket with distressed details. Classic streetwear essential.',
                sizes: ['S', 'M', 'L', 'XL']
            },
            {
                id: 'p5',
                name: 'Street Logo Cap',
                price: 150.00,
                image: 'https://images.unsplash.com/photo-1588850561407-ed78c282e89b?auto=format&fit=crop&q=80&w=300',
                releaseDate: new Date().toISOString(),
                stock: 30,
                isExclusive: false,
                category: 'cap',
                description: 'Adjustable snapback with embroidered logo. One size fits all.',
                sizes: ['One Size']
            },
            {
                id: 'p6',
                name: 'Tech Shorts',
                price: 320.00,
                image: 'https://images.unsplash.com/photo-1591195853828-11db59a44f6b?auto=format&fit=crop&q=80&w=300',
                releaseDate: new Date().toISOString(),
                stock: 20,
                isExclusive: false,
                category: 'shorts',
                description: 'Lightweight technical shorts with hidden pockets. Perfect for summer.',
                sizes: ['S', 'M', 'L', 'XL']
            }
        ];
        localStorage.setItem(this.PRODUCTS_KEY, JSON.stringify(products));
    }

    getProducts() {
        return JSON.parse(localStorage.getItem(this.PRODUCTS_KEY)) || [];
    }

    getProduct(id) {
        return this.getProducts().find(p => p.id === id);
    }

    createOrder(orderData) {
        const user = this.getCurrentUser();
        // Allow guest checkout - user can be null

        const products = this.getProducts();
        const productIndex = products.findIndex(p => p.id === orderData.productId);

        if (productIndex === -1 || products[productIndex].stock <= 0) {
            return { success: false, message: 'Product is no longer available' };
        }

        // 1. Decrement Stock
        products[productIndex].stock -= 1;
        localStorage.setItem(this.PRODUCTS_KEY, JSON.stringify(products));

        // 2. Create Order
        const newOrder = {
            id: `ORD-${Date.now()}`,
            userId: user ? user.id : 'guest',
            isGuestOrder: !user,
            guestEmail: orderData.shipping ? orderData.shipping.email : null,
            productId: orderData.productId,
            productName: products[productIndex].name,
            productImage: products[productIndex].image,
            price: products[productIndex].price,
            size: orderData.size,
            color: orderData.color || null,
            shipping: orderData.shipping,
            paymentMethod: orderData.paymentMethod,
            paymentReference: orderData.paymentReference || null,
            timestamp: new Date().toISOString(),
            status: 'Secured'
        };

        const orders = JSON.parse(localStorage.getItem(this.ORDERS_KEY)) || [];
        orders.push(newOrder);
        localStorage.setItem(this.ORDERS_KEY, JSON.stringify(orders));

        // 3. Update User History (only if logged in)
        if (user) {
            this.updateUser({
                purchaseHistory: [...(user.purchaseHistory || []), newOrder.id]
            });
        }

        return { success: true, order: newOrder };
    }

    getOrders() {
        return JSON.parse(localStorage.getItem(this.ORDERS_KEY)) || [];
    }

    getUserOrders(userId) {
        return this.getOrders().filter(o => o.userId === userId);
    }

    upgradeToVIP() {
        const user = this.getCurrentUser();
        if (!user) return { success: false, message: 'Login required' };

        const updated = this.updateUser({ isVIP: true });
        return { success: true, user: updated };
    }

    toggleWatchlist(productId) {
        const user = this.getCurrentUser();
        if (!user) return { success: false, message: 'Login required' };

        const watchlist = user.watchlist || [];
        const index = watchlist.indexOf(productId);

        let newWatchlist;
        if (index > -1) {
            newWatchlist = watchlist.filter(id => id !== productId);
        } else {
            newWatchlist = [...watchlist, productId];
        }

        this.updateUser({ watchlist: newWatchlist });
        return { success: true, watching: index === -1 };
    }

    purchaseProduct(productId) {
        const products = this.getProducts();
        const productIndex = products.findIndex(p => p.id === productId);

        if (productIndex !== -1 && products[productIndex].stock > 0) {
            products[productIndex].stock -= 1;
            localStorage.setItem(this.PRODUCTS_KEY, JSON.stringify(products));
            return { success: true, product: products[productIndex] };
        }
        return { success: false, message: 'Product unavailable or sold out' };
    }

    addProduct(productData) {
        const products = this.getProducts();
        const newProduct = {
            id: `p-${Date.now()}`,
            ...productData,
            releaseDate: productData.releaseDate || new Date().toISOString(),
            stock: parseInt(productData.stock) || 0,
            isExclusive: productData.isExclusive || false
        };
        products.push(newProduct);
        localStorage.setItem(this.PRODUCTS_KEY, JSON.stringify(products));
        return { success: true, product: newProduct };
    }

    updateProduct(id, updatedData) {
        const products = this.getProducts();
        const index = products.findIndex(p => p.id === id);
        if (index === -1) return { success: false, message: 'Product not found' };

        products[index] = { ...products[index], ...updatedData };
        localStorage.setItem(this.PRODUCTS_KEY, JSON.stringify(products));
        return { success: true, product: products[index] };
    }

    deleteProduct(id) {
        const products = this.getProducts();
        const filtered = products.filter(p => p.id !== id);
        localStorage.setItem(this.PRODUCTS_KEY, JSON.stringify(filtered));
        return { success: true };
    }

    updateOrderStatus(orderId, status) {
        const orders = this.getOrders();
        const index = orders.findIndex(o => o.id === orderId);
        if (index === -1) return { success: false, message: 'Order not found' };

        orders[index].status = status;
        localStorage.setItem(this.ORDERS_KEY, JSON.stringify(orders));
        return { success: true, order: orders[index] };
    }

    getUsers() {
        return JSON.parse(localStorage.getItem(this.USERS_KEY)) || [];
    }

    registerUser(userData) {
        const users = this.getUsers();
        if (users.find(u => u.email === userData.email)) {
            return { success: false, message: 'User already exists' };
        }

        const newUser = {
            id: Date.now().toString(),
            name: userData.name,
            email: userData.email,
            password: userData.password,
            isAdmin: false,
            isVIP: false,
            purchaseHistory: [],
            createdAt: new Date().toISOString()
        };

        users.push(newUser);
        localStorage.setItem(this.USERS_KEY, JSON.stringify(users));
        return { success: true, user: newUser };
    }

    loginUser(email, password) {
        const users = this.getUsers();
        const user = users.find(u => u.email === email && u.password === password);

        if (user) {
            const sessionUser = { ...user };
            delete sessionUser.password;
            localStorage.setItem(this.CURRENT_USER_KEY, JSON.stringify(sessionUser));
            return { success: true, user: sessionUser };
        }

        return { success: false, message: 'Invalid email or password' };
    }

    getCurrentUser() {
        return JSON.parse(localStorage.getItem(this.CURRENT_USER_KEY));
    }

    logout() {
        localStorage.removeItem(this.CURRENT_USER_KEY);
        window.location.href = 'index.html';
    }

    updateUser(updatedData) {
        const currentUser = this.getCurrentUser();
        if (!currentUser) return;

        const users = this.getUsers();
        const index = users.findIndex(u => u.email === currentUser.email);

        if (index !== -1) {
            users[index] = { ...users[index], ...updatedData };
            localStorage.setItem(this.USERS_KEY, JSON.stringify(users));

            // Update session storage too
            const sessionUser = { ...users[index] };
            delete sessionUser.password;
            localStorage.setItem(this.CURRENT_USER_KEY, JSON.stringify(sessionUser));
        }
    }

    // ============================================
    // CART METHODS
    // ============================================

    getCart() {
        const cart = JSON.parse(localStorage.getItem(this.CART_KEY)) || [];
        return cart;
    }

    addToCart(item) {
        const cart = this.getCart();
        const product = this.getProduct(item.productId);

        if (!product) {
            return { success: false, message: 'Product not found' };
        }

        if (product.stock <= 0) {
            return { success: false, message: 'Product is sold out' };
        }

        // Check if item already exists in cart with same size and color
        const existingIndex = cart.findIndex(
            c => c.productId === item.productId &&
                c.size === item.size &&
                c.color === item.color
        );

        if (existingIndex > -1) {
            // Update quantity
            cart[existingIndex].quantity += item.quantity || 1;
        } else {
            // Add new item
            cart.push({
                id: `cart-${Date.now()}`,
                productId: item.productId,
                productName: product.name,
                productImage: product.image,
                price: product.price,
                size: item.size,
                color: item.color || 'Black',
                quantity: item.quantity || 1,
                addedAt: new Date().toISOString()
            });
        }

        localStorage.setItem(this.CART_KEY, JSON.stringify(cart));
        return { success: true, cart: cart };
    }

    updateCartItem(cartItemId, updates) {
        const cart = this.getCart();
        const index = cart.findIndex(item => item.id === cartItemId);

        if (index === -1) {
            return { success: false, message: 'Cart item not found' };
        }

        cart[index] = { ...cart[index], ...updates };
        localStorage.setItem(this.CART_KEY, JSON.stringify(cart));
        return { success: true, cart: cart };
    }

    removeFromCart(cartItemId) {
        const cart = this.getCart();
        const filtered = cart.filter(item => item.id !== cartItemId);
        localStorage.setItem(this.CART_KEY, JSON.stringify(filtered));
        return { success: true, cart: filtered };
    }

    clearCart() {
        localStorage.removeItem(this.CART_KEY);
        return { success: true };
    }

    getCartTotal() {
        const cart = this.getCart();
        return cart.reduce((total, item) => total + (item.price * item.quantity), 0);
    }

    getCartCount() {
        const cart = this.getCart();
        return cart.reduce((count, item) => count + item.quantity, 0);
    }

    // Create order from cart
    createOrderFromCart(orderData) {
        const user = this.getCurrentUser();
        // Allow guest checkout - user can be null

        const cart = this.getCart();
        if (cart.length === 0) {
            return { success: false, message: 'Cart is empty' };
        }

        const products = this.getProducts();
        const orders = this.getOrders();
        const newOrders = [];

        // Check stock and create orders for each cart item
        for (const cartItem of cart) {
            const productIndex = products.findIndex(p => p.id === cartItem.productId);

            if (productIndex === -1 || products[productIndex].stock < cartItem.quantity) {
                return { success: false, message: `${cartItem.productName} is no longer available in requested quantity` };
            }

            // Decrement stock
            products[productIndex].stock -= cartItem.quantity;

            // Create order
            const newOrder = {
                id: `ORD-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                userId: user ? user.id : 'guest',
                isGuestOrder: !user,
                guestEmail: orderData.shipping ? orderData.shipping.email : null,
                productId: cartItem.productId,
                productName: cartItem.productName,
                productImage: cartItem.productImage,
                price: cartItem.price,
                quantity: cartItem.quantity,
                size: cartItem.size,
                color: cartItem.color,
                shipping: orderData.shipping,
                paymentMethod: orderData.paymentMethod,
                paymentReference: orderData.paymentReference || null,
                timestamp: new Date().toISOString(),
                status: 'Secured'
            };

            orders.push(newOrder);
            newOrders.push(newOrder);
        }

        // Save updated products and orders
        localStorage.setItem(this.PRODUCTS_KEY, JSON.stringify(products));
        localStorage.setItem(this.ORDERS_KEY, JSON.stringify(orders));

        // Update user history (only if logged in)
        if (user) {
            this.updateUser({
                purchaseHistory: [...(user.purchaseHistory || []), ...newOrders.map(o => o.id)]
            });
        }

        // Clear cart
        this.clearCart();

        return { success: true, orders: newOrders };
    }
}

window.storageService = new StorageService();
