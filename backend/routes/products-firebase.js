/**
 * Product Routes - Firebase Version
 * Handles product CRUD operations with Firestore
 */

const express = require('express');
const router = express.Router();
const { db, FieldValue } = require('../config/firebase');
const { protect, adminOnly, optionalAuth } = require('../middleware/auth-firebase');

/**
 * @route   GET /api/products
 * @desc    Get all products with optional filtering
 * @access  Public
 */
router.get('/', async (req, res) => {
    try {
        const { category, limit = 50, offset = 0, featured, search } = req.query;

        let query = db.collection('products');

        // Apply filters
        if (category) {
            query = query.where('category', '==', category);
        }

        if (featured === 'true') {
            query = query.where('featured', '==', true);
        }

        // Get products
        const snapshot = await query.limit(parseInt(limit)).get();

        let products = [];
        snapshot.forEach(doc => {
            products.push({
                id: doc.id,
                ...doc.data()
            });
        });

        // Search filter (client-side for simplicity)
        if (search) {
            const searchLower = search.toLowerCase();
            products = products.filter(p =>
                p.name?.toLowerCase().includes(searchLower) ||
                p.description?.toLowerCase().includes(searchLower)
            );
        }

        res.status(200).json({
            success: true,
            count: products.length,
            products: products
        });

    } catch (error) {
        console.error('Get products error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error fetching products'
        });
    }
});

/**
 * @route   GET /api/products/live
 * @desc    Get live drops (products currently available)
 * @access  Public
 */
router.get('/live', async (req, res) => {
    try {
        const now = new Date();

        const snapshot = await db.collection('products')
            .where('status', '==', 'live')
            .orderBy('dropDate', 'desc')
            .get();

        const products = [];
        snapshot.forEach(doc => {
            products.push({
                id: doc.id,
                ...doc.data()
            });
        });

        res.status(200).json({
            success: true,
            count: products.length,
            products: products
        });

    } catch (error) {
        console.error('Get live products error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error fetching live products'
        });
    }
});

/**
 * @route   GET /api/products/upcoming
 * @desc    Get upcoming drops
 * @access  Public
 */
router.get('/upcoming', async (req, res) => {
    try {
        const snapshot = await db.collection('products')
            .where('status', '==', 'upcoming')
            .orderBy('dropDate', 'asc')
            .get();

        const products = [];
        snapshot.forEach(doc => {
            products.push({
                id: doc.id,
                ...doc.data()
            });
        });

        res.status(200).json({
            success: true,
            count: products.length,
            products: products
        });

    } catch (error) {
        console.error('Get upcoming products error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error fetching upcoming products'
        });
    }
});

/**
 * @route   GET /api/products/:id
 * @desc    Get single product by ID
 * @access  Public
 */
router.get('/:id', async (req, res) => {
    try {
        const doc = await db.collection('products').doc(req.params.id).get();

        if (!doc.exists) {
            return res.status(404).json({
                success: false,
                message: 'Product not found'
            });
        }

        res.status(200).json({
            success: true,
            product: {
                id: doc.id,
                ...doc.data()
            }
        });

    } catch (error) {
        console.error('Get product error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error fetching product'
        });
    }
});

/**
 * @route   POST /api/products
 * @desc    Create new product (admin only)
 * @access  Private/Admin
 */
router.post('/', protect, adminOnly, async (req, res) => {
    try {
        const {
            name,
            description,
            price,
            originalPrice,
            category,
            images,
            image,
            sizes,
            colors,
            stock,
            releaseDate,
            dropDate,
            status,
            featured,
            tags
        } = req.body;

        // Validate required fields
        if (!name || !price) {
            return res.status(400).json({
                success: false,
                message: 'Please provide name and price'
            });
        }

        // Use releaseDate if provided, otherwise use dropDate
        const finalDropDate = releaseDate || dropDate || null;

        // Determine status based on dropDate if not explicitly provided
        let finalStatus = status;
        if (!status) {
            if (finalDropDate) {
                const dropDateTime = new Date(finalDropDate);
                const now = new Date();
                finalStatus = dropDateTime <= now ? 'live' : 'upcoming';
            } else {
                // No drop date means product is available immediately
                finalStatus = 'live';
            }
        }

        const productData = {
            name,
            description: description || '',
            price: parseFloat(price),
            originalPrice: originalPrice ? parseFloat(originalPrice) : null,
            category: category || 'general',
            images: images || (image ? [image] : []),
            sizes: sizes || ['S', 'M', 'L', 'XL'],
            colors: colors || [],
            stock: parseInt(stock) || 0,
            dropDate: finalDropDate,
            releaseDate: finalDropDate, // Also store as releaseDate for frontend compatibility
            status: finalStatus,
            featured: featured || false,
            tags: tags || [],
            createdAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp()
        };

        const docRef = await db.collection('products').add(productData);

        res.status(201).json({
            success: true,
            message: 'Product created successfully',
            product: {
                id: docRef.id,
                ...productData
            }
        });

    } catch (error) {
        console.error('Create product error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error creating product'
        });
    }
});

