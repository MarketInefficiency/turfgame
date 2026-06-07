# Shipping Turfgame.io to the VPS

Quick runbook. Replace `play.example.com` with your domain, `deploy` with your Linux
user, and `https://ko-fi.com/yourpage` with your Ko-fi link.

> The server uses a native binary (uWebSockets.js), so you must `npm install` **on the
> VPS** — don't upload your Windows `node_modules`. Build on the VPS.

## 1. Get the code onto the VPS
Either:
- **WinSCP / SFTP:** upload the whole project folder to `~/turfgame`, but **skip
  `node_modules`, `dist`, and `build`** (they're rebuilt on the server).
- **or git:** push the repo, then `git clone <repo> ~/turfgame` on the VPS.

## 2. Install Node 22 (one time, via PuTTY)
```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/HEAD/install.sh | bash
# reopen the shell, then:
nvm install 22 && nvm use 22 && nvm alias default 22
npm i -g pm2
```

## 3. Configure + build
```bash
cd ~/turfgame
printf 'VITE_SERVER_URL=wss://play.example.com/colyseus\nVITE_KOFI_URL=https://ko-fi.com/yourpage\n' > client/.env
npm install
npm run build
```

## 4. Run the server with pm2
```bash
cd ~/turfgame
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup        # run the command it prints, so it survives reboots
pm2 logs turfgame  # confirm "server listening ... tick 20Hz"
```

## 5. nginx
Copy `deploy/nginx-turfgame.conf`, edit the domain / cert paths / project path, then:
```bash
sudo cp ~/turfgame/deploy/nginx-turfgame.conf /etc/nginx/sites-available/turfgame
sudo ln -s /etc/nginx/sites-available/turfgame /etc/nginx/sites-enabled/turfgame
sudo nginx -t && sudo systemctl reload nginx
```
If certbot already made a `443 ssl` block for your domain, instead paste the `root`,
`index`, `location /`, and `location /colyseus/` lines into that existing block.

## 6. Play
Visit `https://play.example.com`. Open a few tabs to confirm multiplayer.

## Updating later
```bash
cd ~/turfgame   # (git pull, or re-upload changed files)
npm install && npm run build && pm2 restart turfgame
```
