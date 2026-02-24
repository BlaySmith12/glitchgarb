/**
 * Firebase Configuration for GlitchGarb Frontend
 * Provides Firebase services for real-time features and authentication
 */

// Firebase Configuration
const firebaseConfig = {
    apiKey: "AIzaSyDlrdpzWxXSKXgFZO3uDOn21lLj5rLOO3w",
    authDomain: "glitchgarb-ed70d.firebaseapp.com",
    databaseURL: "https://glitchgarb-ed70d-default-rtdb.firebaseio.com",
    projectId: "glitchgarb-ed70d",
    storageBucket: "glitchgarb-ed70d.firebasestorage.app",
    messagingSenderId: "90688042387",
    appId: "1:90688042387:web:ed5d6717c602382a7c6466",
    measurementId: "G-CMCC5R0CDN"
};

// Firebase Services Class
class FirebaseService {
    constructor() {
        this.app = null;
        this.auth = null;
        this.db = null;
        this.initialized = false;
        this.currentUser = null;
        this.authStateListeners = [];
    }

    /**
     * Initialize Firebase
     */
    async init() {
        if (this.initialized) return;

        try {
            // Load Firebase from CDN if not already loaded
            if (typeof firebase === 'undefined') {
                await this.loadFirebaseSDK();
            }

            // Initialize Firebase
            if (!firebase.apps.length) {
                this.app = firebase.initializeApp(firebaseConfig);
            } else {
                this.app = firebase.app();
            }

            this.auth = firebase.auth();
            this.db = firebase.firestore();

            // Enable persistence for offline support
            try {
                await this.db.enablePersistence({ synchronizeTabs: true });
                console.log('✅ Firebase persistence enabled');
            } catch (err) {
                console.warn('⚠️ Firebase persistence not available:', err.message);
            }

            // Listen for auth state changes
            this.auth.onAuthStateChanged((user) => {
                this.currentUser = user;
                this.notifyAuthStateListeners(user);
            });

            this.initialized = true;
            console.log('✅ Firebase initialized successfully');

        } catch (error) {
            console.error('❌ Firebase initialization failed:', error);
        }
    }

    /**
     * Load Firebase SDK from CDN
     */
    async loadFirebaseSDK() {
        return new Promise((resolve, reject) => {
            // Check if already loaded
            if (typeof firebase !== 'undefined') {
                resolve();
                return;
            }

            // Load Firebase App
            const appScript = document.createElement('script');
            appScript.src = 'https://www.gstatic.com/firebasejs/9.22.0/firebase-app-compat.js';
            appScript.async = true;

            // Load Firebase Auth
            const authScript = document.createElement('script');
            authScript.src = 'https://www.gstatic.com/firebasejs/9.22.0/firebase-auth-compat.js';
            authScript.async = true;

            // Load Firebase Firestore
            const firestoreScript = document.createElement('script');
            firestoreScript.src = 'https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore-compat.js';
            firestoreScript.async = true;

            let loaded = 0;
            const checkLoaded = () => {
                loaded++;
                if (loaded === 3) {
                    resolve();
                }
            };

            appScript.onload = checkLoaded;
            authScript.onload = checkLoaded;
            firestoreScript.onload = checkLoaded;

            appScript.onerror = reject;
            authScript.onerror = reject;
            firestoreScript.onerror = reject;

            document.head.appendChild(appScript);
            document.head.appendChild(authScript);
            document.head.appendChild(firestoreScript);
        });
    }

    // ============================================
    // AUTHENTICATION METHODS
    // ============================================

    /**
     * Sign up with email and password
     */
    async signUp(email, password, name) {
        await this.init();

        try {
            const userCredential = await this.auth.createUserWithEmailAndPassword(email, password);

            // Update display name
            await userCredential.user.updateProfile({ displayName: name });

            // Create user document in Firestore
            await this.db.collection('users').doc(userCredential.user.uid).set({
                name: name,
                email: email.toLowerCase(),
                isAdmin: false,
                isVIP: false,
                purchaseHistory: [],
                watchlist: [],
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            });

            return {
                success: true,
                user: userCredential.user
            };
        } catch (error) {
            console.error('Sign up error:', error);
            console.error('Error code:', error.code);
            console.error('Error message:', error.message);
            return {
                success: false,
                error: this.getFriendlyErrorMessage(error.code),
                errorCode: error.code
            };
        }
    }

