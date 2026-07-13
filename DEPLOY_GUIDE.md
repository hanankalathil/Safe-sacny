# Deploying Safe Scany to Render

## Why Not Vercel?

Your project runs a **persistent Node.js Express server** with:
- **WebSocket (Socket.IO)** — real-time connections between users and admin
- **File system writes** — saving captures, recordings, and `data.json`
- **In-memory state** — tracking connected users

Vercel is a **serverless** platform — it can't run persistent servers or WebSockets. That's why only your `index.html` was showing up.

## Deploying on Render (Free Tier)

### Step 1: Push to GitHub
Make sure your project is pushed to a GitHub repo.

```bash
git add .
git commit -m "Add Render deployment config"
git push
```

### Step 2: Create Render Account
Go to [https://render.com](https://render.com) and sign up (free).

### Step 3: Create a New Web Service
1. Click **"New +"** → **"Web Service"**
2. Connect your GitHub repo
3. Configure:
   - **Name**: `safe-scany` (or anything you want)
   - **Root Directory**: `admin`
   - **Runtime**: `Node`
   - **Build Command**: `npm install`
   - **Start Command**: `node server.js`
4. Under **Environment Variables**, add:
   - `NODE_ENV` = `production`
   - `PORT` = `10000` (Render uses this port by default)
5. Click **"Create Web Service"**

### Step 4: Access Your App
After deployment, Render gives you a URL like:
```
https://safe-scany.onrender.com
```

- **Main page**: `https://safe-scany.onrender.com/`
- **Admin login**: `https://safe-scany.onrender.com/admin/`
- **Admin dashboard**: `https://safe-scany.onrender.com/admin/dashboard.html`

> **Note**: On Render's free tier, the server will spin down after 15 minutes of inactivity. The first request after inactivity takes ~30-60 seconds to boot up. You can upgrade to the Starter plan ($7/month) for always-on service.

> **Important**: Media files (captures/recordings) stored on disk will be lost when the service restarts on the free tier. For persistent storage, consider upgrading to a paid plan with Render Disks.
