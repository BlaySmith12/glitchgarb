/**
 * Firebase Admin Configuration
 * Initializes Firebase Admin SDK for backend operations
 * 
 * Supports two initialization methods:
 * 1. Environment Variables (Production - Render, etc.)
 * 2. Service Account JSON file (Local Development)
 */

const admin = require('firebase-admin');
const path = require('path');
const fs = require('fs');

// Debug: Log environment variable status (without revealing values)
console.log('🔍 Environment check:');
console.log('   - FIREBASE_PROJECT_ID:', process.env.FIREBASE_PROJECT_ID ? '✅ Set' : '❌ Not set');
console.log('   - FIREBASE_CLIENT_EMAIL:', process.env.FIREBASE_CLIENT_EMAIL ? '✅ Set' : '❌ Not set');
console.log('   - FIREBASE_PRIVATE_KEY:', process.env.FIREBASE_PRIVATE_KEY ? '✅ Set' : '❌ Not set');
console.log('   - FIREBASE_DATABASE_URL:', process.env.FIREBASE_DATABASE_URL ? '✅ Set' : '❌ Not set');
console.log('   - NODE_ENV:', process.env.NODE_ENV || 'Not set');

// Check if we're in production (using env vars) or development (using service account file)
const useEnvVars = process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY;

function initializeFirebase() {
    // Prevent multiple initializations
    if (admin.apps.length > 0) {
        console.log('✅ Firebase Admin already initialized');
        return;
    }

    try {
        if (useEnvVars) {
            // Production: Use environment variables
            console.log('🔧 Initializing Firebase Admin with environment variables...');

            // Handle private key - replace escaped newlines
            let privateKey = process.env.FIREBASE_PRIVATE_KEY;

            // Handle different formats of newlines
            if (privateKey.includes('\\n')) {
                privateKey = privateKey.replace(/\\n/g, '\n');
            }

            // Ensure the key has proper formatting
            if (!privateKey.includes('-----BEGIN PRIVATE KEY-----')) {
                throw new Error('FIREBASE_PRIVATE_KEY is not in the correct format. It should include the full PEM key.');
            }

            admin.initializeApp({
                credential: admin.credential.cert({
                    projectId: process.env.FIREBASE_PROJECT_ID || 'glitchgarb-ed70d',
                    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
                    privateKey: privateKey
                }),
                databaseURL: process.env.FIREBASE_DATABASE_URL || 'https://glitchgarb-ed70d-default-rtdb.firebaseio.com'
            });

            console.log('✅ Firebase Admin initialized successfully (Environment Variables)');
        } else {
            // Development: Use service account file
            console.log('🔧 Initializing Firebase Admin with service account file...');

            const serviceAccountPath = path.join(__dirname, '../serviceAccount.json');

            // Check if file exists
            if (!fs.existsSync(serviceAccountPath)) {
                console.error('');
                console.error('❌ serviceAccount.json not found AND environment variables are not set!');
                console.error('');
                console.error('💡 For local development:');
                console.error('   - Ensure backend/serviceAccount.json exists');
                console.error('');
                console.error('💡 For production (Render):');
                console.error('   - Go to: Dashboard → Your Service → Environment');
                console.error('   - Add these variables:');
                console.error('     * FIREBASE_PROJECT_ID=glitchgarb-ed70d');
                console.error('     * FIREBASE_CLIENT_EMAIL=firebase-adminsdk-fbsvc@glitchgarb-ed70d.iam.gserviceaccount.com');
                console.error('     * FIREBASE_PRIVATE_KEY=-----BEGIN PRIVATE KEY-----\\n...\\n-----END PRIVATE KEY-----\\n');
                console.error('     * FIREBASE_DATABASE_URL=https://glitchgarb-ed70d-default-rtdb.firebaseio.com');
                throw new Error('Firebase credentials not found. Check the logs above for instructions.');
            }

            const serviceAccount = require(serviceAccountPath);

            admin.initializeApp({
                credential: admin.credential.cert(serviceAccount),
                databaseURL: 'https://glitchgarb-ed70d-default-rtdb.firebaseio.com'
            });

            console.log('✅ Firebase Admin initialized successfully (Service Account File)');
        }
    } catch (error) {
        console.error('❌ Firebase Admin initialization failed:', error.message);
        process.exit(1);
    }
}

// Initialize Firebase
initializeFirebase();

// Export Firebase services
const auth = admin.auth();
const db = admin.firestore();
const FieldValue = admin.firestore.FieldValue;

module.exports = {
    admin,
    auth,
    db,
    FieldValue
};
