module.exports = {
  apps: [
    {
      name: 'paper-graph',
      script: './server.js',
      env: {
        NODE_ENV: 'production',
        PORT: 3001,
        REDIS_URL: 'redis://127.0.0.1:6379'
      }
    }
  ]
};
