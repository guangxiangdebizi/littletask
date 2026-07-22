import { createFakeAnalysis } from '@littletask/domain';

import type { AIProvider } from '../types';

export class FakeAIProvider implements AIProvider {
  async analyze(input: Parameters<AIProvider['analyze']>[0]) {
    await new Promise((resolve) => setTimeout(resolve, 40));
    return createFakeAnalysis({
      note: input.note,
      now: input.now,
      timezone: input.timezone,
    });
  }

  async review(
    _input: Parameters<AIProvider['review']>[0],
    draft: Parameters<AIProvider['review']>[1],
  ) {
    await new Promise((resolve) => setTimeout(resolve, 20));
    return draft;
  }
}
