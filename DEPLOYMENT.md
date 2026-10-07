# Deployment Guide — Pulse P2P Video, Audio & Text Chat

This guide covers how to deploy the Pulse chat app to production on any cloud provider or Linux server.

---

## ⚠️ Important WebRTC Requirement: HTTPS / SSL

Modern web browsers **strictly require HTTPS** (SSL/TLS) for camera and microphone access (`navigator.mediaDevices.getUserMedia`) on any host other than `localhost`. 
> If deployed over plain HTTP on a public IP or domain, the browser will block access to the camera and microphone.

Every deployment method below includes HTTPS setup.

---

## Method 1: Cloud PaaS (Render, Railway, Fly.io) — *Easiest (Free SSL Included)*

Platforms like Render and Railway automatically provision free SSL certificates, support WebSockets out of the box, and deploy directly from your GitHub repository.

### Option A: Render.com
1. Push this project to GitHub.
2. Log in to [Render.com](https://render.com) and click **New +** → **Web Service**.
3. Connect your repository.
4. Configure:
   - **Environment**: `Node`
   - **Build Command**: `npm install`
   - **Start Command**: `node server.js`
   - **Port**: `3000` (Render detects `PORT` environment variable automatically).
5. Click **Deploy Web Service**. You will get a live `https://your-app.onrender.com` URL with automatic SSL.

### Option B: Railway.app
1. Go to [Railway.app](https://railway.app) and create a **New Project**.
2. Select **Deploy from GitHub repo**.
3. Railway will automatically detect the Node.js project and deploy it.
4. In Settings → **Networking**, generate a public domain (e.g., `https://pulse-chat.up.railway.app`).

---

## Method 2: Linux Server (Ubuntu / Debian VPS on AWS, DigitalOcean, Hetzner, Linode)

This is the standard production setup using **PM2** (process manager), **Nginx** (reverse proxy with WebSocket support), and **Certbot** (free Let's Encrypt SSL).

### Step 1: Connect to your server & install Node.js
```bash
# Connect via SSH
ssh root@YOUR_SERVER_IP

# Update system
sudo apt update && sudo apt upgrade -y

# Install Node.js 20 LTS & git
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs git nginx certbot python3-certbot-nginx
```

### Step 2: Clone & install application
```bash
# Clone project into /var/www
cd /var/www
git clone <YOUR_GIT_REPO_URL> pulse-chat
cd pulse-chat

# Install dependencies
npm install --production

# Install PM2 globally to keep the app running forever
sudo npm install -g pm2

# Start app with PM2
pm2 start server.js --name "pulse-chat"
pm2 save
pm2 startup
```

### Step 3: Configure Nginx Reverse Proxy with WebSocket Support
Create an Nginx configuration file:
```bash
sudo nano /etc/nginx/sites-available/pulse-chat
```

Paste the following configuration (replace `chat.yourdomain.com` with your domain):
```nginx
server {
    listen 80;
    server_name chat.yourdomain.com;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;

        # WebSocket headers
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";

        # Standard proxy headers
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # WebSocket timeouts
        proxy_read_timeout 86400s;
        proxy_send_timeout 86400s;
    }
}
```

Enable the site and test Nginx:
```bash
sudo ln -s /etc/nginx/sites-available/pulse-chat /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

### Step 4: Obtain Free SSL Certificate with Let's Encrypt
```bash
sudo certbot --nginx -d chat.yourdomain.com
```
Follow the prompts. Certbot will configure SSL automatically and set up automatic renewal.

Now visit **`https://chat.yourdomain.com`**!

---

## Method 3: Deploy with Docker & Docker Compose

If you have Docker installed on your server:

```bash
# 1. Clone repository
git clone <YOUR_GIT_REPO_URL> pulse-chat
cd pulse-chat

# 2. Build and run in detached mode
docker compose up -d --build

# 3. Check logs
docker compose logs -f
```

The app will be running on port `3000`. Put Nginx or Caddy in front of it with SSL to access camera and mic.

---

## 🌐 NAT Traversal: Adding a TURN Server (Optional for Strict Networks)

While the default Google STUN server (`stun:stun.l.google.com:19302`) handles direct P2P connections for ~85% of home/mobile networks, users behind **symmetric NATs** or corporate firewalls may require a TURN relay server.

If you need a TURN server:
1. You can get a free TURN server tier from providers like [Metered.ca](https://www.metered.ca/tools/openrelay/) or [Twilio](https://www.twilio.com/docs/stun-turn).
2. Add your TURN credentials to `public/js/webrtc.js`:

```javascript
this.rtcConfig = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    {
      urls: 'turn:your-turn-server.com:3478',
      username: 'your-username',
      credential: 'your-password'
    }
  ]
};
```
