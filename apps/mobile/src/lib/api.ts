import {
  actionCardSchema,
  createIntakeResponseSchema,
  insightSchema,
  intakeSchema,
  type ActionCard,
  type ActionPatchRequest,
  type CreateIntakeResponse,
  type Insight,
  type Intake,
} from '@littletask/contracts';
import type { ImagePickerAsset } from 'expo-image-picker';
import { Platform } from 'react-native';

function resolveApiRoot(): string {
  const configured = process.env.EXPO_PUBLIC_API_URL?.replace(/\/$/, '');
  if (configured) return configured;

  if (Platform.OS === 'web' && typeof globalThis.location !== 'undefined') {
    const { origin, hostname } = globalThis.location;
    if (hostname !== 'localhost' && hostname !== '127.0.0.1') {
      return `${origin}/api/v1`;
    }
  }

  return 'http://127.0.0.1:3100/api/v1';
}

export const API_ROOT = resolveApiRoot();

export class ApiRequestError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

async function requestJson(path: string, init?: RequestInit): Promise<unknown> {
  const response = await fetch(`${API_ROOT}${path}`, {
    ...init,
    headers: {
      Accept: 'application/json',
      ...init?.headers,
    },
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as {
      error?: { code?: string; message?: string };
    } | null;
    throw new ApiRequestError(
      body?.error?.code ?? 'REQUEST_FAILED',
      body?.error?.message ?? `Request failed with ${response.status}`,
      response.status,
    );
  }
  if (response.status === 204) return null;
  return response.json();
}

async function appendScreenshot(form: FormData, screenshot: ImagePickerAsset): Promise<void> {
  const filename = screenshot.fileName || 'chat-screenshot.jpg';
  const mimeType = screenshot.mimeType || 'image/jpeg';

  if (Platform.OS === 'web') {
    if (screenshot.file) {
      form.append('screenshot', screenshot.file, filename);
      return;
    }
    const response = await fetch(screenshot.uri);
    form.append('screenshot', await response.blob(), filename);
    return;
  }

  form.append('screenshot', {
    uri: screenshot.uri,
    name: filename,
    type: mimeType,
  } as unknown as Blob);
}

export async function createIntake(input: {
  screenshot: ImagePickerAsset;
  note: string;
}): Promise<CreateIntakeResponse> {
  const form = new FormData();
  await appendScreenshot(form, input.screenshot);
  form.append('note', input.note.trim());
  form.append('locale', Intl.DateTimeFormat().resolvedOptions().locale || 'zh-CN');
  form.append('timezone', Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Shanghai');
  form.append('now', new Date().toISOString());

  const body = await requestJson('/intakes', { method: 'POST', body: form });
  return createIntakeResponseSchema.parse(body);
}

export async function getIntake(id: string): Promise<Intake> {
  return intakeSchema.parse(await requestJson(`/intakes/${id}`));
}

export async function getHistory(): Promise<Intake[]> {
  const response = (await requestJson('/history')) as { items?: unknown[] };
  return intakeSchema.array().parse(response.items ?? []);
}

export async function patchAction(
  action: ActionCard,
  payload: ActionPatchRequest['payload'],
): Promise<ActionCard> {
  const body = await requestJson(`/actions/${action.id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ expectedRevision: action.revision, payload }),
  });
  return actionCardSchema.parse(body);
}

export async function confirmAction(
  action: ActionCard,
  idempotencyKey: string,
): Promise<ActionCard> {
  const body = await requestJson(`/actions/${action.id}/confirm`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ expectedRevision: action.revision, idempotencyKey }),
  });
  return actionCardSchema.parse(body);
}

export async function reportActionExecution(
  actionId: string,
  input: {
    confirmationKey: string;
    executionKey: string;
    status: 'succeeded' | 'failed';
    nativeRecordRef?: string;
    errorMessage?: string;
  },
): Promise<ActionCard> {
  const body = await requestJson(`/actions/${actionId}/execution-result`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      idempotencyKey: input.executionKey,
      confirmationIdempotencyKey: input.confirmationKey,
      status: input.status,
      ...(input.nativeRecordRef ? { nativeRecordRef: input.nativeRecordRef } : {}),
      ...(input.errorMessage ? { errorMessage: input.errorMessage } : {}),
    }),
  });
  return actionCardSchema.parse(body);
}

export async function getInsights(intakeId: string): Promise<Insight[]> {
  const response = (await requestJson(`/intakes/${intakeId}/insights`)) as { items?: unknown[] };
  return insightSchema.array().parse(response.items ?? []);
}
