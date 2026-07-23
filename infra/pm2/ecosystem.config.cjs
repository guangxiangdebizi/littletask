const path = require('node:path');

const root = path.resolve(__dirname, '../..');
const shared = path.resolve(root, '../shared');
const envFile = process.env.LITTLETASK_ENV_FILE || path.join(shared, '.env');
const logDirectory = process.env.LITTLETASK_LOG_DIR || path.join(shared, 'logs');
const interpreter = process.env.LITTLETASK_NODE || 'node';
const runUser = process.env.LITTLETASK_RUN_USER || undefined;
const productionEnvironment = {
  NODE_ENV: 'production',
  HOST: '127.0.0.1',
  TRUST_PROXY: 'true',
  PERSISTENCE_PROVIDER: 'postgres',
  AI_PROVIDER: 'openai',
  OPENAI_BASE_URL: 'https://api.hostcentral.cc',
  OPENAI_WIRE_API: 'responses',
  OPENAI_MODEL: 'gpt-5.6-terra',
  OPENAI_REVIEW_MODEL: 'gpt-5.6-terra',
  OPENAI_REASONING_EFFORT: 'xhigh',
  OPENAI_STORE: 'false',
  LITTLETASK_ENV_FILE: envFile,
};

const processDefaults = {
  cwd: root,
  exec_mode: 'fork',
  instances: 1,
  interpreter,
  autorestart: true,
  time: true,
  merge_logs: true,
  env: productionEnvironment,
  ...(runUser ? { uid: runUser, gid: runUser } : {}),
};

module.exports = {
  apps: [
    {
      ...processDefaults,
      name: 'littletask-api',
      script: 'apps/api/dist/server.js',
      max_memory_restart: '512M',
      kill_timeout: 10_000,
      exp_backoff_restart_delay: 100,
      out_file: path.join(logDirectory, 'api.out.log'),
      error_file: path.join(logDirectory, 'api.error.log'),
    },
    {
      ...processDefaults,
      name: 'littletask-worker',
      script: 'apps/api/dist/worker.js',
      max_memory_restart: '768M',
      kill_timeout: 30_000,
      exp_backoff_restart_delay: 100,
      out_file: path.join(logDirectory, 'worker.out.log'),
      error_file: path.join(logDirectory, 'worker.error.log'),
    },
  ],
};
