/**
 * Authentication Routes - Firebase Version
 * Handles user registration, login, and profile management
 */

const express = require('express');
const router = express.Router();
const { auth, db, FieldValue } = require('../config/firebase');
const { protect, adminOnly } = require('../middleware/auth-firebase');

/**
 * @route   POST /api/auth/signup
 * @desc    Register a new user
 * @access  Public
 */
router.post('/signup', async (req, res) => {
    try {
        const { name, email, password } = req.body;

        // Validate input
        if (!name || !email || !password) {
            return res.status(400).json({
                success: false,
                message: 'Please provide name, email, and password'
            });
        }

        if (password.length < 6) {
            return res.status(400).json({
                success: false,
                message: 'Password must be at least 6 characters'
            });
        }

        // Create user in Firebase Auth
        const userRecord = await auth.createUser({
            email: email.toLowerCase(),
            password: password,
            displayName: name
        });

        // Create user document in Firestore
        await db.collection('users').doc(userRecord.uid).set({
            name: name,
            email: email.toLowerCase(),
            isAdmin: false,
            isVIP: false,
            purchaseHistory: [],
            watchlist: [],
            createdAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp()
        });

        // Generate custom token for client
        const customToken = await auth.createCustomToken(userRecord.uid);

        res.status(201).json({
            success: true,
            message: 'User created successfully',
            uid: userRecord.uid,
            customToken: customToken
        });

    } catch (error) {
        console.error('Signup error:', error);

        // Handle Firebase Auth errors
        if (error.code === 'auth/email-already-exists') {
            return res.status(400).json({
                success: false,
                message: 'User already exists with this email'
            });
        }

        if (error.code === 'auth/invalid-email') {
            return res.status(400).json({
                success: false,
                message: 'Invalid email address'
            });
        }

        if (error.code === 'auth/weak-password') {
            return res.status(400).json({
                success: false,
                message: 'Password is too weak'
            });
        }

        res.status(500).json({
            success: false,
            message: 'Server error during registration'
        });
    }
});

/**
 * @route   POST /api/auth/login
 * @desc    Login user - Returns custom token for client to sign in
 * @access  Public
 */
router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        // Validate input
        if (!email || !password) {
            return res.status(400).json({
                success: false,
                message: 'Please provide email and password'
            });
        }

        let userRecord;
        let isNewUser = false;

        // Try to get user from Firebase Auth
        try {
            userRecord = await auth.getUserByEmail(email.toLowerCase());
        } catch (authError) {
            // User not found in Firebase Auth, check Firestore
            if (authError.code === 'auth/user-not-found') {
                // Check if user exists in Firestore (for admin users created directly in DB)
                const usersSnapshot = await db.collection('users')
                    .where('email', '==', email.toLowerCase())
                    .limit(1)
                    .get();

                if (usersSnapshot.empty) {
                    return res.status(401).json({
                        success: false,
                        message: 'Invalid email or password'
                    });
                }

                const userDoc = usersSnapshot.docs[0];
                const userData = userDoc.data();

                // Verify password (for users created directly in Firestore)
                // Note: In production, you'd want proper password hashing
                if (userData.password && userData.password !== password) {
                    return res.status(401).json({
                        success: false,
                        message: 'Invalid email or password'
                    });
                }

                // Create the user in Firebase Auth for future logins
                try {
                    userRecord = await auth.createUser({
                        uid: userDoc.id,
                        email: email.toLowerCase(),
                        password: password,
                        displayName: userData.name
                    });
                    isNewUser = true;
                    console.log(`Created Firebase Auth user for existing Firestore user: ${email}`);
                } catch (createError) {
                    // If user already exists with different UID, get them
                    if (createError.code === 'auth/uid-already-exists') {
                        userRecord = await auth.getUserByEmail(email.toLowerCase());
                    } else {
                        throw createError;
                    }
                }
            } else {
                throw authError;
            }
        }

        // Generate custom token
        const customToken = await auth.createCustomToken(userRecord.uid);

        // Get user data from Firestore
        const userDoc = await db.collection('users').doc(userRecord.uid).get();
        const userData = userDoc.exists ? userDoc.data() : {};

        res.status(200).json({
            success: true,
            message: 'Login successful',
            uid: userRecord.uid,
            customToken: customToken,
            user: {
                id: userRecord.uid,
                email: userRecord.email,
                name: userData.name || userRecord.displayName,
                isAdmin: userData.isAdmin || false,
                isVIP: userData.isVIP || false
            }
        });

    } catch (error) {
        console.error('Login error:', error);

        // Handle Firebase Auth errors
        if (error.code === 'auth/user-not-found' || error.code === 'auth/invalid-email') {
            return res.status(401).json({
                success: false,
                message: 'Invalid email or password'
            });
        }

        res.status(500).json({
            success: false,
            message: 'Server error during login'
        });
    }
});

