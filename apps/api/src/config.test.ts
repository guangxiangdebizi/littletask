import { describe, expect, it } from 'vitest';

import { loadConfig } from './config';

describe('loadConfig', () => {
  it('allows an empty key for the deterministic fake provider', () => {
    const config = loadConfig({ AI_PROVIDER: 'fake', OPENAI_API_KEY: '' });
    expect(config.OPENAI_API_KEY).toBeUndefined();
    expect(config.OPENAI_STORE).toBe(false);
  });

  it('requires a key for the real provider and never permits response storage', () => {
    expect(() => loadConfig({ AI_PROVIDER: 'openai', OPENAI_API_KEY: '' })).toThrow();
    expect(() =>
      loadConfig({ AI_PROVIDER: 'openai', OPENAI_API_KEY: 'test-key', OPENAI_STORE: 'true' }),
    ).toThrow();
  });
});
