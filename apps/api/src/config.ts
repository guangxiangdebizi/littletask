import { z } from 'zod';

const disabledBooleanSchema = z.preprocess(
  (value) => (value === undefined || value === 'false' ? false : value),
  z.literal(false),
);
const optionalSecretSchema = z.preprocess(
  (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
  z.string().min(1).optional(),
);
const booleanSchema = z.preprocess(
  (value) => (value === 'true' ? true : value === 'false' || value === undefined ? false : value),
  z.boolean(),
);

const environmentSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    HOST: z.string().default('127.0.0.1'),
    TRUST_PROXY: booleanSchema,
    PORT: z.coerce.number().int().min(1).max(65_535).default(3100),
    LOG_LEVEL: z
      .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
      .default('info'),
    WEB_ORIGIN: z.string().default('http://localhost:8081'),
    PERSISTENCE_PROVIDER: z.enum(['memory', 'postgres']).default('memory'),
    DATABASE_URL: optionalSecretSchema,
    JOB_MAX_ATTEMPTS: z.coerce.number().int().min(1).max(10).default(3),
    JOB_LEASE_MS: z.coerce
      .number()
      .int()
      .min(1_000)
      .max(60 * 60_000)
      .default(5 * 60_000),
    JOB_POLL_MS: z.coerce.number().int().min(100).max(60_000).default(1_000),
    MAX_UPLOAD_BYTES: z.coerce
      .number()
      .int()
      .min(1)
      .max(25 * 1024 * 1024)
      .default(10 * 1024 * 1024),
    RATE_LIMIT_REQUESTS: z.coerce.number().int().min(10).max(10_000).default(240),
    RATE_LIMIT_UPLOADS: z.coerce.number().int().min(1).max(1_000).default(20),
    RATE_LIMIT_REGISTRATIONS: z.coerce.number().int().min(1).max(100).default(10),
    RATE_LIMIT_WINDOW_MS: z.coerce
      .number()
      .int()
      .min(10_000)
      .max(60 * 60_000)
      .default(60_000),
    IMAGE_RETENTION: z.literal('none').default('none'),
    AI_PROVIDER: z.enum(['fake', 'openai']).default('openai'),
    OPENAI_BASE_URL: z.literal('https://api.hostcentral.cc').default('https://api.hostcentral.cc'),
    OPENAI_WIRE_API: z.literal('responses').default('responses'),
    OPENAI_API_KEY: optionalSecretSchema,
    OPENAI_MODEL: z.literal('gpt-5.6-terra').default('gpt-5.6-terra'),
    OPENAI_REVIEW_MODEL: z.literal('gpt-5.6-terra').default('gpt-5.6-terra'),
    OPENAI_REASONING_EFFORT: z.literal('xhigh').default('xhigh'),
    OPENAI_STORE: disabledBooleanSchema,
    OPENAI_TIMEOUT_MS: z.coerce.number().int().min(1_000).max(600_000).default(180_000),
    OPENAI_MAX_RETRIES: z.coerce.number().int().min(0).max(5).default(2),
    OPENAI_MAX_OUTPUT_TOKENS: z.coerce.number().int().min(1_000).max(100_000).default(16_000),
    AI_NETWORK_ACCESS: z.literal('enabled').default('enabled'),
  })
  .superRefine((value, context) => {
    if (value.NODE_ENV !== 'test' && value.AI_PROVIDER !== 'openai') {
      context.addIssue({
        code: 'custom',
        message: 'The fake AI provider is restricted to NODE_ENV=test',
        path: ['AI_PROVIDER'],
      });
    }

    if (value.AI_PROVIDER === 'openai' && !value.OPENAI_API_KEY) {
      context.addIssue({
        code: 'custom',
        message: 'OPENAI_API_KEY is required when AI_PROVIDER=openai',
        path: ['OPENAI_API_KEY'],
      });
    }

    if (value.PERSISTENCE_PROVIDER === 'postgres' && !value.DATABASE_URL) {
      context.addIssue({
        code: 'custom',
        message: 'DATABASE_URL is required when PERSISTENCE_PROVIDER=postgres',
        path: ['DATABASE_URL'],
      });
    }

    if (value.NODE_ENV === 'production' && value.PERSISTENCE_PROVIDER !== 'postgres') {
      context.addIssue({
        code: 'custom',
        message: 'Production requires PERSISTENCE_PROVIDER=postgres',
        path: ['PERSISTENCE_PROVIDER'],
      });
    }
    if (value.NODE_ENV === 'production' && !value.TRUST_PROXY) {
      context.addIssue({
        code: 'custom',
        message: 'Production behind Nginx requires TRUST_PROXY=true',
        path: ['TRUST_PROXY'],
      });
    }
    if (value.NODE_ENV === 'production' && value.HOST !== '127.0.0.1') {
      context.addIssue({
        code: 'custom',
        message: 'Production API must remain bound to 127.0.0.1 behind Nginx',
        path: ['HOST'],
      });
    }
  });

export type AppConfig = z.infer<typeof environmentSchema>;

export function loadConfig(environment: NodeJS.ProcessEnv = process.env): AppConfig {
  return environmentSchema.parse(environment);
}
