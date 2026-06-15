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
Two env files. The Vite build auto-loads `client/.env.production` for `vite build`; the
server reads `.env` from the app root (`~/turfgame`) via dotenv.

**Client build vars — `~/turfgame/client/.env.production`** (all public, safe to commit to the box):
```bash
cat > ~/turfgame/client/.env.production <<'EOF'
VITE_SERVER_URL=wss://turfgame.io/colyseus
VITE_KOFI_URL=https://ko-fi.com/turfgameio
VITE_SUPABASE_URL=https://derxaiqacejjzgdqlsdr.supabase.co
VITE_SUPABASE_ANON_KEY=sb_publishable_xxx
EOF
```

**Server secret vars — `~/turfgame/.env`** (PRIVATE — the service-role key; never commit):
```bash
# edit by hand; paste the real sb_secret_ value, do not echo it into history
nano ~/turfgame/.env
#   SUPABASE_URL=https://derxaiqacejjzgdqlsdr.supabase.co
#   SUPABASE_SECRET_KEY=sb_secret_xxx
```
(Stripe secrets live in Supabase Edge Function secrets, NOT here — see `supabase/STRIPE_SETUP.md`.)

```bash
cd ~/turfgame
npm install
npm run build
# nginx serves /var/www/turfgame (see conf.d/turfgame.conf `root`), NOT client/dist —
# so copy the fresh build into the web root after every build:
sudo rsync -a --delete client/dist/ /var/www/turfgame/
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
The full redeploy. The `rsync` line is REQUIRED — nginx serves `/var/www/turfgame`, not
`client/dist`, so a build alone does nothing visible until you copy it across.
```bash
cd ~/turfgame
git pull
npm install
npm run build
sudo rsync -a --delete client/dist/ /var/www/turfgame/   # copy the new client into the web root
pm2 restart turfgame                                     # reload the authoritative server
```
Verify without browser cache:
```bash
curl -s https://turfgame.io/ | grep -o "Create private arena"   # prints if the new build is live
```
Browsers cache hard — use Ctrl-Shift-R or a private window to see changes.

> Heads up: `node_modules` for `@colyseus/uwebsockets-transport` is a native binary, so
> always `npm install` on the VPS after pulling new deps; never copy Windows modules up.
