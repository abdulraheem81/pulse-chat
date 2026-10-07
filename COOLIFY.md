# Deploying Pulse Chat with Coolify

[Coolify](https://coolify.io) is an open-source, self-hosted platform (alternative to Heroku / Render). It automatically manages **Docker**, **Traefik reverse proxy**, **WebSockets**, and **Free SSL certificates (Let's Encrypt)**.

---

## 🚀 Step-by-Step Deployment

### Step 1: Push Project to Git (GitHub, GitLab, or Gitea)

If you haven't pushed your code to a Git repository yet:

```bash
git init
git add .
git commit -m "Pulse P2P Chat with Docker support"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/pulse-chat.git
git push -u origin main
```

---

### Step 2: Create a New Application in Coolify

1. Log in to your **Coolify dashboard**.
2. Go to **Projects** → select your project and environment (e.g. `production`).
3. Click **+ New** → **Resource** → Select **Application**.
4. Choose **Public Repository** (or **GitHub App / Private Repository** if your repo is private).
5. Paste your repository URL:
   ```
   https://github.com/YOUR_USERNAME/pulse-chat
   ```
   - **Branch**: `main`

---

### Step 3: Configure Application Settings in Coolify

Coolify will detect the repository. Configure the following fields:

1. **Build Pack**:
   - Select **Dockerfile** *(Recommended: uses the optimized Dockerfile already in your project)*.
   - *(Alternative: Select **Nixpacks** with Node.js).*

2. **Domains**:
   - Enter your public domain with `https://`:
     ```
     https://chat.yourdomain.com
     ```
   - *Coolify & Traefik will automatically generate and renew a free Let's Encrypt SSL certificate!*
   - *(Remember to add a DNS A-record pointing `chat.yourdomain.com` to your Coolify server's IP address).*

3. **Port**:
   - **Port Exposes**: `3000`

4. **Environment Variables**:
   Under the **Environment Variables** tab, ensure you have:
   ```env
   PORT=3000
   NODE_ENV=production
   ```

5. **WebSockets (Native in Coolify)**:
   - Coolify uses Traefik as its reverse proxy, which supports WebSockets (`ws://` / `wss://`) out of the box with zero extra configuration.

---

### Step 4: Click Deploy!

1. Click **Deploy** in the top-right corner.
2. Watch the live build logs in Coolify.
3. Once the build finishes and shows **Healthy (running)**, open your domain:
   ```
   https://chat.yourdomain.com
   ```
4. Allow camera & microphone permissions when prompted by your browser.

---

### 🧪 Testing Multi-User P2P Chat on Your Coolify Deployment

1. Open `https://chat.yourdomain.com` on your computer or phone.
2. Click **"Copy Invite Link"**.
3. Send the link to a friend or open it in a second tab.
4. Both devices will connect directly via **WebRTC P2P** with video, audio, and encrypted text chat!
