import { z } from 'zod';

const disabledBooleanSchema = z.preprocess(
  (value) => (value === undefined || value === 'false' ? false : value),
  z.literal(false),
);
const optionalSecretSchema = z.preprocess(
  (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
  z.string().min(1).optional(),
);

const environmentSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    HOST: z.string().default('127.0.0.1'),
    PORT: z.coerce.number().int().min(1).max(65_535).default(3100),
    LOG_LEVEL: z
      .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
      .default('info'),
    WEB_ORIGIN: z.string().default('http://localhost:8081'),
    MAX_UPLOAD_BYTES: z.coerce
      .number()
      .int()
      .min(1)
      .max(25 * 1024 * 1024)
      .default(10 * 1024 * 1024),
    IMAGE_RETENTION: z.literal('none').default('none'),
    AI_PROVIDER: z.enum(['fake', 'openai']).default('fake'),
    OPENAI_BASE_URL: z.url().default('https://api.hostcentral.cc'),
    OPENAI_WIRE_API: z.literal('responses').default('responses'),
    OPENAI_API_KEY: optionalSecretSchema,
    OPENAI_MODEL: z.string().min(1).default('gpt-5.6-terra'),
    OPENAI_REVIEW_MODEL: z.string().min(1).default('gpt-5.6-terra'),
    OPENAI_REASONING_EFFORT: z.literal('xhigh').default('xhigh'),
    OPENAI_STORE: disabledBooleanSchema,
    OPENAI_TIMEOUT_MS: z.coerce.number().int().min(1_000).max(600_000).default(180_000),
    OPENAI_MAX_RETRIES: z.coerce.number().int().min(0).max(5).default(2),
    OPENAI_MAX_OUTPUT_TOKENS: z.coerce.number().int().min(1_000).max(100_000).default(16_000),
    AI_NETWORK_ACCESS: z.literal('enabled').default('enabled'),
  })
  .superRefine((value, context) => {
    if (value.AI_PROVIDER === 'openai' && !value.OPENAI_API_KEY) {
      context.addIssue({
        code: 'custom',
        message: 'OPENAI_API_KEY is required when AI_PROVIDER=openai',
        path: ['OPENAI_API_KEY'],
      });
    }
  });

export type AppConfig = z.infer<typeof environmentSchema>;

export function loadConfig(environment: NodeJS.ProcessEnv = process.env): AppConfig {
  return environmentSchema.parse(environment);
}