    /**
     * Sign in with email and password
     */
    async signIn(email, password) {
        await this.init();

        try {
            const userCredential = await this.auth.signInWithEmailAndPassword(email, password);

            return {
                success: true,
                user: userCredential.user
            };
        } catch (error) {
            console.error('Sign in error:', error);
            return {
                success: false,
                error: this.getFriendlyErrorMessage(error.code)
            };
        }
    }

    /**
     * Sign out
     */
    async signOut() {
        await this.init();

        try {
            await this.auth.signOut();
            return { success: true };
        } catch (error) {
            console.error('Sign out error:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Send password reset email
     */
    async sendPasswordReset(email) {
        await this.init();

        try {
            await this.auth.sendPasswordResetEmail(email);
            return { success: true };
        } catch (error) {
            console.error('Password reset error:', error);
            return {
                success: false,
                error: this.getFriendlyErrorMessage(error.code)
            };
        }
    }

    /**
     * Get current user
     */
    getCurrentUser() {
        return this.currentUser;
    }

    /**
     * Get ID token for API calls
     */
    async getIdToken() {
        if (!this.currentUser) return null;
        return await this.currentUser.getIdToken();
    }

    /**
     * Subscribe to auth state changes
     */
    onAuthStateChanged(callback) {
        this.authStateListeners.push(callback);
        // Immediately call with current state
        if (this.initialized) {
            callback(this.currentUser);
        }
    }

    /**
     * Notify all auth state listeners
     */
    notifyAuthStateListeners(user) {
        this.authStateListeners.forEach(callback => callback(user));
    }

    /**
     * Convert Firebase error codes to friendly messages
     */
    getFriendlyErrorMessage(errorCode) {
        const errorMessages = {
            'auth/email-already-in-use': 'This email is already registered. Please sign in instead.',
            'auth/invalid-email': 'Please enter a valid email address.',
            'auth/operation-not-allowed': 'Email/password authentication is not enabled. Please contact support.',
            'auth/weak-password': 'Password should be at least 6 characters.',
            'auth/user-disabled': 'This account has been disabled.',
            'auth/user-not-found': 'No account found with this email.',
            'auth/wrong-password': 'Incorrect password. Please try again.',
            'auth/invalid-credential': 'Invalid email or password.',
            'auth/too-many-requests': 'Too many failed attempts. Please try again later.',
            'auth/network-request-failed': 'Network error. Please check your connection.',
            'auth/unauthorized-domain': 'This domain is not authorized for Firebase authentication.',
            'auth/popup-blocked': 'Sign-in popup was blocked. Please allow popups for this site.',
            'auth/popup-closed-by-user': 'Sign-in was cancelled. Please try again.',
            'auth/account-exists-with-different-credential': 'An account already exists with this email using a different sign-in method.'
        };
        return errorMessages[errorCode] || `Authentication error: ${errorCode || 'Unknown error'}`;
    }

    // ============================================
    // FIRESTORE METHODS
    // ============================================

    /**
     * Get all products (real-time)
     */
    subscribeToProducts(callback) {
        this.init();

        return this.db.collection('products')
            .onSnapshot((snapshot) => {
                const products = [];
                snapshot.forEach(doc => {
                    products.push({ id: doc.id, ...doc.data() });
                });
                callback(products);
            }, (error) => {
                console.error('Products subscription error:', error);
            });
    }

    /**
     * Get live products (real-time)
     */
    subscribeToLiveProducts(callback) {
        this.init();

        return this.db.collection('products')
            .where('status', '==', 'live')
            .onSnapshot((snapshot) => {
                const products = [];
                snapshot.forEach(doc => {
                    products.push({ id: doc.id, ...doc.data() });
                });
                callback(products);
            });
    }

    /**
     * Get single product by ID
     */
    async getProduct(productId) {
        await this.init();

        const doc = await this.db.collection('products').doc(productId).get();

        if (!doc.exists) {
            return null;
        }

        return { id: doc.id, ...doc.data() };
    }

    /**
     * Subscribe to user's cart
     */
    subscribeToCart(userId, callback) {
        this.init();

        return this.db.collection('carts').doc(userId)
            .onSnapshot((doc) => {
                if (doc.exists) {
                    callback(doc.data());
                } else {
                    callback({ items: [], subtotal: 0, total: 0 });
                }
            });
    }

    /**
     * Subscribe to user's orders
     */
    subscribeToOrders(userId, callback) {
        this.init();

        return this.db.collection('orders')
            .where('userId', '==', userId)
            .orderBy('createdAt', 'desc')
            .onSnapshot((snapshot) => {
                const orders = [];
                snapshot.forEach(doc => {
                    orders.push({ id: doc.id, ...doc.data() });
                });
                callback(orders);
            });
    }

    /**
     * Add item to cart
     */
    async addToCart(userId, item) {
        await this.init();

        const cartRef = this.db.collection('carts').doc(userId);
        const cartDoc = await cartRef.get();

        if (!cartDoc.exists) {
            // Create new cart
            await cartRef.set({
                items: [{
                    id: `${item.productId}-${item.size || 'default'}-${item.color || 'default'}`,
                    ...item,
                    addedAt: new Date().toISOString()
                }],
                subtotal: item.price * (item.quantity || 1),
                shipping: 0,
                tax: 0,
                total: item.price * (item.quantity || 1),
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            });
        } else {
            // Update existing cart
            const cartData = cartDoc.data();
            const existingIndex = cartData.items.findIndex(
                i => i.productId === item.productId && i.size === item.size && i.color === item.color
            );

            if (existingIndex > -1) {
                cartData.items[existingIndex].quantity += item.quantity || 1;
            } else {
                cartData.items.push({
                    id: `${item.productId}-${item.size || 'default'}-${item.color || 'default'}`,
                    ...item,
                    addedAt: new Date().toISOString()
                });
            }

            // Recalculate totals
            cartData.subtotal = cartData.items.reduce((sum, i) => sum + (i.price * i.quantity), 0);
            cartData.shipping = cartData.subtotal > 100 ? 0 : 9.99;
            cartData.tax = cartData.subtotal * 0.08;
            cartData.total = cartData.subtotal + cartData.shipping + cartData.tax;
            cartData.updatedAt = firebase.firestore.FieldValue.serverTimestamp();

            await cartRef.update(cartData);
        }

        return { success: true };
    }

    /**
     * Remove item from cart
     */
    async removeFromCart(userId, itemId) {
        await this.init();

        const cartRef = this.db.collection('carts').doc(userId);
        const cartDoc = await cartRef.get();

        if (cartDoc.exists) {
            const cartData = cartDoc.data();
            cartData.items = cartData.items.filter(i => i.id !== itemId);

            // Recalculate totals
            cartData.subtotal = cartData.items.reduce((sum, i) => sum + (i.price * i.quantity), 0);
            cartData.shipping = cartData.subtotal > 100 ? 0 : 9.99;
            cartData.tax = cartData.subtotal * 0.08;
            cartData.total = cartData.subtotal + cartData.shipping + cartData.tax;
            cartData.updatedAt = firebase.firestore.FieldValue.serverTimestamp();

            await cartRef.update(cartData);
        }

        return { success: true };
    }

    /**
     * Clear cart
     */
    async clearCart(userId) {
        await this.init();

        await this.db.collection('carts').doc(userId).delete();
        return { success: true };
    }
}

// Create singleton instance
const firebaseService = new FirebaseService();

// Export for use in other files
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { FirebaseService, firebaseService, firebaseConfig };
}