/**
 * @route   POST /api/auth/logout
 * @desc    Logout user (client-side token invalidation)
 * @access  Public
 */
router.post('/logout', (req, res) => {
    // Firebase logout is handled client-side
    res.status(200).json({
        success: true,
        message: 'Logged out successfully. Please clear token on client side.'
    });
});

/**
 * @route   GET /api/auth/me
 * @desc    Get current logged in user
 * @access  Private
 */
router.get('/me', protect, async (req, res) => {
    try {
        res.status(200).json({
            success: true,
            user: {
                id: req.user.id,
                email: req.user.email,
                name: req.user.name,
                isAdmin: req.user.isAdmin || false,
                isVIP: req.user.isVIP || false,
                purchaseHistory: req.user.purchaseHistory || [],
                watchlist: req.user.watchlist || [],
                createdAt: req.user.createdAt,
                updatedAt: req.user.updatedAt
            }
        });
    } catch (error) {
        console.error('Get user error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error fetching user'
        });
    }
});

/**
 * @route   PUT /api/auth/me
 * @desc    Update user profile
 * @access  Private
 */
router.put('/me', protect, async (req, res) => {
    try {
        const { name, email } = req.body;

        const updateData = {
            updatedAt: FieldValue.serverTimestamp()
        };

        if (name) {
            updateData.name = name;
            // Also update in Firebase Auth
            await auth.updateUser(req.user.id, { displayName: name });
        }

        if (email && email !== req.user.email) {
            // Check if email is already taken
            try {
                const existingUser = await auth.getUserByEmail(email);
                if (existingUser && existingUser.uid !== req.user.id) {
                    return res.status(400).json({
                        success: false,
                        message: 'Email is already taken'
                    });
                }
            } catch (e) {
                // User not found, email is available
            }

            updateData.email = email.toLowerCase();
            await auth.updateUser(req.user.id, { email: email.toLowerCase() });
        }

        await db.collection('users').doc(req.user.id).update(updateData);

        // Get updated user
        const updatedDoc = await db.collection('users').doc(req.user.id).get();

        res.status(200).json({
            success: true,
            user: {
                id: req.user.id,
                ...updatedDoc.data()
            }
        });

    } catch (error) {
        console.error('Update user error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error updating user'
        });
    }
});

/**
 * @route   PUT /api/auth/password
 * @desc    Update password (admin operation - requires re-auth on client)
 * @access  Private
 */
router.put('/password', protect, async (req, res) => {
    try {
        const { newPassword } = req.body;

        if (!newPassword || newPassword.length < 6) {
            return res.status(400).json({
                success: false,
                message: 'Password must be at least 6 characters'
            });
        }

        // Update password in Firebase Auth
        await auth.updateUser(req.user.id, { password: newPassword });

        res.status(200).json({
            success: true,
            message: 'Password updated successfully. Please login again.'
        });

    } catch (error) {
        console.error('Update password error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error updating password'
        });
    }
});

/**
 * @route   POST /api/auth/vip
 * @desc    Upgrade user to VIP
 * @access  Private
 */
router.post('/vip', protect, async (req, res) => {
    try {
        await db.collection('users').doc(req.user.id).update({
            isVIP: true,
            updatedAt: FieldValue.serverTimestamp()
        });

        res.status(200).json({
            success: true,
            message: 'Upgraded to VIP successfully'
        });

    } catch (error) {
        console.error('VIP upgrade error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error during VIP upgrade'
        });
    }
});

/**
 * @route   GET /api/auth/users
 * @desc    Get all users (admin only)
 * @access  Private/Admin
 */
router.get('/users', protect, adminOnly, async (req, res) => {
    try {
        const usersSnapshot = await db.collection('users')
            .orderBy('createdAt', 'desc')
            .get();

        const users = [];
        usersSnapshot.forEach(doc => {
            users.push({
                id: doc.id,
                ...doc.data()
            });
        });

        res.status(200).json({
            success: true,
            count: users.length,
            users: users
        });

    } catch (error) {
        console.error('Get users error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error fetching users'
        });
    }
});

/**
 * @route   POST /api/auth/verify-token
 * @desc    Verify Firebase ID token and return user data
 * @access  Public
 */
router.post('/verify-token', async (req, res) => {
    try {
        const { idToken } = req.body;

        if (!idToken) {
            return res.status(400).json({
                success: false,
                message: 'No token provided'
            });
        }

        // Verify the ID token
        const decodedToken = await auth.verifyIdToken(idToken);

        // Get user data from Firestore
        const userDoc = await db.collection('users').doc(decodedToken.uid).get();
        const userData = userDoc.exists ? userDoc.data() : {};

        res.status(200).json({
            success: true,
            user: {
                id: decodedToken.uid,
                email: decodedToken.email,
                name: userData.name || decodedToken.name,
                isAdmin: userData.isAdmin || false,
                isVIP: userData.isVIP || false
            }
        });

    } catch (error) {
        console.error('Token verification error:', error);
        res.status(401).json({
            success: false,
            message: 'Invalid or expired token'
        });
    }
});

