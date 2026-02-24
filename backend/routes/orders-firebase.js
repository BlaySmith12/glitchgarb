/**
 * Order Routes - Firebase Version
 * Handles order operations with Firestore
 */

const express = require('express');
const router = express.Router();
const { db, FieldValue } = require('../config/firebase');
const { protect, adminOnly } = require('../middleware/auth-firebase');

/**
 * Generate unique order number
 */
const generateOrderNumber = () => {
    const timestamp = Date.now().toString(36).toUpperCase();
    const random = Math.random().toString(36).substring(2, 6).toUpperCase();
    return `GG-${timestamp}-${random}`;
};

/**
 * @route   POST /api/orders
 * @desc    Create new order
 * @access  Public (guest) or Private (authenticated)
 */
router.post('/', async (req, res) => {
    try {
        const {
            items,
            shippingAddress,
            billingAddress,
            paymentMethod,
            customerInfo,
            userId,
            subtotal,
            shipping,
            tax,
            total,
            discount,
            promoCode
        } = req.body;

        // Validate required fields
        if (!items || !items.length || !shippingAddress || !customerInfo) {
            return res.status(400).json({
                success: false,
                message: 'Please provide items, shipping address, and customer info'
            });
        }

        const orderNumber = generateOrderNumber();

        const orderData = {
            orderNumber,
            items: items,
            shippingAddress: shippingAddress,
            billingAddress: billingAddress || shippingAddress,
            paymentMethod: paymentMethod || 'card',
            customerInfo: customerInfo,
            userId: userId || null, // null for guest orders
            subtotal: parseFloat(subtotal) || 0,
            shipping: parseFloat(shipping) || 0,
            tax: parseFloat(tax) || 0,
            total: parseFloat(total) || 0,
            discount: parseFloat(discount) || 0,
            promoCode: promoCode || null,
            status: 'pending',
            paymentStatus: 'pending',
            createdAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp()
        };

        const docRef = await db.collection('orders').add(orderData);

        // Update product stock
        for (const item of items) {
            const productRef = db.collection('products').doc(item.productId);
            const productDoc = await productRef.get();

            if (productDoc.exists) {
                const currentStock = productDoc.data().stock || 0;
                await productRef.update({
                    stock: Math.max(0, currentStock - (item.quantity || 1)),
                    updatedAt: FieldValue.serverTimestamp()
                });
            }
        }

        // Add to user's purchase history if logged in
        if (userId) {
            await db.collection('users').doc(userId).update({
                purchaseHistory: FieldValue.arrayUnion(orderNumber),
                updatedAt: FieldValue.serverTimestamp()
            });
        }

        res.status(201).json({
            success: true,
            message: 'Order created successfully',
            order: {
                id: docRef.id,
                orderNumber,
                ...orderData
            }
        });

    } catch (error) {
        console.error('Create order error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error creating order'
        });
    }
});

/**
 * @route   POST /api/orders/cart
 * @desc    Create order from cart
 * @access  Private
 */
router.post('/cart', protect, async (req, res) => {
    try {
        // Get user's cart
        const cartDoc = await db.collection('carts').doc(req.user.id).get();

        if (!cartDoc.exists || !cartDoc.data().items?.length) {
            return res.status(400).json({
                success: false,
                message: 'Cart is empty'
            });
        }

        const cartData = cartDoc.data();
        const { shippingAddress, billingAddress, paymentMethod } = req.body;

        if (!shippingAddress) {
            return res.status(400).json({
                success: false,
                message: 'Please provide shipping address'
            });
        }

        const orderNumber = generateOrderNumber();

        const orderData = {
            orderNumber,
            items: cartData.items,
            shippingAddress: shippingAddress,
            billingAddress: billingAddress || shippingAddress,
            paymentMethod: paymentMethod || 'card',
            customerInfo: {
                name: req.user.name,
                email: req.user.email
            },
            userId: req.user.id,
            subtotal: cartData.subtotal || 0,
            shipping: cartData.shipping || 0,
            tax: cartData.tax || 0,
            total: cartData.total || 0,
            discount: cartData.discount || 0,
            promoCode: cartData.promoCode || null,
            status: 'pending',
            paymentStatus: 'pending',
            createdAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp()
        };

        const docRef = await db.collection('orders').add(orderData);

        // Clear cart after order
        await db.collection('carts').doc(req.user.id).delete();

        // Update product stock
        for (const item of cartData.items) {
            const productRef = db.collection('products').doc(item.productId);
            const productDoc = await productRef.get();

            if (productDoc.exists) {
                const currentStock = productDoc.data().stock || 0;
                await productRef.update({
                    stock: Math.max(0, currentStock - (item.quantity || 1)),
                    updatedAt: FieldValue.serverTimestamp()
                });
            }
        }

        // Add to purchase history
        await db.collection('users').doc(req.user.id).update({
            purchaseHistory: FieldValue.arrayUnion(orderNumber),
            updatedAt: FieldValue.serverTimestamp()
        });

        res.status(201).json({
            success: true,
            message: 'Order created successfully',
            order: {
                id: docRef.id,
                orderNumber,
                ...orderData
            }
        });

    } catch (error) {
        console.error('Create order from cart error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error creating order'
        });
    }
});

/**
 * @route   GET /api/orders
 * @desc    Get all orders for logged in user (or all orders for admin)
 * @access  Private
 */
