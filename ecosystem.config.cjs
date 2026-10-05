// pm2 process definition: `pm2 start ecosystem.config.cjs`
module.exports = {
  apps: [
    {
      name: "alpha-9-legends",
      cwd: `${__dirname}/server`,
      script: "server.js",
      env: {
        NODE_ENV: "production",
        PORT: 3000,
        FALLBACK_PORT: 3001,
      },
      autorestart: true,
      max_restarts: 10,
      restart_delay: 2000,
    },
  ],
};
