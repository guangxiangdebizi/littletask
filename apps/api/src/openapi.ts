import {
  actionCardSchema,
  actionConfirmationRequestSchema,
  actionPatchRequestSchema,
  activityResponseSchema,
  apiErrorSchema,
  clearAllDataResponseSchema,
  createIntakeResponseSchema,
  dataSummarySchema,
  deviceSessionResponseSchema,
  executionResultRequestSchema,
  historyPageSchema,
  insightResponseSchema,
  intakeSchema,
} from '@littletask/contracts';
import { z } from 'zod';

const bearerSecurity = [{ deviceBearer: [] }];
const idParameter = {
  name: 'id',
  in: 'path',
  required: true,
  schema: { type: 'string', format: 'uuid' },
} as const;

function componentSchema(schema: Parameters<typeof z.toJSONSchema>[0]) {
  const { $schema, ...definition } = z.toJSONSchema(schema);
  void $schema;
  return definition;
}

function jsonResponse(schema: string, description = 'Successful response') {
  return {
    description,
    content: {
      'application/json': { schema: { $ref: `#/components/schemas/${schema}` } },
    },
  };
}

const errorResponses = {
  '400': jsonResponse('ApiError', 'Invalid request'),
  '401': jsonResponse('ApiError', 'Missing or invalid device session'),
  '404': jsonResponse('ApiError', 'Resource not found for this user'),
  '409': jsonResponse('ApiError', 'Revision or idempotency conflict'),
  '429': jsonResponse('ApiError', 'Rate limit exceeded'),
} as const;

