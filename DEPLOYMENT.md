# GlitchGarb Deployment Guide

This guide covers deploying GlitchGarb to Render (free tier supported).

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                         Render                               │
│  ┌─────────────────────┐    ┌─────────────────────────────┐ │
│  │   Frontend          │    │   Backend API               │ │
│  │   (Static Site)     │───▶│   (Node.js Web Service)     │ │
│  │   HTML/CSS/JS       │    │   Express + Firebase Admin  │ │
│  │                     │    │                             │ │
│  │   glitchgarb-       │    │   glitchgarb-backend        │ │
│  │   frontend          │    │   .onrender.com             │ │
│  └─────────────────────┘    └──────────────┬──────────────┘ │
└─────────────────────────────────────────────┼───────────────┘
                                              │
                                              ▼
                              ┌───────────────────────────────┐
                              │      Firebase Services        │
                              │  ┌─────────┐  ┌─────────────┐ │
                              │  │ Auth    │  │  Firestore  │ │
                              │  └─────────┘  └─────────────┘ │
                              └───────────────────────────────┘
```

## Prerequisites

1. **GitHub Account** - For repository hosting
2. **Render Account** - Sign up at [render.com](https://render.com)
3. **Firebase Project** - Already set up (glitchgarb-ed70d)
4. **Firebase Service Account** - For backend authentication

## Step 1: Prepare Firebase Credentials

### Get Service Account Credentials

1. Go to [Firebase Console](https://console.firebase.google.com)
2. Select your project: **glitchgarb-ed70d**
3. Go to **Project Settings** (gear icon) → **Service accounts**
4. Click **Generate new private key**
5. Save the JSON file securely (you'll need values from it)

### Required Values

From the downloaded JSON, extract these values:

| Environment Variable | JSON Field |
|---------------------|------------|
| `FIREBASE_PROJECT_ID` | `project_id` |
| `FIREBASE_CLIENT_EMAIL` | `client_email` |
| `FIREBASE_PRIVATE_KEY` | `private_key` |
| `FIREBASE_DATABASE_URL` | Use: `https://glitchgarb-ed70d-default-rtdb.firebaseio.com` |

> ⚠️ **Important**: The `private_key` contains `\n` characters. Keep them as-is when setting the environment variable.

## Step 2: Push to GitHub

```bash
# Initialize git if not already done
git init

# Add all files (serviceAccount.json is ignored)
git add .

# Commit
git commit -m "Prepare for Render deployment"

# Add your GitHub remote
git remote add origin https://github.com/YOUR_USERNAME/glitchgarb.git

# Push to GitHub
git push -u origin main
```

### Verify .gitignore

Ensure `backend/.gitignore` includes:

```gitignore
# Environment files
.env
serviceAccount.json

# Dependencies
node_modules/

# IDE
.idea/
.vscode/
```

## Step 3: Deploy Using render.yaml (Blueprint)

### Option A: One-Click Blueprint Deploy