router.get('/', protect, async (req, res) => {
    try {
        let orders = [];

        if (req.user.isAdmin) {
            // Admin can see all orders
            const snapshot = await db.collection('orders').orderBy('createdAt', 'desc').get();
            snapshot.forEach(doc => {
                orders.push({
                    id: doc.id,
                    ...doc.data()
                });
            });
        } else {
            // Non-admin users can see orders by userId OR by email
            // Query by userId
            const userIdSnapshot = await db.collection('orders')
                .where('userId', '==', req.user.id)
                .orderBy('createdAt', 'desc')
                .get();

            userIdSnapshot.forEach(doc => {
                orders.push({
                    id: doc.id,
                    ...doc.data()
                });
            });

            // Also query by email (for orders placed before login or guest orders)
            const emailSnapshot = await db.collection('orders')
                .where('customerInfo.email', '==', req.user.email.toLowerCase())
                .orderBy('createdAt', 'desc')
                .get();

            emailSnapshot.forEach(doc => {
                // Avoid duplicates
                if (!orders.find(o => o.id === doc.id)) {
                    orders.push({
                        id: doc.id,
                        ...doc.data()
                    });
                }
            });

            // Sort by createdAt desc
            orders.sort((a, b) => {
                const aTime = a.createdAt?._seconds || a.createdAt?.seconds || 0;
                const bTime = b.createdAt?._seconds || b.createdAt?.seconds || 0;
                return bTime - aTime;
            });
        }

        res.status(200).json({
            success: true,
            count: orders.length,
            orders: orders
        });

    } catch (error) {
        console.error('Get orders error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error fetching orders'
        });
    }
});

/**
 * @route   GET /api/orders/guest/:email
 * @desc    Get guest orders by email
 * @access  Public
 */
router.get('/guest/:email', async (req, res) => {
    try {
        const { email } = req.params;

        const snapshot = await db.collection('orders')
            .where('customerInfo.email', '==', email.toLowerCase())
            .where('userId', '==', null)
            .orderBy('createdAt', 'desc')
            .get();

        const orders = [];
        snapshot.forEach(doc => {
            orders.push({
                id: doc.id,
                ...doc.data()
            });
        });

        res.status(200).json({
            success: true,
            count: orders.length,
            orders: orders
        });

    } catch (error) {
        console.error('Get guest orders error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error fetching orders'
        });
    }
});

/**
 * @route   GET /api/orders/:orderNumber
 * @desc    Get single order by order number
 * @access  Private (or Public for guest orders with email verification)
 */
router.get('/:orderNumber', async (req, res) => {
    try {
        const { orderNumber } = req.params;

        const snapshot = await db.collection('orders')
            .where('orderNumber', '==', orderNumber)
            .limit(1)
            .get();

        if (snapshot.empty) {
            return res.status(404).json({
                success: false,
                message: 'Order not found'
            });
        }

        const orderDoc = snapshot.docs[0];
        const orderData = orderDoc.data();

        res.status(200).json({
            success: true,
            order: {
                id: orderDoc.id,
                ...orderData
            }
        });

    } catch (error) {
        console.error('Get order error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error fetching order'
        });
    }
});

/**
 * @route   PUT /api/orders/:orderNumber/status
 * @desc    Update order status (admin only)
 * @access  Private/Admin
 */
router.put('/:orderNumber/status', protect, adminOnly, async (req, res) => {
    try {
        console.log('Update order status request received');
        console.log('Params:', req.params);
        console.log('Body:', req.body);
        console.log('Content-Type:', req.headers['content-type']);

        const { orderNumber } = req.params;
        const { status } = req.body;

        const validStatuses = ['pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled', 'refunded'];

        if (!status || !validStatuses.includes(status)) {
            return res.status(400).json({
                success: false,
                message: 'Please provide a valid status'
            });
        }

        // First try to find by orderNumber
        let snapshot = await db.collection('orders')
            .where('orderNumber', '==', orderNumber)
            .limit(1)
            .get();

        // If not found by orderNumber, try by document ID
        if (snapshot.empty) {
            const docRef = db.collection('orders').doc(orderNumber);
            const doc = await docRef.get();

            if (!doc.exists) {
                return res.status(404).json({
                    success: false,
                    message: 'Order not found'
                });
            }

            await docRef.update({
                status: status,
                updatedAt: FieldValue.serverTimestamp()
            });
        } else {
            const orderDoc = snapshot.docs[0];
            await db.collection('orders').doc(orderDoc.id).update({
                status: status,
                updatedAt: FieldValue.serverTimestamp()
            });
        }

        const responseData = {
            success: true,
            message: 'Order status updated successfully',
            orderNumber: orderNumber,
            newStatus: status
        };
        console.log('Sending success response:', responseData);
        res.status(200).json(responseData);

    } catch (error) {
        console.error('Update order status error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error updating order'
        });
    }
});

/**
 * @route   PUT /api/orders/:orderNumber/tracking
 * @desc    Add tracking information (admin only)
 * @access  Private/Admin
 */
router.put('/:orderNumber/tracking', protect, adminOnly, async (req, res) => {
    try {
        const { orderNumber } = req.params;
        const { trackingNumber, carrier, trackingUrl } = req.body;

        if (!trackingNumber) {
            return res.status(400).json({
                success: false,
                message: 'Please provide tracking number'
            });
        }

        const snapshot = await db.collection('orders')
            .where('orderNumber', '==', orderNumber)
            .limit(1)
            .get();

        if (snapshot.empty) {
            return res.status(404).json({
                success: false,
                message: 'Order not found'
            });
        }

        const orderDoc = snapshot.docs[0];
        await db.collection('orders').doc(orderDoc.id).update({
            trackingNumber: trackingNumber,
            carrier: carrier || null,
            trackingUrl: trackingUrl || null,
            status: 'shipped',
            updatedAt: FieldValue.serverTimestamp()
        });

        res.status(200).json({
            success: true,
            message: 'Tracking information added successfully'
        });

    } catch (error) {
        console.error('Add tracking error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error updating tracking'
        });
    }
});

module.exports = router;