/**
 * @route   PUT /api/products/:id
 * @desc    Update product (admin only)
 * @access  Private/Admin
 */
router.put('/:id', protect, adminOnly, async (req, res) => {
    try {
        const { id } = req.params;
        const updates = req.body;

        // Check if product exists
        const doc = await db.collection('products').doc(id).get();
        if (!doc.exists) {
            return res.status(404).json({
                success: false,
                message: 'Product not found'
            });
        }

        // Add update timestamp
        updates.updatedAt = FieldValue.serverTimestamp();

        // Convert numeric fields
        if (updates.price) updates.price = parseFloat(updates.price);
        if (updates.originalPrice) updates.originalPrice = parseFloat(updates.originalPrice);
        if (updates.stock) updates.stock = parseInt(updates.stock);

        // Handle releaseDate -> dropDate mapping
        if (updates.releaseDate) {
            updates.dropDate = updates.releaseDate;
        }

        // Handle image field -> images array
        if (updates.image && !updates.images) {
            updates.images = [updates.image];
        }

        // Update status based on dropDate if provided
        if (updates.dropDate || updates.releaseDate) {
            const dropDateTime = new Date(updates.dropDate || updates.releaseDate);
            const now = new Date();
            updates.status = dropDateTime <= now ? 'live' : 'upcoming';
        }

        await db.collection('products').doc(id).update(updates);

        // Get updated product
        const updatedDoc = await db.collection('products').doc(id).get();

        res.status(200).json({
            success: true,
            message: 'Product updated successfully',
            product: {
                id: updatedDoc.id,
                ...updatedDoc.data()
            }
        });

    } catch (error) {
        console.error('Update product error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error updating product'
        });
    }
});

/**
 * @route   DELETE /api/products/:id
 * @desc    Delete product (admin only)
 * @access  Private/Admin
 */
router.delete('/:id', protect, adminOnly, async (req, res) => {
    try {
        const { id } = req.params;

        // Check if product exists
        const doc = await db.collection('products').doc(id).get();
        if (!doc.exists) {
            return res.status(404).json({
                success: false,
                message: 'Product not found'
            });
        }

        await db.collection('products').doc(id).delete();

        res.status(200).json({
            success: true,
            message: 'Product deleted successfully'
        });

    } catch (error) {
        console.error('Delete product error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error deleting product'
        });
    }
});

/**
 * @route   PUT /api/products/:id/stock
 * @desc    Update product stock (admin only)
 * @access  Private/Admin
 */
router.put('/:id/stock', protect, adminOnly, async (req, res) => {
    try {
        const { id } = req.params;
        const { stock, operation = 'set' } = req.body;

        if (stock === undefined) {
            return res.status(400).json({
                success: false,
                message: 'Please provide stock value'
            });
        }

        const doc = await db.collection('products').doc(id).get();
        if (!doc.exists) {
            return res.status(404).json({
                success: false,
                message: 'Product not found'
            });
        }

        const currentStock = doc.data().stock || 0;
        let newStock;

        if (operation === 'add') {
            newStock = currentStock + parseInt(stock);
        } else if (operation === 'subtract') {
            newStock = Math.max(0, currentStock - parseInt(stock));
        } else {
            newStock = parseInt(stock);
        }

        await db.collection('products').doc(id).update({
            stock: newStock,
            updatedAt: FieldValue.serverTimestamp()
        });

        res.status(200).json({
            success: true,
            message: 'Stock updated successfully',
            previousStock: currentStock,
            newStock: newStock
        });

    } catch (error) {
        console.error('Update stock error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error updating stock'
        });
    }
});

module.exports = router;
