import './load-env';

import { hostname } from 'node:os';
import { setTimeout as wait } from 'node:timers/promises';

import pino from 'pino';

import { loadConfig } from './config';
import { createIntakeService } from './runtime';

const config = loadConfig();
if (config.PERSISTENCE_PROVIDER !== 'postgres') {
  throw new Error('The standalone AI worker requires PERSISTENCE_PROVIDER=postgres');
}

const logger = pino({
  level: config.LOG_LEVEL,
  redact: {
    paths: ['*.OPENAI_API_KEY', '*.DATABASE_URL', 'authorization', 'cookie'],
    censor: '[REDACTED]',
  },
});
const { service, store } = createIntakeService(config, { inlineWorker: false });
const workerId = `${hostname()}:${process.pid}`;
let stopping = false;

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    stopping = true;
    logger.info({ signal, workerId }, 'Stopping AI worker');
  });
}

logger.info({ workerId }, 'AI worker started');
while (!stopping) {
  try {
    const processed = await service.processNextJob(workerId);
    if (!processed) await wait(config.JOB_POLL_MS);
  } catch (error) {
    const code =
      typeof error === 'object' && error !== null && 'code' in error
        ? String(error.code)
        : 'WORKER_TICK_FAILED';
    logger.error({ code, workerId }, 'AI worker tick failed');
    await wait(config.JOB_POLL_MS);
  }
}

await store.close();
logger.info({ workerId }, 'AI worker stopped');