1. Go to [Render Dashboard](https://dashboard.render.com)
2. Click **New** → **Blueprint**
3. Connect your GitHub repository
4. Render will detect `render.yaml` automatically
5. Review the services and click **Apply**

### Option B: Manual Service Creation

If you prefer manual setup:

#### Backend (Web Service)

1. Click **New** → **Web Service**
2. Connect your repository
3. Configure:
   - **Name**: `glitchgarb-backend`
   - **Root Directory**: `backend`
   - **Environment**: `Node`
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Plan**: Free

4. Add Environment Variables:

   | Key | Value |
   |-----|-------|
   | `NODE_ENV` | `production` |
   | `FIREBASE_PROJECT_ID` | `glitchgarb-ed70d` |
   | `FIREBASE_DATABASE_URL` | `https://glitchgarb-ed70d-default-rtdb.firebaseio.com` |
   | `FIREBASE_CLIENT_EMAIL` | (from serviceAccount.json) |
   | `FIREBASE_PRIVATE_KEY` | (from serviceAccount.json - keep \n characters) |

5. Click **Create Web Service**

#### Frontend (Static Site)

1. Click **New** → **Static Site**
2. Connect your repository
3. Configure:
   - **Name**: `glitchgarb-frontend`
   - **Root Directory**: `.` (or leave empty)
   - **Build Command**: (leave empty)
   - **Publish Directory**: `.`
   - **Plan**: Free

4. Click **Create Static Site**

## Step 4: Update Frontend API URL

After deploying the backend, update the frontend to point to it:

### Method 1: Update JavaScript Files

Edit the production URL in these files:

- `api-service.js` (line ~50)
- `script.js` (line ~20)
- `admin-api.js` (line ~25)

Change:
```javascript
return 'https://glitchgarb-backend.onrender.com/api';
```

To your actual backend URL.

### Method 2: Use Environment Variable (Recommended)

Add this to your HTML files before loading scripts:

```html
<script>
  // Set the backend URL for production
  window.GG_BACKEND_URL = 'https://glitchgarb-backend.onrender.com';
</script>
<script src="api-service.js"></script>
```

## Step 5: Verify Deployment

### Check Backend Health

```bash
curl https://glitchgarb-backend.onrender.com/api/health
```

Expected response:
```json
{
  "success": true,
  "message": "GlitchGarb API is running",
  "database": "Firebase Firestore",
  "timestamp": "2024-..."
}
```

### Check Frontend

Visit your frontend URL and:
1. Open browser console (F12)
2. Look for: `🔗 Production environment detected`
3. Test login functionality
4. Test product browsing

## Environment Variables Reference

### Backend Required Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `FIREBASE_PROJECT_ID` | ✅ | Firebase project ID |
| `FIREBASE_CLIENT_EMAIL` | ✅ | Service account email |
| `FIREBASE_PRIVATE_KEY` | ✅ | Service account private key |
| `FIREBASE_DATABASE_URL` | ⚪ | Firebase Realtime DB URL (optional) |
| `NODE_ENV` | ⚪ | Set to `production` |
| `PORT` | ⚪ | Auto-set by Render |

### Frontend Variables

| Variable | Description |
|----------|-------------|
| `GG_BACKEND_URL` | Backend URL (optional, for reference) |
| `GG_API_URL` | Full API URL override (optional) |

## Custom Domain Setup (Optional)

### Add Custom Domain

1. In Render Dashboard, go to your service
2. Click **Settings** → **Custom Domains**
3. Add your domain (e.g., `www.glitchgarb.com`)
4. Update DNS records as instructed

### Update CORS (if needed)

If using custom domains, update `backend/server.js` CORS configuration:

```javascript
app.use(cors({
    origin: [
        'https://www.glitchgarb.com',
        'https://glitchgarb.com',
        'https://glitchgarb-frontend.onrender.com'
    ],
    credentials: true
}));
```

## Troubleshooting

### Backend Won't Start

**Error**: `Firebase Admin initialization failed`

**Solution**: Check environment variables are set correctly:
- `FIREBASE_PRIVATE_KEY` must include `\n` for newlines
- `FIREBASE_CLIENT_EMAIL` must be exact match from service account

### Frontend Can't Connect to Backend

**Error**: `API unavailable - using LocalStorage mode`

**Solutions**:
1. Check backend is running (visit `/api/health`)
2. Verify frontend URL matches backend URL
3. Check browser console for CORS errors

### Free Tier Limitations

- Services spin down after 15 minutes of inactivity
- First request after spin-down takes ~30 seconds
- 750 hours/month free per service

## Monitoring & Logs

### View Logs

1. Go to Render Dashboard
2. Select your service
3. Click **Logs** tab

### Set Up Alerts

1. Go to **Settings** → **Notifications**
2. Add email for deployment alerts

## Cost Estimate

| Service | Plan | Monthly Cost |
|---------|------|--------------|
| Backend Web Service | Free (Starter) | $0 |
| Frontend Static Site | Free | $0 |
| Firebase (Spark) | Free | $0 |
| **Total** | | **$0** |

### Paid Upgrade (Optional)

For production with no cold starts:
- Backend: Starter ($7/month)
- Always on, no spin-down

## Security Checklist

- [ ] `serviceAccount.json` is NOT in git repository
- [ ] `.env` is NOT in git repository
- [ ] Firebase service account has minimal permissions
- [ ] CORS is configured for your domains only
- [ ] HTTPS is enforced (automatic on Render)

## Support

- [Render Documentation](https://render.com/docs)
- [Firebase Documentation](https://firebase.google.com/docs)
- [GitHub Issues](https://github.com/YOUR_USERNAME/glitchgarb/issues)
