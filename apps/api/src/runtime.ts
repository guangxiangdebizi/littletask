import type { AppConfig } from './config';
import { IntakeService } from './intake-service';
import { LangGraphAIProvider } from './providers/langgraph-provider';
import { InMemoryIntakeStore } from './stores/in-memory-store';
import { createPrismaClient, PrismaIntakeStore } from './stores/prisma-store';
import type { AIProvider, IntakeStore } from './types';

export function createAIProvider(config: AppConfig): AIProvider {
  if (!config.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY is required');
  }

  return new LangGraphAIProvider({
    apiKey: config.OPENAI_API_KEY,
    baseURL: config.OPENAI_BASE_URL,
    model: config.OPENAI_MODEL,
    reviewModel: config.OPENAI_REVIEW_MODEL,
    reasoningEffort: config.OPENAI_REASONING_EFFORT,
    store: config.OPENAI_STORE,
    timeoutMs: config.OPENAI_TIMEOUT_MS,
    maxRetries: config.OPENAI_MAX_RETRIES,
    maxOutputTokens: config.OPENAI_MAX_OUTPUT_TOKENS,
  });
}

export function createIntakeStore(config: AppConfig): IntakeStore {
  if (config.PERSISTENCE_PROVIDER === 'memory') return new InMemoryIntakeStore();
  if (!config.DATABASE_URL) {
    throw new Error('DATABASE_URL is required when PERSISTENCE_PROVIDER=postgres');
  }
  return new PrismaIntakeStore(createPrismaClient(config.DATABASE_URL));
}

export function createIntakeService(
  config: AppConfig,
  overrides: { provider?: AIProvider; store?: IntakeStore; inlineWorker?: boolean } = {},
): { service: IntakeService; store: IntakeStore } {
  const provider = overrides.provider ?? createAIProvider(config);
  const store = overrides.store ?? createIntakeStore(config);
  return {
    store,
    service: new IntakeService(store, provider, {
      inlineWorker: overrides.inlineWorker ?? config.PERSISTENCE_PROVIDER === 'memory',
      maxJobAttempts: config.JOB_MAX_ATTEMPTS,
      jobLeaseMs: config.JOB_LEASE_MS,
      providerName: 'openai-langgraph',
      analysisModel: config.OPENAI_MODEL,
      reviewModel: config.OPENAI_REVIEW_MODEL,
      reasoningEffort: config.OPENAI_REASONING_EFFORT,
      promptVersion: '2026-07-22.2',
      schemaVersion: '1',
    }),
  };
}