/**
 * @route   GET /api/auth/users/:userId
 * @desc    Get single user by ID (admin only)
 * @access  Private/Admin
 */
router.get('/users/:userId', protect, adminOnly, async (req, res) => {
    try {
        const userDoc = await db.collection('users').doc(req.params.userId).get();

        if (!userDoc.exists) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        res.status(200).json({
            success: true,
            user: {
                id: userDoc.id,
                ...userDoc.data()
            }
        });

    } catch (error) {
        console.error('Get user error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error fetching user'
        });
    }
});

/**
 * @route   PUT /api/auth/users/:userId
 * @desc    Update user by ID (admin only)
 * @access  Private/Admin
 */
router.put('/users/:userId', protect, adminOnly, async (req, res) => {
    try {
        const { name, email, isAdmin, isVIP } = req.body;
        const updateData = {
            updatedAt: FieldValue.serverTimestamp()
        };

        if (name) updateData.name = name;
        if (email) updateData.email = email.toLowerCase();
        if (typeof isAdmin === 'boolean') updateData.isAdmin = isAdmin;
        if (typeof isVIP === 'boolean') updateData.isVIP = isVIP;

        await db.collection('users').doc(req.params.userId).update(updateData);

        const updatedDoc = await db.collection('users').doc(req.params.userId).get();

        res.status(200).json({
            success: true,
            message: 'User updated successfully',
            user: {
                id: updatedDoc.id,
                ...updatedDoc.data()
            }
        });

    } catch (error) {
        console.error('Update user error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error updating user'
        });
    }
});

/**
 * @route   POST /api/auth/users/:userId/vip
 * @desc    Toggle user VIP status (admin only)
 * @access  Private/Admin
 */
router.post('/users/:userId/vip', protect, adminOnly, async (req, res) => {
    try {
        const userDoc = await db.collection('users').doc(req.params.userId).get();

        if (!userDoc.exists) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        const currentVIPStatus = userDoc.data().isVIP || false;
        const newVIPStatus = !currentVIPStatus;

        await db.collection('users').doc(req.params.userId).update({
            isVIP: newVIPStatus,
            updatedAt: FieldValue.serverTimestamp()
        });

        res.status(200).json({
            success: true,
            message: `User VIP status ${newVIPStatus ? 'granted' : 'revoked'}`,
            isVIP: newVIPStatus
        });

    } catch (error) {
        console.error('Toggle VIP error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error toggling VIP status'
        });
    }
});

/**
 * @route   POST /api/auth/setup-admin
 * @desc    Create admin user if not exists (for initial setup)
 * @access  Public (should be disabled in production)
 */
router.post('/setup-admin', async (req, res) => {
    try {
        const { email, password, name, setupKey } = req.body;

        // Simple security check - in production, use a proper secret
        if (setupKey !== 'glitchgarb-admin-setup-2024') {
            return res.status(403).json({
                success: false,
                message: 'Invalid setup key'
            });
        }

        if (!email || !password || !name) {
            return res.status(400).json({
                success: false,
                message: 'Please provide email, password, and name'
            });
        }

        // Check if admin already exists
        const existingAdminSnapshot = await db.collection('users')
            .where('isAdmin', '==', true)
            .limit(1)
            .get();

        if (!existingAdminSnapshot.empty) {
            return res.status(400).json({
                success: false,
                message: 'Admin user already exists'
            });
        }

        // Create user in Firebase Auth
        let userRecord;
        try {
            userRecord = await auth.createUser({
                email: email.toLowerCase(),
                password: password,
                displayName: name
            });
        } catch (createError) {
            if (createError.code === 'auth/email-already-exists') {
                // Get existing user
                userRecord = await auth.getUserByEmail(email.toLowerCase());
            } else {
                throw createError;
            }
        }

        // Create or update user document in Firestore
        await db.collection('users').doc(userRecord.uid).set({
            name: name,
            email: email.toLowerCase(),
            isAdmin: true,
            isVIP: true,
            purchaseHistory: [],
            watchlist: [],
            createdAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp()
        }, { merge: true });

        res.status(201).json({
            success: true,
            message: 'Admin user created successfully',
            uid: userRecord.uid,
            email: userRecord.email
        });

    } catch (error) {
        console.error('Setup admin error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error during admin setup'
        });
    }
});

module.exports = router;
