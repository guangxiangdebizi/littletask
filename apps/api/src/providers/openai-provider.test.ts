import { describe, expect, it, vi } from 'vitest';

import { OpenAIProvider, type OpenAIProviderOptions } from './openai-provider';

interface CapturedBody {
  model: string;
  store: boolean;
  reasoning: { effort: string };
  max_output_tokens: number;
  text: { format: { type: string; strict: boolean } };
  instructions: string;
  input: Array<{
    content: Array<{
      type: string;
      text?: string;
      image_url?: string;
      detail?: string;
    }>;
  }>;
}

const modelDraft = {
  summary: '对话约定了明天下午见面。',
  participants: ['张明'],
  facts: ['双方计划见面'],
  uncertainties: ['没有说明结束时间'],
  clarifyingQuestions: [
    {
      prompt: '会议预计持续多久？',
      actionIndex: 0,
      options: ['30 分钟', '1 小时'],
    },
  ],
  actions: [
    {
      type: 'create_event',
      confidence: 'high',
      evidence: [{ source: 'screenshot', quote: '明天下午三点见', author: null }],
      assumptions: ['结束时间需要用户确认'],
      payload: {
        title: '与张明见面',
        attendees: [{ displayName: '张明', localContactId: null }],
        startAt: '2026-07-23T15:00:00+08:00',
        endAt: null,
        timezone: 'Asia/Shanghai',
        location: null,
        notes: null,
        suggestedDurationMinutes: null,
      },
    },
  ],
} as const;

function modelResponse() {
  return {
    id: 'resp_test',
    object: 'response',
    created_at: 1_753_159_200,
    status: 'completed',
    output: [
      {
        id: 'msg_test',
        type: 'message',
        status: 'completed',
        role: 'assistant',
        content: [
          {
            type: 'output_text',
            text: JSON.stringify(modelDraft),
            annotations: [],
          },
        ],
      },
    ],
  };
}

describe('OpenAIProvider', () => {
  it('uses stateless multimodal Responses requests for analysis and review', async () => {
    const captured: Array<{
      url: string;
      authorization: string | null;
      body: CapturedBody;
    }> = [];
    const fetchMock: NonNullable<OpenAIProviderOptions['fetch']> = vi.fn(async (input, init) => {
      const request = new Request(input, init);
      captured.push({
        url: request.url,
        authorization: request.headers.get('authorization'),
        body: (await request.json()) as CapturedBody,
      });
      return new Response(JSON.stringify(modelResponse()), {
        status: 200,
        headers: { 'content-type': 'application/json', 'x-request-id': 'request_test' },
      });
    });
    const provider = new OpenAIProvider({
      apiKey: 'test-key',
      baseURL: 'https://api.hostcentral.cc',
      model: 'gpt-5.6-terra',
      reviewModel: 'gpt-5.6-terra-review',
      reasoningEffort: 'xhigh',
      store: false,
      timeoutMs: 10_000,
      maxRetries: 0,
      maxOutputTokens: 16_000,
      fetch: fetchMock,
    });
    const input = {
      image: Buffer.from([0x89, 0x50, 0x4e, 0x47]),
      mimeType: 'image/png',
      note: '请帮我整理',
      locale: 'zh-CN',
      timezone: 'Asia/Shanghai',
      now: new Date('2026-07-22T12:00:00+08:00'),
    };

    const analyzed = await provider.analyze(input);
    const reviewed = await provider.review(input, analyzed);

    expect(analyzed.actions).toHaveLength(1);
    expect(reviewed.actions[0]?.type).toBe('create_event');
    expect(captured).toHaveLength(2);

    const analysisRequest = captured[0];
    const reviewRequest = captured[1];
    expect(analysisRequest).toBeDefined();
    expect(reviewRequest).toBeDefined();
    if (!analysisRequest || !reviewRequest) throw new Error('Expected two model requests');

    expect(analysisRequest.url).toBe('https://api.hostcentral.cc/responses');
    expect(analysisRequest.authorization).toBe('Bearer test-key');
    expect(analysisRequest.body).toMatchObject({
      model: 'gpt-5.6-terra',
      store: false,
      reasoning: { effort: 'xhigh' },
      max_output_tokens: 16_000,
      text: { format: { type: 'json_schema', strict: true } },
    });
    expect(analysisRequest.body.input[0]?.content[1]).toMatchObject({
      type: 'input_image',
      detail: 'original',
    });
    expect(analysisRequest.body.input[0]?.content[1]?.image_url).toMatch(/^data:image\/png;base64/);
    expect(analysisRequest.body.instructions).toContain('不可信数据');

    expect(reviewRequest.body.model).toBe('gpt-5.6-terra-review');
    expect(reviewRequest.body.store).toBe(false);
    expect(reviewRequest.body.input[0]?.content[0]?.text).toContain('候选草稿');
  });

  it('redacts gateway authentication failures behind a stable error', async () => {
    const provider = new OpenAIProvider({
      apiKey: 'invalid-test-key',
      baseURL: 'https://api.hostcentral.cc',
      model: 'gpt-5.6-terra',
      reviewModel: 'gpt-5.6-terra',
      reasoningEffort: 'xhigh',
      store: false,
      timeoutMs: 10_000,
      maxRetries: 0,
      maxOutputTokens: 16_000,
      fetch: async () =>
        new Response(JSON.stringify({ error: { message: 'upstream included sensitive data' } }), {
          status: 401,
          headers: { 'content-type': 'application/json' },
        }),
    });

    await expect(
      provider.analyze({
        image: Buffer.from([0x89, 0x50, 0x4e, 0x47]),
        mimeType: 'image/png',
        note: null,
        locale: 'zh-CN',
        timezone: 'Asia/Shanghai',
        now: new Date('2026-07-22T12:00:00+08:00'),
      }),
    ).rejects.toMatchObject({
      code: 'MODEL_AUTH_FAILED',
      message: 'Model gateway authentication failed',
    });
  });
});
