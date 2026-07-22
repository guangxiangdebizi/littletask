import OpenAI from 'openai';
import { zodTextFormat } from 'openai/helpers/zod';
import sharp from 'sharp';

import type { AnalyzeInput } from './types';
import { ANALYSIS_INSTRUCTIONS, buildAnalysisContext } from './providers/openai-provider';
import { modelAnalysisDraftSchema, toAnalysisDraft } from './providers/model-schema';

const apiKey = process.env.OPENAI_API_KEY;
if (!apiKey) throw new Error('OPENAI_API_KEY is required');

const input: AnalyzeInput = {
  image: await renderProbeScreenshot(),
  mimeType: 'image/png',
  note: null,
  locale: 'zh-CN',
  timezone: 'Asia/Shanghai',
  now: new Date('2026-07-22T10:00:00+08:00'),
};

const client = new OpenAI({
  apiKey,
  baseURL: 'https://api.hostcentral.cc',
  timeout: 180_000,
  maxRetries: 0,
});

const response = await client.responses.create({
  model: 'gpt-5.6-terra',
  instructions: ANALYSIS_INSTRUCTIONS,
  input: [
    {
      role: 'user',
      content: [
        { type: 'input_text', text: buildAnalysisContext(input) },
        {
          type: 'input_image',
          image_url: `data:image/png;base64,${input.image.toString('base64')}`,
          detail: 'original',
        },
      ],
    },
  ],
  reasoning: { effort: 'xhigh' },
  store: false,
  max_output_tokens: 16_000,
  text: { format: zodTextFormat(modelAnalysisDraftSchema, 'littletask_capability_probe') },
});

let jsonValue: unknown;
let jsonValid = false;
try {
  jsonValue = JSON.parse(response.output_text);
  jsonValid = true;
} catch {
  jsonValue = null;
}

const modelResult = modelAnalysisDraftSchema.safeParse(jsonValue);
let domainValid = false;
if (modelResult.success) {
  try {
    toAnalysisDraft(modelResult.data);
    domainValid = true;
  } catch {
    domainValid = false;
  }
}

const report = {
  schemaVersion: 1,
  gateway: 'api.hostcentral.cc',
  model: 'gpt-5.6-terra',
  reasoningEffort: 'xhigh',
  store: false,
  responseIdPresent: /^[A-Za-z0-9_-]{1,255}$/.test(response.id),
  status: response.status,
  incompleteReason: response.incomplete_details?.reason ?? null,
  outputTypes: response.output.map((item) => item.type),
  outputTextBytes: Buffer.byteLength(response.output_text, 'utf8'),
  jsonValid,
  outputShape: describeObject(jsonValue),
  firstActionShape: describeObject(readObjectArrayItem(jsonValue, 'actions', 0)),
  firstPayloadShape: describeObject(
    readObject(readObjectArrayItem(jsonValue, 'actions', 0), 'payload'),
  ),
  firstEvidenceShape: describeObject(
    readObjectArrayItem(readObjectArrayItem(jsonValue, 'actions', 0), 'evidence', 0),
  ),
  modelSchemaValid: modelResult.success,
  modelIssues: modelResult.success
    ? []
    : modelResult.error.issues.slice(0, 12).map((issue) => ({
        path: issue.path.join('.') || '<root>',
        code: issue.code,
      })),
  domainSchemaValid: domainValid,
};

console.log(JSON.stringify(report, null, 2));
if (response.status !== 'completed' || !modelResult.success || !domainValid) process.exitCode = 1;

async function renderProbeScreenshot(): Promise<Buffer> {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="700">
    <rect width="1000" height="700" fill="#eef1f4"/>
    <rect x="70" y="100" width="760" height="170" rx="8" fill="#ffffff"/>
    <text x="105" y="170" font-family="Arial, sans-serif" font-size="34" fill="#17212b">Meet Alex on July 24, 2026 at 3:00 PM.</text>
    <text x="105" y="225" font-family="Arial, sans-serif" font-size="34" fill="#17212b">Location: Innovation Center, second floor.</text>
    <rect x="170" y="315" width="760" height="120" rx="8" fill="#dff4e8"/>
    <text x="205" y="385" font-family="Arial, sans-serif" font-size="34" fill="#17212b">Confirmed. Reserve one hour.</text>
  </svg>`;
  return sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toBuffer();
}

function describeObject(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value)
      .slice(0, 30)
      .map(([key, item]) => [
        key,
        Array.isArray(item) ? 'array' : item === null ? 'null' : typeof item,
      ]),
  );
}

function readObject(value: unknown, key: string): unknown {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)[key]
    : undefined;
}

function readObjectArrayItem(value: unknown, key: string, index: number): unknown {
  const candidate = readObject(value, key);
  return Array.isArray(candidate) ? candidate[index] : undefined;
}
