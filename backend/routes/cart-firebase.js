/**
 * Cart Routes - Firebase Version
 * Handles shopping cart operations with Firestore
 */

const express = require('express');
const router = express.Router();
const { db, FieldValue } = require('../config/firebase');
const { protect } = require('../middleware/auth-firebase');

/**
 * Get or create cart for user
 */
const getOrCreateCart = async (userId) => {
    const cartRef = db.collection('carts').doc(userId);
    const cartDoc = await cartRef.get();

    if (!cartDoc.exists) {
        await cartRef.set({
            items: [],
            subtotal: 0,
            shipping: 0,
            tax: 0,
            total: 0,
            discount: 0,
            promoCode: null,
            createdAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp()
        });
        return { items: [], subtotal: 0, shipping: 0, tax: 0, total: 0, discount: 0 };
    }

    return cartDoc.data();
};

/**
 * Calculate cart totals
 */
const calculateTotals = (items) => {
    let subtotal = 0;

    items.forEach(item => {
        const price = item.price || 0;
        const quantity = item.quantity || 1;
        subtotal += price * quantity;
    });

    const shipping = subtotal > 100 ? 0 : 9.99; // Free shipping over $100
    const tax = subtotal * 0.08; // 8% tax
    const total = subtotal + shipping + tax;

    return {
        subtotal: Math.round(subtotal * 100) / 100,
        shipping: Math.round(shipping * 100) / 100,
        tax: Math.round(tax * 100) / 100,
        total: Math.round(total * 100) / 100
    };
};

/**
 * @route   GET /api/cart
 * @desc    Get user's cart
 * @access  Private
 */
router.get('/', protect, async (req, res) => {
    try {
        const cart = await getOrCreateCart(req.user.id);

        res.status(200).json({
            success: true,
            cart: cart
        });

    } catch (error) {
        console.error('Get cart error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error fetching cart'
        });
    }
});

/**
 * @route   POST /api/cart
 * @desc    Add item to cart
 * @access  Private
 */
router.post('/', protect, async (req, res) => {
    try {
        const { productId, name, price, quantity = 1, size, color, image } = req.body;

        if (!productId || !name || price === undefined) {
            return res.status(400).json({
                success: false,
                message: 'Please provide productId, name, and price'
            });
        }

        const cart = await getOrCreateCart(req.user.id);

        // Check if item already exists in cart
        const existingIndex = cart.items.findIndex(
            item => item.productId === productId && item.size === size && item.color === color
        );

        if (existingIndex > -1) {
            // Update quantity
            cart.items[existingIndex].quantity += parseInt(quantity);
        } else {
            // Add new item
            cart.items.push({
                id: `${productId}-${size || 'default'}-${color || 'default'}`,
                productId,
                name,
                price: parseFloat(price),
                quantity: parseInt(quantity),
                size: size || null,
                color: color || null,
                image: image || null,
                addedAt: new Date().toISOString()
            });
        }

        // Calculate totals
        const totals = calculateTotals(cart.items);
        Object.assign(cart, totals);

        // Save cart
        await db.collection('carts').doc(req.user.id).update({
            ...cart,
            updatedAt: FieldValue.serverTimestamp()
        });

        res.status(200).json({
            success: true,
            message: 'Item added to cart',
            cart: cart
        });

    } catch (error) {
        console.error('Add to cart error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error adding to cart'
        });
    }
});

/**
 * @route   PUT /api/cart/:itemId
 * @desc    Update cart item quantity
 * @access  Private
 */
router.put('/:itemId', protect, async (req, res) => {
    try {
        const { itemId } = req.params;
        const { quantity } = req.body;

        if (quantity === undefined || quantity < 0) {
            return res.status(400).json({
                success: false,
                message: 'Please provide a valid quantity'
            });
        }

        const cart = await getOrCreateCart(req.user.id);
        const itemIndex = cart.items.findIndex(item => item.id === itemId);

        if (itemIndex === -1) {
            return res.status(404).json({
                success: false,
                message: 'Item not found in cart'
            });
        }

        if (quantity === 0) {
            // Remove item
            cart.items.splice(itemIndex, 1);
        } else {
            // Update quantity
            cart.items[itemIndex].quantity = parseInt(quantity);
        }

        // Calculate totals
        const totals = calculateTotals(cart.items);
        Object.assign(cart, totals);

        // Save cart
        await db.collection('carts').doc(req.user.id).update({
            ...cart,
            updatedAt: FieldValue.serverTimestamp()
        });

        res.status(200).json({
            success: true,
            message: quantity === 0 ? 'Item removed from cart' : 'Cart updated',
            cart: cart
        });

    } catch (error) {
        console.error('Update cart error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error updating cart'
        });
    }
});

