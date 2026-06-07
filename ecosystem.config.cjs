// pm2 process config for the Turfgame.io game server.
// Run from the project root (after `npm install && npm run build`):
//     pm2 start ecosystem.config.cjs
// PORT is provided here so no server .env is needed in production.
module.exports = {
  apps: [
    {
      name: "turfgame",
      cwd: __dirname, // project root, so @territory/shared resolves from node_modules
      script: "server/build/index.js",
      env: {
        NODE_ENV: "production",
        PORT: 2567,
      },
      time: true, // timestamp log lines
      autorestart: true,
      max_restarts: 15,
    },
  ],
};
