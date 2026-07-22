import { z } from 'zod';

import { contactPayloadSchema, meetingPayloadSchema, updateContactPayloadSchema } from './actions';

export const apiErrorSchema = z.object({
  error: z.object({
    code: z.string().min(1),
    message: z.string().min(1),
    requestId: z.string().optional(),
    details: z.unknown().optional(),
  }),
});

export const actionPatchRequestSchema = z.object({
  expectedRevision: z.number().int().positive(),
  payload: z.union([meetingPayloadSchema, contactPayloadSchema, updateContactPayloadSchema]),
});

export const actionConfirmationRequestSchema = z.object({
  expectedRevision: z.number().int().positive(),
  idempotencyKey: z.string().uuid(),
});

export const executionDeviceContextSchema = z.object({
  possibleDuplicateContactCount: z.number().int().min(0).max(8),
  calendarConflictCount: z.number().int().min(0).max(8),
});

export const executionResultRequestSchema = z.object({
  idempotencyKey: z.string().uuid(),
  confirmationIdempotencyKey: z.string().uuid().optional(),
  status: z.enum(['succeeded', 'failed']),
  nativeRecordRef: z.string().max(300).optional(),
  errorMessage: z.string().max(500).optional(),
  deviceContext: executionDeviceContextSchema.optional(),
});

export const deviceSessionResponseSchema = z.object({
  userId: z.string().uuid(),
  deviceId: z.string().uuid(),
  token: z.string().regex(/^lt_[A-Za-z0-9_-]{43}$/),
});

export type ApiError = z.infer<typeof apiErrorSchema>;
export type ActionPatchRequest = z.infer<typeof actionPatchRequestSchema>;
export type ActionConfirmationRequest = z.infer<typeof actionConfirmationRequestSchema>;
export type ExecutionResultRequest = z.infer<typeof executionResultRequestSchema>;
export type ExecutionDeviceContext = z.infer<typeof executionDeviceContextSchema>;
export type DeviceSessionResponse = z.infer<typeof deviceSessionResponseSchema>;
