# GlitchGarb Deployment Guide

## Architecture
- **Frontend**: Static HTML/CSS/JS → Vercel (free)
- **Backend**: Python FastAPI → Render (free)
- **Database**: PostgreSQL → Neon (free, already set up)
- **Email**: Resend or Gmail SMTP

---

## Step 1: Push to GitHub

1. Go to [github.com](https://github.com) → New Repository → Name it `glitchgarb`
2. In your project folder, run:
   ```
   git init
   git add .
   git commit -m "Initial commit"
   git branch -M main
   git remote add origin https://github.com/YOUR_USERNAME/glitchgarb.git
   git push -u origin main
   ```

---

## Step 2: Deploy Frontend to Vercel

1. Go to [vercel.com](https://vercel.com) → Sign up with GitHub
2. **Add New Project** → Import `glitchgarb` repo
3. Framework Preset: **Other** (static site)
4. Root Directory: `/` (project root)
5. Click **Deploy**
6. Save your Vercel URL: `https://glitchgarb.vercel.app`

---

## Step 3: Deploy Backend to Render

1. Go to [render.com](https://render.com) → Sign up
2. **New +** → **Web Service** → Connect `glitchgarb` repo
3. Configure:
   - **Name**: `glitchgarb-api`
   - **Root Directory**: `backend-python`
   - **Runtime**: Python 3
   - **Build Command**: `pip install -r requirements.txt`
   - **Start Command**: `uvicorn main:app --host 0.0.0.0 --port $PORT`
   - **Plan**: Free
4. Add these **Environment Variables** (from your `.env`):
   - `DATABASE_URL` = your Neon connection string
   - `JWT_SECRET` = your JWT secret
   - `JWT_ALGORITHM` = HS256
   - `JWT_EXPIRE_MINUTES` = 10080
   - `REFRESH_EXPIRE_DAYS` = 30
   - `PORT` = 10000
   - `FRONTEND_URL` = your Vercel URL (e.g. `https://glitchgarb.vercel.app`)
   - `ENV` = production
   - `SMTP_SERVER` = your SMTP server
   - `SMTP_PORT` = your SMTP port
   - `SMTP_USERNAME` = your SMTP username
   - `SMTP_PASSWORD` = your SMTP password
   - `FROM_EMAIL` = your sender email
   - `LOGO_URL` = `https://www.upload.ee/image/19405677/glitch.png`
   - `PAYSTACK_SECRET_KEY` = your Paystack key
   - `GOOGLE_CLIENT_ID` = your Google OAuth client ID
   - `GOOGLE_CLIENT_SECRET` = your Google OAuth secret
   - `GOOGLE_REDIRECT_URI` = `https://YOUR-RENDER-URL.onrender.com/api/auth/google/callback`
5. Click **Create Web Service**
6. Save your Render URL: `https://glitchgarb-api.onrender.com`

---

## Step 4: Connect Frontend to Backend

1. Open `config.js` in your project root
2. Set the API URL:
   ```javascript
   window.GLITCHGARB_API_URL = 'https://glitchgarb-api.onrender.com/api';
   ```
3. Update `backend-python/.env`:
   - `FRONTEND_URL` = your Vercel URL
4. Update `backend-python/main.py` CORS `allow_origins` to include your Vercel URL
5. Commit and push:
   ```
   git add .
   git commit -m "Configure production API URLs"
   git push
   ```
6. Both Vercel and Render will auto-deploy on push.

---

## Step 5: Custom Domain (Optional)

If you own `glitchgarb.com`:
1. In Vercel → **Settings → Domains** → Add `www.glitchgarb.com`
2. Add the DNS records Vercel provides to your domain registrar
3. Update `FRONTEND_URL` in Render env vars to `https://www.glitchgarb.com`
4. Update CORS in `main.py` to include the domain

---

## Verify Deployment

1. Visit your Vercel URL → site should load
2. Try signing up → should hit your Render API
3. Check Render logs for any errors
4. Test email notifications (order confirmation, etc.)

---

## Troubleshooting

- **CORS errors**: Make sure `main.py` `allow_origins` includes your exact Vercel URL
- **API not found**: Check `config.js` has the correct Render URL
- **Database errors**: Verify `DATABASE_URL` in Render env vars
- **Email not sending**: Check SMTP credentials in Render env vars
