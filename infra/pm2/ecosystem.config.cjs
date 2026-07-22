const path = require('node:path');

const root = path.resolve(__dirname, '../..');
const productionEnvironment = {
  NODE_ENV: 'production',
  PERSISTENCE_PROVIDER: 'postgres',
};

module.exports = {
  apps: [
    {
      name: 'littletask-api',
      cwd: root,
      script: 'apps/api/dist/server.js',
      exec_mode: 'fork',
      instances: 1,
      autorestart: true,
      max_memory_restart: '512M',
      kill_timeout: 10_000,
      exp_backoff_restart_delay: 100,
      env: productionEnvironment,
    },
    {
      name: 'littletask-worker',
      cwd: root,
      script: 'apps/api/dist/worker.js',
      exec_mode: 'fork',
      instances: 1,
      autorestart: true,
      max_memory_restart: '768M',
      kill_timeout: 30_000,
      exp_backoff_restart_delay: 100,
      env: productionEnvironment,
    },
  ],
};
