# Deployment — Namecheap VPS (self-hosted)

Target: a Namecheap VPS running **Ubuntu LTS**. The backend is a single Node/Colyseus process;
the built client is static files served by nginx (or by the server). WebSockets must be served over
**WSS (TLS)** because browsers block insecure `ws://` from an `https://` page.

> Treat the commands below as a reference runbook. Adjust the domain, paths, and Node version.

---

## 1. Server prep (one time)
```bash
# SSH in as root, then create a non-root sudo user and log in as them
adduser deploy && usermod -aG sudo deploy

# Firewall: allow SSH + web
ufw allow OpenSSH && ufw allow 80 && ufw allow 443 && ufw enable

# Build tools (uWebSockets.js ships prebuilt binaries, but have these just in case)
sudo apt update && sudo apt install -y build-essential git nginx
```

## 2. Node.js
- Install the **current Node LTS** (via nvm or NodeSource). Match the Node major that
  `@colyseus/uwebsockets-transport`'s bundled uWebSockets.js supports; if the prebuilt binary
  doesn't match your Node, pin a compatible Node version.
```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/HEAD/install.sh | bash
# restart shell, then:
nvm install --lts && nvm use --lts
npm i -g pm2
```

## 3. Get the code & build
```bash
git clone <your-repo> ~/app && cd ~/app
npm install                 # installs all workspaces
npm run build               # builds /client (vite) and /server (tsc)
```
- Client build output (e.g. `client/dist`) is static; nginx will serve it.
- Server build output (e.g. `server/build`) is what pm2 runs.

## 4. Run the server with pm2 (survives reboots/crashes)
```bash
cd ~/app
pm2 start npm --name territory-server -- run start   # runs the built server (port 2567)
pm2 save
pm2 startup        # follow the printed command to enable boot startup
pm2 logs territory-server   # tail logs
```

## 5. DNS (Namecheap dashboard)
- Add an **A record** for your domain (e.g. `play.yourgame.com`) pointing to the VPS IP.
- Wait for propagation before issuing TLS certs.

## 6. nginx reverse proxy + WebSocket upgrade
Create `/etc/nginx/sites-available/territory` (then symlink into `sites-enabled`):
```nginx
server {
  listen 80;
  server_name play.yourgame.com;

  # Serve the built static client
  root /home/deploy/app/client/dist;
  index index.html;
  location / { try_files $uri $uri/ /index.html; }

  # Proxy Colyseus (WebSocket) — adjust path/port to your setup
  location /colyseus/ {
    proxy_pass http://127.0.0.1:2567/;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;     # REQUIRED for WebSocket
    proxy_set_header Connection "upgrade";      # REQUIRED for WebSocket
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_read_timeout 600s;
  }
}
```
```bash
sudo ln -s /etc/nginx/sites-available/territory /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```
- Point the client's Colyseus endpoint at `wss://play.yourgame.com/colyseus` (after TLS below).

## 7. TLS (Let's Encrypt)
```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d play.yourgame.com   # auto-configures HTTPS + redirects, auto-renews
```
- After this, the site is `https://` and the WebSocket is `wss://` — required for browser clients.

## 8. Config / env
- Put the server port and any secrets in environment variables (a `.env` read by the server; never
  commit it). Provide a committed `.env.example`.
- The client needs the public WSS URL at build time (e.g. a Vite env var
  `VITE_SERVER_URL=wss://play.yourgame.com/colyseus`).

## 9. Updates
```bash
cd ~/app && git pull && npm install && npm run build && pm2 restart territory-server
```

## 10. Scaling notes (later, not MVP)
- One VPS process hosts many rooms (Colyseus rooms are in-process) — fine for a prototype.
- To scale beyond one process: run multiple Node processes + **Redis** (Colyseus presence/driver)
  behind the nginx load balancer. Add this only when a single VPS is saturated.
- Watch CPU/RAM with `pm2 monit`; the territory grid sim and per-tick deltas are the main load.
