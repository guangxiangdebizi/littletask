import {
  apiErrorSchema,
  createIntakeResponseSchema,
  deviceSessionResponseSchema,
  intakeSchema,
  type Intake,
} from '@littletask/contracts';
import { setTimeout as wait } from 'node:timers/promises';

import { evalCases, type EvalCase } from './cases';
import { renderSyntheticScreenshot } from './render';
import { scoreIntake, sortedActionTypes } from './score';

interface EvalCaseResult {
  id: string;
  passed: boolean;
  durationMs: number;
  actionTypes: string[];
  errors: string[];
}

interface EvalRuntime {
  apiRoot: string;
  timeoutMs: number;
}

class EvalError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = 'EvalError';
  }
}

async function main(): Promise<void> {
  const runtime = { apiRoot: readApiRoot(), timeoutMs: readTimeout() };
  const selectedCases = selectCases();
  const startedAt = new Date();
  const token = await registerDevice(runtime);
  const results: EvalCaseResult[] = [];
  let cleanupError: string | null = null;

  try {
    for (const testCase of selectedCases) {
      results.push(await runCase(runtime, token, testCase));
    }
  } finally {
    try {
      await request(runtime, token, '/account', { method: 'DELETE' });
    } catch (error) {
      cleanupError = safeEvalError(error);
    }
  }

  const passed = results.filter((result) => result.passed).length;
  const report = {
    schemaVersion: 1,
    targetOrigin: new URL(runtime.apiRoot).origin,
    startedAt: startedAt.toISOString(),
    completedAt: new Date().toISOString(),
    total: results.length,
    passed,
    failed: results.length - passed,
    cleanup: cleanupError ? { status: 'failed', error: cleanupError } : { status: 'succeeded' },
    cases: results,
  };
  console.log(JSON.stringify(report, null, 2));
  if (passed !== results.length || cleanupError) process.exitCode = 1;
}

async function runCase(
  runtime: EvalRuntime,
  token: string,
  testCase: EvalCase,
): Promise<EvalCaseResult> {
  const started = Date.now();
  let intakeId: string | null = null;
  try {
    const screenshot = await renderSyntheticScreenshot(testCase);
    const form = new FormData();
    form.append(
      'screenshot',
      new Blob([Uint8Array.from(screenshot)], { type: 'image/png' }),
      `${testCase.id}.png`,
    );
    form.append('note', testCase.note);
    form.append('locale', testCase.locale);
    form.append('timezone', testCase.timezone);
    form.append('now', testCase.now);
    const created = createIntakeResponseSchema.safeParse(
      await requestJson(runtime, token, '/intakes', { method: 'POST', body: form }),
    );
    if (!created.success) throw new EvalError('CREATE_RESPONSE_INVALID');
    intakeId = created.data.id;
    const intake = await waitForIntake(runtime, token, intakeId);
    const errors = scoreIntake(intake, testCase.expected);
    return {
      id: testCase.id,
      passed: errors.length === 0,
      durationMs: Date.now() - started,
      actionTypes: sortedActionTypes(intake),
      errors,
    };
  } catch (error) {
    return {
      id: testCase.id,
      passed: false,
      durationMs: Date.now() - started,
      actionTypes: [],
      errors: [safeEvalError(error)],
    };
  } finally {
    if (intakeId) {
      await request(runtime, token, `/intakes/${intakeId}`, { method: 'DELETE' }).catch(
        () => undefined,
      );
    }
  }
}

async function waitForIntake(
  runtime: EvalRuntime,
  token: string,
  intakeId: string,
): Promise<Intake> {
  const deadline = Date.now() + runtime.timeoutMs;
  while (Date.now() < deadline) {
    const parsed = intakeSchema.safeParse(
      await requestJson(runtime, token, `/intakes/${intakeId}`),
    );
    if (!parsed.success) throw new EvalError('INTAKE_RESPONSE_INVALID');
    if (parsed.data.status === 'ready' || parsed.data.status === 'failed') return parsed.data;
    await wait(1_000);
  }
  throw new EvalError('INTAKE_TIMEOUT');
}

async function registerDevice(runtime: EvalRuntime): Promise<string> {
  const response = await fetch(`${runtime.apiRoot}/auth/device`, {
    method: 'POST',
    headers: { Accept: 'application/json' },
  });
  if (!response.ok) throw new EvalError(`REGISTER_HTTP_${response.status}`);
  const parsed = deviceSessionResponseSchema.safeParse(await response.json().catch(() => null));
  if (!parsed.success) throw new EvalError('REGISTER_RESPONSE_INVALID');
  return parsed.data.token;
}

async function requestJson(
  runtime: EvalRuntime,
  token: string,
  path: string,
  init?: RequestInit,
): Promise<unknown> {
  const response = await request(runtime, token, path, init);
  return response.json().catch(() => {
    throw new EvalError('RESPONSE_JSON_INVALID');
  });
}

async function request(
  runtime: EvalRuntime,
  token: string,
  path: string,
  init?: RequestInit,
): Promise<Response> {
  const response = await fetch(`${runtime.apiRoot}${path}`, {
    ...init,
    headers: {
      Accept: 'application/json',
      ...init?.headers,
      Authorization: `Bearer ${token}`,
    },
  });
  if (response.ok) return response;
  const parsed = apiErrorSchema.safeParse(await response.json().catch(() => null));
  const code =
    parsed.success && /^[A-Z][A-Z0-9_]{1,79}$/.test(parsed.data.error.code)
      ? parsed.data.error.code
      : `HTTP_${response.status}`;
  throw new EvalError(code);
}

function selectCases(): EvalCase[] {
  const requested = process.env.EVAL_CASES?.split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  if (!requested || requested.length === 0) return evalCases;
  const byId = new Map(evalCases.map((testCase) => [testCase.id, testCase]));
  return requested.map((id) => {
    const testCase = byId.get(id);
    if (!testCase) throw new EvalError('UNKNOWN_EVAL_CASE');
    return testCase;
  });
}

function readApiRoot(): string {
  const value = (process.env.EVAL_API_ROOT ?? 'http://127.0.0.1:3100/api/v1').replace(/\/$/, '');
  const url = new URL(value);
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    !url.pathname.endsWith('/api/v1')
  ) {
    throw new EvalError('EVAL_API_ROOT_INVALID');
  }
  return value;
}

function readTimeout(): number {
  const value = Number(process.env.EVAL_TIMEOUT_MS ?? 360_000);
  if (!Number.isInteger(value) || value < 30_000 || value > 600_000) {
    throw new EvalError('EVAL_TIMEOUT_INVALID');
  }
  return value;
}

function safeEvalError(error: unknown): string {
  return error instanceof EvalError ? error.code : 'UNEXPECTED_EVAL_ERROR';
}

void main().catch((error) => {
  console.error(JSON.stringify({ error: safeEvalError(error) }));
  process.exitCode = 1;
});
