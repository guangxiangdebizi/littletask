const path = require('node:path');

const root = path.resolve(__dirname, '../..');
const productionEnvironment = {
  NODE_ENV: 'production',
  PERSISTENCE_PROVIDER: 'postgres',
  AI_PROVIDER: 'openai',
  OPENAI_BASE_URL: 'https://api.hostcentral.cc',
  OPENAI_WIRE_API: 'responses',
  OPENAI_MODEL: 'gpt-5.6-terra',
  OPENAI_REVIEW_MODEL: 'gpt-5.6-terra',
  OPENAI_REASONING_EFFORT: 'xhigh',
  OPENAI_STORE: 'false',
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
