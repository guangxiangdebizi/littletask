import {
  actionCardSchema,
  activityResponseSchema,
  clearAllDataResponseSchema,
  createIntakeResponseSchema,
  dataSummarySchema,
  historyPageSchema,
  insightResponseSchema,
  intakeSchema,
  type ActionCard,
  type ActionPatchRequest,
  type ActivityEvent,
  type ClearAllDataResponse,
  type CreateIntakeResponse,
  type ExecutionDeviceContext,
  type DataSummary,
  type HistoryPage,
  type InsightResponse,
  type Intake,
} from '@littletask/contracts';
import type { ImagePickerAsset } from 'expo-image-picker';
import { Platform } from 'react-native';

import { API_ROOT } from './api-root';
import { clearDeviceToken, getDeviceToken, refreshDeviceToken } from './auth-session';

export { API_ROOT } from './api-root';

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
  const send = async (token: string) =>
    fetch(`${API_ROOT}${path}`, {
      ...init,
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${token}`,
        ...init?.headers,
      },
    });
  const token = await getDeviceToken();
  let response = await send(token);
  if (response.status === 401) {
    response = await send(await refreshDeviceToken(token));
  }
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

export async function getHistoryPage(cursor: string | null = null): Promise<HistoryPage> {
  const query = `limit=20${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`;
  return historyPageSchema.parse(await requestJson(`/history?${query}`));
}

export async function getActivity(intakeId: string): Promise<ActivityEvent[]> {
  return activityResponseSchema.parse(await requestJson(`/intakes/${intakeId}/activity`)).items;
}

export async function deleteIntake(intakeId: string): Promise<void> {
  await requestJson(`/intakes/${intakeId}`, { method: 'DELETE' });
}

export async function getDataSummary(): Promise<DataSummary> {
  return dataSummarySchema.parse(await requestJson('/data-summary'));
}

export async function clearAllData(): Promise<ClearAllDataResponse> {
  return clearAllDataResponseSchema.parse(await requestJson('/history', { method: 'DELETE' }));
}

export async function revokeDeviceSession(): Promise<void> {
  const response = await fetch(`${API_ROOT}/auth/device`, {
    method: 'DELETE',
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${await getDeviceToken()}`,
    },
  });
  if (!response.ok) {
    throw new ApiRequestError(
      'SESSION_REVOKE_FAILED',
      `Device session revoke failed with ${response.status}`,
      response.status,
    );
  }
  await clearDeviceToken();
}

export async function deleteAccount(): Promise<void> {
  const response = await fetch(`${API_ROOT}/account`, {
    method: 'DELETE',
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${await getDeviceToken()}`,
    },
  });
  if (!response.ok) {
    throw new ApiRequestError(
      'ACCOUNT_DELETE_FAILED',
      `Account deletion failed with ${response.status}`,
      response.status,
    );
  }
  await clearDeviceToken();
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
    deviceContext: ExecutionDeviceContext;
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
      deviceContext: input.deviceContext,
    }),
  });
  return actionCardSchema.parse(body);
}

export async function getInsights(intakeId: string): Promise<InsightResponse> {
  return insightResponseSchema.parse(await requestJson(`/intakes/${intakeId}/insights`));
}