/**
 * @route   DELETE /api/cart/:itemId
 * @desc    Remove item from cart
 * @access  Private
 */
router.delete('/:itemId', protect, async (req, res) => {
    try {
        const { itemId } = req.params;

        const cart = await getOrCreateCart(req.user.id);
        const itemIndex = cart.items.findIndex(item => item.id === itemId);

        if (itemIndex === -1) {
            return res.status(404).json({
                success: false,
                message: 'Item not found in cart'
            });
        }

        cart.items.splice(itemIndex, 1);

        // Calculate totals
        const totals = calculateTotals(cart.items);
        Object.assign(cart, totals);

        // Save cart
        await db.collection('carts').doc(req.user.id).update({
            ...cart,
            updatedAt: FieldValue.serverTimestamp()
        });

        res.status(200).json({
            success: true,
            message: 'Item removed from cart',
            cart: cart
        });

    } catch (error) {
        console.error('Remove from cart error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error removing from cart'
        });
    }
});

/**
 * @route   DELETE /api/cart
 * @desc    Clear entire cart
 * @access  Private
 */
router.delete('/', protect, async (req, res) => {
    try {
        await db.collection('carts').doc(req.user.id).update({
            items: [],
            subtotal: 0,
            shipping: 0,
            tax: 0,
            total: 0,
            discount: 0,
            promoCode: null,
            updatedAt: FieldValue.serverTimestamp()
        });

        res.status(200).json({
            success: true,
            message: 'Cart cleared',
            cart: {
                items: [],
                subtotal: 0,
                shipping: 0,
                tax: 0,
                total: 0,
                discount: 0
            }
        });

    } catch (error) {
        console.error('Clear cart error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error clearing cart'
        });
    }
});

/**
 * @route   GET /api/cart/count
 * @desc    Get cart item count
 * @access  Private
 */
router.get('/count', protect, async (req, res) => {
    try {
        const cart = await getOrCreateCart(req.user.id);
        const count = cart.items.reduce((total, item) => total + (item.quantity || 1), 0);

        res.status(200).json({
            success: true,
            count: count
        });

    } catch (error) {
        console.error('Get cart count error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error fetching cart count'
        });
    }
});

/**
 * @route   GET /api/cart/total
 * @desc    Get cart total
 * @access  Private
 */
router.get('/total', protect, async (req, res) => {
    try {
        const cart = await getOrCreateCart(req.user.id);

        res.status(200).json({
            success: true,
            subtotal: cart.subtotal,
            shipping: cart.shipping,
            tax: cart.tax,
            total: cart.total,
            discount: cart.discount
        });

    } catch (error) {
        console.error('Get cart total error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error fetching cart total'
        });
    }
});

/**
 * @route   POST /api/cart/promo
 * @desc    Apply promo code to cart
 * @access  Private
 */
router.post('/promo', protect, async (req, res) => {
    try {
        const { code } = req.body;

        if (!code) {
            return res.status(400).json({
                success: false,
                message: 'Please provide a promo code'
            });
        }

        const cart = await getOrCreateCart(req.user.id);

        // Check if promo code exists and is valid
        const promoDoc = await db.collection('promoCodes').doc(code.toUpperCase()).get();

        if (!promoDoc.exists) {
            return res.status(400).json({
                success: false,
                message: 'Invalid promo code'
            });
        }

        const promoData = promoDoc.data();

        // Check if promo is still valid
        if (promoData.expiresAt && new Date(promoData.expiresAt) < new Date()) {
            return res.status(400).json({
                success: false,
                message: 'Promo code has expired'
            });
        }

        // Calculate discount
        let discount = 0;
        if (promoData.type === 'percentage') {
            discount = cart.subtotal * (promoData.value / 100);
        } else if (promoData.type === 'fixed') {
            discount = promoData.value;
        }

        discount = Math.min(discount, cart.subtotal); // Can't discount more than subtotal

        // Update cart
        const newTotal = cart.subtotal + cart.shipping + cart.tax - discount;

        await db.collection('carts').doc(req.user.id).update({
            discount: Math.round(discount * 100) / 100,
            promoCode: code.toUpperCase(),
            total: Math.round(newTotal * 100) / 100,
            updatedAt: FieldValue.serverTimestamp()
        });

        res.status(200).json({
            success: true,
            message: 'Promo code applied',
            discount: Math.round(discount * 100) / 100,
            newTotal: Math.round(newTotal * 100) / 100
        });

    } catch (error) {
        console.error('Apply promo error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error applying promo code'
        });
    }
});

module.exports = router;
