import { createHash, randomUUID } from 'node:crypto';

import {
  actionCardSchema,
  contactPayloadSchema,
  meetingPayloadSchema,
  updateContactPayloadSchema,
  type ActionCard,
  type ActionPatchRequest,
  type AnalysisDraft,
  type ExecutionResultRequest,
  type Intake,
} from '@littletask/contracts';
import { assertActionTransition, deriveInsights } from '@littletask/domain';

import type { AIProvider, AnalyzeInput, IntakeStore } from './types';

export class DomainError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly statusCode: number,
  ) {
    super(message);
  }
}

interface CreateIntakeInput extends AnalyzeInput {
  originalName: string | null;
}

export class IntakeService {
  constructor(
    private readonly store: IntakeStore,
    private readonly provider: AIProvider,
  ) {}

  create(input: CreateIntakeInput): Intake {
    const timestamp = new Date().toISOString();
    const intake: Intake = {
      id: randomUUID(),
      status: 'queued',
      note: input.note,
      locale: input.locale,
      timezone: input.timezone,
      image: {
        sha256: createHash('sha256').update(input.image).digest('hex'),
        mimeType: input.mimeType,
        bytes: input.image.byteLength,
        originalName: input.originalName,
      },
      summary: null,
      participants: [],
      facts: [],
      uncertainties: [],
      clarifyingQuestions: [],
      actions: [],
      error: null,
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    this.store.create(intake);
    void this.analyze(intake.id, input);
    return intake;
  }

  get(id: string): Intake {
    const intake = this.store.get(id);
    if (!intake) {
      throw new DomainError('INTAKE_NOT_FOUND', 'Intake not found', 404);
    }
    return intake;
  }

  list(): Intake[] {
    return this.store.list();
  }

  delete(id: string): void {
    if (!this.store.delete(id)) {
      throw new DomainError('INTAKE_NOT_FOUND', 'Intake not found', 404);
    }
  }

  patchAction(actionId: string, request: ActionPatchRequest): ActionCard {
    const { intake, actionIndex, action } = this.findAction(actionId);
    if (!['draft', 'needs_input', 'ready'].includes(action.status)) {
      throw new DomainError('ACTION_LOCKED', 'Confirmed actions can no longer be edited', 409);
    }
    if (action.revision !== request.expectedRevision) {
      throw new DomainError('ACTION_REVISION_CONFLICT', 'Action revision is stale', 409);
    }

    const payload = this.parseActionPayload(action, request.payload);
    const updated = actionCardSchema.parse({
      ...action,
      payload,
      revision: action.revision + 1,
      status: 'ready',
      updatedAt: new Date().toISOString(),
    });
    const actions = [...intake.actions];
    actions[actionIndex] = updated;
    this.store.replace({ ...intake, actions, updatedAt: updated.updatedAt });
    return updated;
  }

  confirmAction(actionId: string, expectedRevision: number, idempotencyKey: string): ActionCard {
    const previousActionId = this.store.getConfirmation(idempotencyKey);
    if (previousActionId) {
      if (previousActionId !== actionId) {
        throw new DomainError(
          'IDEMPOTENCY_CONFLICT',
          'Idempotency key belongs to another action',
          409,
        );
      }
      return this.findAction(actionId).action;
    }

    const { intake, actionIndex, action } = this.findAction(actionId);
    if (action.revision !== expectedRevision) {
      throw new DomainError('ACTION_REVISION_CONFLICT', 'Action revision is stale', 409);
    }
    assertActionTransition(action.status, 'confirmed');

    const updated = actionCardSchema.parse({
      ...action,
      status: 'confirmed',
      updatedAt: new Date().toISOString(),
    });
    const actions = [...intake.actions];
    actions[actionIndex] = updated;
    this.store.replace({ ...intake, actions, updatedAt: updated.updatedAt });
    this.store.rememberConfirmation(idempotencyKey, actionId);
    return updated;
  }

  reportExecution(actionId: string, request: ExecutionResultRequest): ActionCard {
    const confirmedActionId = this.store.getConfirmation(request.idempotencyKey);
    if (confirmedActionId !== actionId) {
      throw new DomainError(
        'ACTION_NOT_CONFIRMED',
        'Action must be confirmed before execution',
        409,
      );
    }

    const { intake, actionIndex, action } = this.findAction(actionId);
    if (action.status === request.status) {
      return action;
    }
    assertActionTransition(action.status, 'executing');
    assertActionTransition('executing', request.status);

    const updated = actionCardSchema.parse({
      ...action,
      status: request.status,
      updatedAt: new Date().toISOString(),
    });
    const actions = [...intake.actions];
    actions[actionIndex] = updated;
    const nextIntake = { ...intake, actions, updatedAt: updated.updatedAt };
    this.store.replace(nextIntake);
    this.store.setInsights(
      intake.id,
      deriveInsights(intake.id, actions, { createId: randomUUID, now: () => new Date() }),
    );
    return updated;
  }

  getInsights(intakeId: string) {
    this.get(intakeId);
    return this.store.getInsights(intakeId);
  }

  private async analyze(id: string, input: AnalyzeInput): Promise<void> {
    try {
      const queued = this.get(id);
      this.store.replace({ ...queued, status: 'processing', updatedAt: new Date().toISOString() });
      const draft = await this.provider.analyze(input);
      const reviewed = await this.provider.review(input, draft);
      const processing = this.get(id);
      this.store.replace(this.materializeAnalysis(processing, reviewed));
    } catch (error) {
      const intake = this.store.get(id);
      if (!intake) return;
      this.store.replace({
        ...intake,
        status: 'failed',
        error: {
          code: 'ANALYSIS_FAILED',
          message: error instanceof Error ? error.message : 'Analysis failed',
        },
        updatedAt: new Date().toISOString(),
      });
    }
  }

  private materializeAnalysis(intake: Intake, draft: AnalysisDraft): Intake {
    const timestamp = new Date().toISOString();
    const actions = draft.actions.map((proposal) =>
      actionCardSchema.parse({
        ...proposal,
        id: randomUUID(),
        revision: 1,
        status: proposal.confidence === 'low' ? 'needs_input' : 'ready',
        createdAt: timestamp,
        updatedAt: timestamp,
      }),
    );
    const clarifyingQuestions = draft.clarifyingQuestions.map((question) => ({
      id: randomUUID(),
      prompt: question.prompt,
      options: question.options,
      actionId: question.actionIndex === undefined ? undefined : actions[question.actionIndex]?.id,
    }));

    return {
      ...intake,
      status: 'ready',
      summary: draft.summary,
      participants: draft.participants,
      facts: draft.facts,
      uncertainties: draft.uncertainties,
      clarifyingQuestions,
      actions,
      error: null,
      updatedAt: timestamp,
    };
  }

  private findAction(actionId: string): {
    intake: Intake;
    actionIndex: number;
    action: ActionCard;
  } {
    for (const intake of this.store.list()) {
      const actionIndex = intake.actions.findIndex((candidate) => candidate.id === actionId);
      if (actionIndex >= 0) {
        const action = intake.actions[actionIndex];
        if (action) return { intake, actionIndex, action };
      }
    }
    throw new DomainError('ACTION_NOT_FOUND', 'Action not found', 404);
  }

  private parseActionPayload(action: ActionCard, payload: unknown) {
    switch (action.type) {
      case 'create_event':
        return meetingPayloadSchema.parse(payload);
      case 'create_contact':
        return contactPayloadSchema.parse(payload);
      case 'update_contact':
        return updateContactPayloadSchema.parse(payload);
    }
  }
}
