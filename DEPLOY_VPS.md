# GlitchGarb - Deploy to Your Own VPS

Move the entire stack (frontend + backend + database) off Vercel / Render / Neon and
onto your own Ubuntu/Debian VPS using Docker Compose.

## What you get

| Component | Current | New (VPS) |
|---|---|---|
| Frontend (static HTML/CSS/JS) | Vercel | Nginx container |
| Backend (FastAPI) | Render | FastAPI container |
| Database (PostgreSQL) | Neon | PostgreSQL container |
| Domain / SSL | Vercel | glitchgarb.com → your VPS IP, Let's Encrypt |

Everything runs with a single command: `docker compose up -d`.

---

## Architecture

```
        glitchgarb.com  (DNS A record -> your VPS IP)
                 |
            [nginx:443]   web container
                 |        serves static HTML/JS + clean URLs
                 |        proxies /api/* -> api
                 |
        [FastAPI] api container  (uvicorn, port 8000)
                 |
        [PostgreSQL 16] db container (persistent volume)
```

Nginx also serves the static site and rewrites clean URLs (`/shop` -> `/shop.html`),
mirroring what `vercel.json` did.

---

## Step 1 - Point DNS to the VPS

1. In your registrar's DNS settings (GoDaddy / Namecheap / Cloudflare / etc.), find the
   records for `glitchgarb.com`.
2. **Delete** the Vercel records (A/ALIAS `cname.vercel-dns.com` or Vercel nameservers)
   and add these A records:
   ```
   glitchgarb.com.    A     <YOUR_VPS_IP>
   www.glitchgarb.com A     <YOUR_VPS_IP>
   auth.glitchgarb.com A    <YOUR_VPS_IP>
   ```
   (`auth.glitchgarb.com` is used by Google OAuth — see `GOOGLE_REDIRECT_URI` in `.env`.)
3. Wait for DNS to propagate (`dig glitchgarb.com`). It can take 5 min to 48 hours.

> Do this AFTER the site is confirmed working on the VPS IP directly
> (curl `http://<YOUR_VPS_IP>`) so you don't lose your site during the cutover.

---

## Step 2 - Get the code onto the VPS

Pick one:

```bash
# Option A - clone from GitHub (recommended)
cd ~ && git clone https://github.com/YOUR_USERNAME/glitchgarb.git && cd glitchgarb

# Option B - scp from your PC
scp -r . ubuntu@<YOUR_VPS_IP>:~/glitchgarb
```

---

## Step 3 - One-time server setup

```bash
cd ~/glitchgarb
bash deploy/setup-vps.sh
```

This installs Docker and creates `.env` from `.env.example`. It stops there on purpose —
**edit `.env` before starting anything** (PostgreSQL only applies the password on first start).

---

## Step 4 - Fill in your secrets

If you already created a real `.env` on your PC, just upload it instead of typing everything:

```bash
scp .env ubuntu@<YOUR_VPS_IP>:~/glitchgarb/.env
```

Otherwise edit the one created on the server:

```bash
nano .env
```

| Variable | Value |
|---|---|
| `POSTGRES_PASSWORD` | generate: `openssl rand -hex 32` |
| `JWT_SECRET` | generate: `openssl rand -hex 32` |
| `RESEND_API_KEY` | same one from Render |
| `PAYSTACK_SECRET_KEY` | same one from Render |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | same as Render |
| `GOOGLE_REDIRECT_URI` | `https://glitchgarb.com/api/auth/google/callback` |
| `FROM_EMAIL` / `FROM_NAME` | same as Render |

Then start the stack:

```bash
docker compose up -d --build
```

Verify it responds on HTTP: `curl http://localhost/api/health`

---

## Step 5 - Import your live data from Neon

```bash
./deploy/migrate-db.sh "postgresql://<YOUR_NEON_URL>"
```

This runs `pg_dump` on Neon and restores into the local PostgreSQL container.
It is safe to re-run. After it finishes:

```bash
docker compose restart api
```

Verify: `curl http://localhost/api/health` should return `"database": "PostgreSQL"`.

---

## Step 6 - HTTPS with Let's Encrypt

The stack runs plain HTTP on port 80 for now. Get a real cert with certbot:

```bash
sudo apt-get install -y certbot
sudo certbot certonly --webroot -w /var/www/certbot \
  -d glitchgarb.com -d www.glitchgarb.com -d auth.glitchgarb.com \
  --email you@glitchgarb.com --agree-tos --non-interactive
```

> If your stack is running, the webroot mount already exposes `/var/www/certbot`,
> so the HTTP-01 challenge works. If it fails, run `docker compose up -d web` first.

Then switch nginx to the HTTPS config:

```bash
cp docker/nginx/nginx-ssl.conf docker/nginx/nginx.conf
docker compose restart web
```

Set up automatic renewal:

```bash
sudo crontab -e
# add:
0 3 * * * cd /home/ubuntu/glitchgarb && certbot renew --quiet --deploy-hook "docker compose restart web"
```

---

## Step 7 - Update third-party webhooks & OAuth

- **Google OAuth**: your authorized redirect URI is
  `https://auth.glitchgarb.com/api/auth/google/callback` (this is what's set in `.env`).
  It should already be registered in Google Cloud Console → Credentials. Just make sure
  `auth.glitchgarb.com` points to the VPS (Step 1) and nginx answers for it.
- **Paystack**: in your Paystack dashboard, update the webhook URL to
  `https://glitchgarb.com/api/webhook/paystack` (check the exact path in
  `backend-python/routers/webhook.py`).

---

## Step 8 - Cutover & turn off the old providers

1. Confirm the site works on the VPS IP: `curl -I http://<YOUR_VPS_IP>`
2. Point DNS (Step 1) and wait for propagation.
3. Test on `https://glitchgarb.com`:
   - signup / login
   - shop loads products (proves DB + API)
   - place a test order
4. Once happy, **stop/delete** the Render web service and remove the Vercel project
   (or leave them running as a rollback option — the frontend `config.js` now uses
   `/api`, so Vercel's version will no longer talk to Render's API).

---

## Updating the site after changes

```bash
cd ~/glitchgarb
git pull
docker compose up -d --build
```

---

## Backups

The database lives in the `pgdata` Docker volume. Back it up with a cron job:

```bash
crontab -e
# daily backup at 2am, keep 7 copies
0 2 * * * cd /home/ubuntu/glitchgarb && docker compose exec -T db pg_dump -U glitchgarb glitchgarb | gzip > ~/backups/glitchgarb-$(date +\%F).sql.gz && find ~/backups -name "glitchgarb-*.sql.gz" -mtime +7 -delete
```

Restore from a backup:

```bash
gunzip -c ~/backups/glitchgarb-2025-01-01.sql.gz | docker compose exec -T db psql -U glitchgarb glitchgarb
```

---

## Troubleshooting

**`curl http://<VPS_IP>` gives nothing** — cloud firewall (AWS/GCP/etc.) must allow
ports 80 and 443, and the VPS firewall: `sudo ufw allow 80 && sudo ufw allow 443`.

**API 502 / connection refused** — api container not up:
`docker compose logs api` and confirm `db` is healthy first
(`docker compose ps`).

**Database errors on startup** — check `docker compose logs db`. If the db volume is
corrupt: `docker compose down -v` (this DELETES the database — only after backing up).

**Google login broken** — the OAuth redirect URI must exactly match `GOOGLE_REDIRECT_URI`
and the one registered in Google Cloud Console.

**Email not sending** — check `RESEND_API_KEY` and `FROM_EMAIL` in `.env`.
