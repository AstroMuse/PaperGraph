# Server Deployment Guide (Ubuntu/Debian)

This project has been configured to run both the frontend (React/Vite) and backend (Express/Node.js) via a single unified Node service in production. This means you do **not** need to deploy the Vite server separately on Linux. Your Express backend on Port 3001 will serve the built React UI automatically.

## 1. Prerequisites (On your Linux Server)

You will need the following installed:
1. **Node.js** (v18 or higher recommended)
2. **NPM**
3. **Redis**
4. **PM2** (Process Manager for Node.js)

```bash
# Example: Install Node, Redis, and PM2 on Ubuntu
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs redis-server
sudo npm install -g pm2
```

## 2. Transfer Files to Server
Upload your entire project folder (`paperGraph`) to your server (e.g., using `scp` or `git`). You only need the source code, do **not** upload the `node_modules/` folder.

## 3. Install Dependencies and Build Frontend

Navigate to the project directory on your Linux server:

```bash
cd /path/to/paperGraph
npm install
npm run build
```

This will run Vite and compile the frontend into the `dist/` directory.

## 4. Environment Variables
Your project uses a `.env` file. We have pre-configured it:

```env
PORT=3001
REDIS_URL=redis://127.0.0.1:6379
VITE_API_BASE_URL=/api
```
*(You can modify the `PORT` if 3001 is already in use)*

## 5. Starting the Application using PM2

PM2 will keep your app running in the background and restart it if it crashes.
We have created an `ecosystem.config.cjs` file to define this layout.

```bash
# Start the application
pm2 start ecosystem.config.cjs

# Save PM2 state to auto-restart on server reboot
pm2 save
pm2 startup
```

## 6. Accessing the App

If you are just accessing this locally on the server or via an open port, the whole application (Frontend UI + Backend API) is now accessible at:
`http://<YOUR_LINUX_IP>:3001/`

### Optional: Setup Nginx Reverse Proxy (Use Port 80)
If you want to use a domain name or standard Port 80, install Nginx (`sudo apt install nginx`) and set up a proxy block:

```nginx
server {
    listen 80;
    server_name yourdomain.com; # Or your server IP

    location / {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```
Reload Nginx: `sudo systemctl reload nginx`.
