/**
 * GlitchGarb Backend Server
 * Express.js + Firebase API
 */

require('dotenv').config();

const express = require('express');
const cors = require('cors');

// Import Firebase configuration
const { admin, auth, db } = require('./config/firebase');

// Import routes
const authRoutes = require('./routes/auth-firebase');
const productRoutes = require('./routes/products-firebase');
const orderRoutes = require('./routes/orders-firebase');
const cartRoutes = require('./routes/cart-firebase');

// Initialize express app
const app = express();

// Middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// CORS Configuration - Allow all origins for development
app.use(cors({
    origin: '*',
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/products', productRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/cart', cartRoutes);

// Health check endpoint
app.get('/api/health', async (req, res) => {
    res.status(200).json({
        success: true,
        message: 'GlitchGarb API is running',
        database: 'Firebase Firestore',
        timestamp: new Date().toISOString()
    });
});

// API info endpoint
app.get('/api', (req, res) => {
    res.status(200).json({
        success: true,
        name: 'GlitchGarb API',
        version: '2.0.0',
        database: 'Firebase Firestore',
        endpoints: {
            auth: {
                signup: 'POST /api/auth/signup',
                login: 'POST /api/auth/login',
                logout: 'POST /api/auth/logout',
                me: 'GET /api/auth/me',
                updateProfile: 'PUT /api/auth/me',
                updatePassword: 'PUT /api/auth/password',
                upgradeVIP: 'POST /api/auth/vip',
                getUsers: 'GET /api/auth/users (admin)'
            },
            products: {
                getAll: 'GET /api/products',
                getLive: 'GET /api/products/live',
                getUpcoming: 'GET /api/products/upcoming',
                getOne: 'GET /api/products/:id',
                create: 'POST /api/products (admin)',
                update: 'PUT /api/products/:id (admin)',
                delete: 'DELETE /api/products/:id (admin)',
                updateStock: 'PUT /api/products/:id/stock (admin)'
            },
            orders: {
                create: 'POST /api/orders',
                createFromCart: 'POST /api/orders/cart',
                getAll: 'GET /api/orders',
                getOne: 'GET /api/orders/:orderNumber',
                updateStatus: 'PUT /api/orders/:orderNumber/status (admin)',
                addTracking: 'PUT /api/orders/:orderNumber/tracking (admin)',
                getGuestOrders: 'GET /api/orders/guest/:email'
            },
            cart: {
                get: 'GET /api/cart',
                addItem: 'POST /api/cart',
                updateItem: 'PUT /api/cart/:itemId',
                removeItem: 'DELETE /api/cart/:itemId',
                clear: 'DELETE /api/cart',
                count: 'GET /api/cart/count',
                total: 'GET /api/cart/total'
            }
        }
    });
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error('Server Error:', err.stack);

    res.status(err.status || 500).json({
        success: false,
        message: err.message || 'Internal Server Error',
        ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
    });
});

// Handle 404
app.use((req, res) => {
    res.status(404).json({
        success: false,
        message: 'Route not found'
    });
});

// Start server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`
    ╔═══════════════════════════════════════════════════════════╗
    ║                                                           ║
    ║   🚀 GlitchGarb API Server Started!                       ║
    ║                                                           ║
    ║   Port: ${PORT}                                              ║
    ║   Environment: ${process.env.NODE_ENV || 'development'}                           ║
    ║   Database: Firebase Firestore                             ║
    ║   API: http://localhost:${PORT}/api                          ║
    ║                                                           ║
    ╚═══════════════════════════════════════════════════════════╝
    `);
});

module.exports = app;
