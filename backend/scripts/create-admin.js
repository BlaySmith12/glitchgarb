/**
 * Create Admin User Script
 * Run this script to create an admin user in Firebase
 */

const { auth, db, FieldValue } = require('../config/firebase');

async function createAdmin() {
    const email = 'admin@glitchgarb.com';
    const password = 'admin123';
    const name = 'Admin User';

    try {
        // Check if admin already exists in Firestore
        const existingAdminSnapshot = await db.collection('users')
            .where('isAdmin', '==', true)
            .limit(1)
            .get();

        if (!existingAdminSnapshot.empty) {
            console.log('Admin user already exists:');
            const adminDoc = existingAdminSnapshot.docs[0];
            console.log('  UID:', adminDoc.id);
            console.log('  Email:', adminDoc.data().email);
            return;
        }

        // Create user in Firebase Auth
        let userRecord;
        try {
            userRecord = await auth.createUser({
                email: email.toLowerCase(),
                password: password,
                displayName: name
            });
            console.log('Created Firebase Auth user:', userRecord.uid);
        } catch (createError) {
            if (createError.code === 'auth/email-already-exists') {
                userRecord = await auth.getUserByEmail(email.toLowerCase());
                console.log('User already exists in Firebase Auth:', userRecord.uid);
            } else {
                throw createError;
            }
        }

        // Create user document in Firestore
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

        console.log('\n✅ Admin user created successfully!');
        console.log('  Email:', email);
        console.log('  Password:', password);
        console.log('  UID:', userRecord.uid);
        console.log('\nYou can now login to the admin portal.');

    } catch (error) {
        console.error('Error creating admin:', error);
    }

    process.exit(0);
}

createAdmin();
