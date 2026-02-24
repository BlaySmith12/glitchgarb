/**
 * Authentication Middleware
 * Handles Firebase Auth verification and user authorization
 */

const { auth, db } = require('../config/firebase');

/**
 * Protect routes - Verify Firebase ID token or UID
 */
const protect = async (req, res, next) => {
    try {
        let token;

        // Check for token in Authorization header
        if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
            token = req.headers.authorization.split(' ')[1];
        }

        if (!token) {
            return res.status(401).json({
                success: false,
                message: 'Not authorized to access this route. Please login.'
            });
        }

        try {
            // First, try to verify as Firebase ID token
            let decodedToken;
            let uid = token;

            try {
                decodedToken = await auth.verifyIdToken(token);
                uid = decodedToken.uid;
            } catch (idTokenError) {
                // If ID token verification fails, treat token as UID directly
                // This is for admin panel simplicity
                console.log('Treating token as UID for admin access');
            }

            // Get user from Firestore
            const userDoc = await db.collection('users').doc(uid).get();

            if (!userDoc.exists) {
                return res.status(401).json({
                    success: false,
                    message: 'User not found in database. Please login again.'
                });
            }

            // Add user to request object
            req.user = {
                id: uid,
                email: decodedToken?.email || userDoc.data().email,
                ...userDoc.data()
            };

            next();

        } catch (error) {
            console.error('Token verification error:', error.message);
            return res.status(401).json({
                success: false,
                message: 'Invalid or expired token. Please login again.'
            });
        }

    } catch (error) {
        return res.status(500).json({
            success: false,
            message: 'Server error during authentication'
        });
    }
};

/**
 * Admin only - Restrict to admin users
 */
const adminOnly = (req, res, next) => {
    if (req.user && req.user.isAdmin) {
        next();
    } else {
        return res.status(403).json({
            success: false,
            message: 'Access denied. Admin privileges required.'
        });
    }
};

/**
 * VIP only - Restrict to VIP users
 */
const vipOnly = (req, res, next) => {
    if (req.user && (req.user.isVIP || req.user.isAdmin)) {
        next();
    } else {
        return res.status(403).json({
            success: false,
            message: 'Access denied. VIP membership required.'
        });
    }
};

/**
 * Optional auth - Attach user if token present, but don't require it
 */
const optionalAuth = async (req, res, next) => {
    try {
        let token;

        if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
            token = req.headers.authorization.split(' ')[1];
        }

        if (token) {
            try {
                const decodedToken = await auth.verifyIdToken(token);
                const userDoc = await db.collection('users').doc(decodedToken.uid).get();

                if (userDoc.exists) {
                    req.user = {
                        id: decodedToken.uid,
                        email: decodedToken.email,
                        ...userDoc.data()
                    };
                }
            } catch (error) {
                // Token invalid, but continue without user
            }
        }

        next();

    } catch (error) {
        next();
    }
};

module.exports = {
    protect,
    adminOnly,
    vipOnly,
    optionalAuth
};