export const openapiDocument = {
  openapi: '3.1.0',
  info: {
    title: 'LittleTask API',
    version: '0.1.0',
    description:
      'Authenticated screenshot intake, confirmable Action Cards, device execution reports, history, and grounded insights. Contact and calendar mutations occur on the device only after explicit confirmation.',
  },
  servers: [
    { url: 'https://manbaout.com', description: 'Production' },
    { url: 'http://127.0.0.1:3100', description: 'Local development' },
  ],
  tags: [
    { name: 'Health' },
    { name: 'Authentication' },
    { name: 'Intakes' },
    { name: 'Actions' },
    { name: 'History' },
  ],
  paths: {
    '/api/health/live': {
      get: {
        tags: ['Health'],
        operationId: 'getLiveness',
        responses: {
          '200': {
            description: 'API process is alive',
            content: { 'application/json': { schema: { type: 'object' } } },
          },
        },
      },
    },
    '/api/health/ready': {
      get: {
        tags: ['Health'],
        operationId: 'getReadiness',
        responses: {
          '200': {
            description: 'API and persistence dependency are ready',
            content: { 'application/json': { schema: { type: 'object' } } },
          },
          '503': {
            description: 'Persistence dependency is unavailable',
            content: { 'application/json': { schema: { type: 'object' } } },
          },
        },
      },
    },
    '/api/v1/auth/device': {
      post: {
        tags: ['Authentication'],
        operationId: 'createDeviceSession',
        description: 'Creates an anonymous device session. Persist the bearer token in Keychain.',
        responses: {
          '201': jsonResponse('DeviceSession'),
          '429': errorResponses['429'],
        },
      },
      delete: {
        tags: ['Authentication'],
        operationId: 'revokeDeviceSession',
        security: bearerSecurity,
        responses: { '204': { description: 'Session revoked' }, '401': errorResponses['401'] },
      },
    },
    '/api/v1/account': {
      delete: {
        tags: ['Authentication'],
        operationId: 'deleteAnonymousAccount',
        security: bearerSecurity,
        description: 'Permanently deletes the anonymous user and all server-side records.',
        responses: {
          '204': { description: 'Account deleted' },
          '401': errorResponses['401'],
          '429': errorResponses['429'],
        },
      },
    },
    '/api/v1/intakes': {
      post: {
        tags: ['Intakes'],
        operationId: 'createIntake',
        security: bearerSecurity,
        description: 'Queues a screenshot for real multimodal analysis and independent review.',
        requestBody: {
          required: true,
          content: {
            'multipart/form-data': {
              schema: {
                type: 'object',
                required: ['screenshot'],
                properties: {
                  screenshot: { type: 'string', format: 'binary' },
                  note: { type: 'string', maxLength: 4000 },
                  locale: { type: 'string', maxLength: 40 },
                  timezone: { type: 'string', maxLength: 80 },
                  now: { type: 'string', format: 'date-time' },
                },
              },
            },
          },
        },
        responses: {
          '202': jsonResponse('CreateIntakeResponse'),
          ...errorResponses,
          '413': jsonResponse('ApiError', 'Screenshot exceeds the configured limit'),
          '415': jsonResponse('ApiError', 'Unsupported image media type'),
        },
      },
    },
    '/api/v1/intakes/{id}': {
      get: {
        tags: ['Intakes'],
        operationId: 'getIntake',
        security: bearerSecurity,
        parameters: [idParameter],
        responses: { '200': jsonResponse('Intake'), ...errorResponses },
      },
      delete: {
        tags: ['Intakes'],
        operationId: 'deleteIntake',
        security: bearerSecurity,
        parameters: [idParameter],
        responses: {
          '204': { description: 'Intake and dependent records deleted' },
          '401': errorResponses['401'],
          '404': errorResponses['404'],
        },
      },
    },
    '/api/v1/intakes/{id}/activity': {
      get: {
        tags: ['Intakes'],
        operationId: 'getIntakeActivity',
        security: bearerSecurity,
        parameters: [idParameter],
        responses: { '200': jsonResponse('ActivityResponse'), ...errorResponses },
      },
    },
    '/api/v1/intakes/{id}/insights': {
      get: {
        tags: ['Intakes'],
        operationId: 'getIntakeInsights',
        security: bearerSecurity,
        parameters: [idParameter],
        responses: { '200': jsonResponse('InsightResponse'), ...errorResponses },
      },
    },
    '/api/v1/actions/{id}': {
      patch: {
        tags: ['Actions'],
        operationId: 'reviseAction',
        security: bearerSecurity,
        parameters: [idParameter],
        requestBody: {
          required: true,
          content: {
            'application/json': { schema: { $ref: '#/components/schemas/ActionPatchRequest' } },
          },
        },
        responses: { '200': jsonResponse('ActionCard'), ...errorResponses },
      },
    },
    '/api/v1/actions/{id}/confirm': {
      post: {
        tags: ['Actions'],
        operationId: 'confirmAction',
        security: bearerSecurity,
        description: 'Confirms one exact immutable action revision. It does not mutate the device.',
        parameters: [idParameter],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/ActionConfirmationRequest' },
            },
          },
        },
        responses: { '200': jsonResponse('ActionCard'), ...errorResponses },
      },
    },
    '/api/v1/actions/{id}/execution-result': {
      post: {
        tags: ['Actions'],
        operationId: 'reportActionExecution',
        security: bearerSecurity,
        description: 'Reports a local mutation result after confirmation and device execution.',
        parameters: [idParameter],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/ExecutionResultRequest' },
            },
          },
        },
        responses: { '200': jsonResponse('ActionCard'), ...errorResponses },
      },
    },
    '/api/v1/history': {
      get: {
        tags: ['History'],
        operationId: 'listHistory',
        security: bearerSecurity,
        parameters: [
          { name: 'cursor', in: 'query', schema: { type: 'string', maxLength: 300 } },
          {
            name: 'limit',
            in: 'query',
            schema: { type: 'integer', minimum: 1, maximum: 50, default: 20 },
          },
        ],
        responses: { '200': jsonResponse('HistoryPage'), ...errorResponses },
      },
      delete: {
        tags: ['History'],
        operationId: 'deleteHistory',
        security: bearerSecurity,
        responses: { '200': jsonResponse('ClearAllDataResponse'), ...errorResponses },
      },
    },
    '/api/v1/data-summary': {
      get: {
        tags: ['History'],
        operationId: 'getDataSummary',
        security: bearerSecurity,
        responses: { '200': jsonResponse('DataSummary'), ...errorResponses },
      },
    },
  },
  components: {
    securitySchemes: {
      deviceBearer: { type: 'http', scheme: 'bearer', bearerFormat: 'LittleTask device token' },
    },
    schemas: {
      ApiError: componentSchema(apiErrorSchema),
      DeviceSession: componentSchema(deviceSessionResponseSchema),
      CreateIntakeResponse: componentSchema(createIntakeResponseSchema),
      Intake: componentSchema(intakeSchema),
      ActionCard: componentSchema(actionCardSchema),
      ActionPatchRequest: componentSchema(actionPatchRequestSchema),
      ActionConfirmationRequest: componentSchema(actionConfirmationRequestSchema),
      ExecutionResultRequest: componentSchema(executionResultRequestSchema),
      HistoryPage: componentSchema(historyPageSchema),
      ActivityResponse: componentSchema(activityResponseSchema),
      InsightResponse: componentSchema(insightResponseSchema),
      DataSummary: componentSchema(dataSummarySchema),
      ClearAllDataResponse: componentSchema(clearAllDataResponseSchema),
    },
  },
} as const;
