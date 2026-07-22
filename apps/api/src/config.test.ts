import { describe, expect, it } from 'vitest';

import { loadConfig } from './config';

describe('loadConfig', () => {
  it('allows the deterministic fake provider only in tests', () => {
    const config = loadConfig({
      NODE_ENV: 'test',
      AI_PROVIDER: 'fake',
      OPENAI_API_KEY: '',
    });
    expect(config.OPENAI_API_KEY).toBeUndefined();
    expect(config.OPENAI_STORE).toBe(false);
    expect(() =>
      loadConfig({ NODE_ENV: 'development', AI_PROVIDER: 'fake', OPENAI_API_KEY: '' }),
    ).toThrow();
  });

  it('requires a key for the real provider and never permits response storage', () => {
    expect(() => loadConfig({ AI_PROVIDER: 'openai', OPENAI_API_KEY: '' })).toThrow();
    expect(() =>
      loadConfig({ AI_PROVIDER: 'openai', OPENAI_API_KEY: 'test-key', OPENAI_STORE: 'true' }),
    ).toThrow();
  });

  it('requires a database URL for PostgreSQL persistence', () => {
    expect(() =>
      loadConfig({
        NODE_ENV: 'test',
        AI_PROVIDER: 'fake',
        PERSISTENCE_PROVIDER: 'postgres',
        DATABASE_URL: '',
      }),
    ).toThrow();
    expect(
      loadConfig({
        NODE_ENV: 'test',
        AI_PROVIDER: 'fake',
        PERSISTENCE_PROVIDER: 'postgres',
        DATABASE_URL: 'postgresql://littletask:littletask@localhost:5432/littletask',
      }).PERSISTENCE_PROVIDER,
    ).toBe('postgres');
  });

  it('locks production to PostgreSQL and the configured Terra gateway', () => {
    expect(
      loadConfig({
        NODE_ENV: 'production',
        HOST: '127.0.0.1',
        TRUST_PROXY: 'true',
        AI_PROVIDER: 'openai',
        OPENAI_API_KEY: 'test-key',
        PERSISTENCE_PROVIDER: 'postgres',
        DATABASE_URL: 'postgresql://littletask:littletask@localhost:5432/littletask',
      }).AI_PROVIDER,
    ).toBe('openai');
    expect(() =>
      loadConfig({
        NODE_ENV: 'production',
        AI_PROVIDER: 'openai',
        OPENAI_API_KEY: 'test-key',
        PERSISTENCE_PROVIDER: 'memory',
        TRUST_PROXY: 'true',
      }),
    ).toThrow();
    expect(() =>
      loadConfig({
        NODE_ENV: 'test',
        AI_PROVIDER: 'openai',
        OPENAI_API_KEY: 'test-key',
        OPENAI_MODEL: 'another-model',
      }),
    ).toThrow();
  });
});
