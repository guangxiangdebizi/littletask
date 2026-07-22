import { randomUUID } from 'node:crypto';

import {
  activityEventSchema,
  dataSummarySchema,
  groundedSuggestionInputSchema,
  type ActivityEvent,
  type ActionType,
  type DataSummary,
  type GroundedSuggestionInput,
  type Insight,
  type Intake,
} from '@littletask/contracts';

import { toHistoryItem } from '../history';
import type {
  AnalyzeInput,
  AuthPrincipal,
  ClaimedAnalysisJob,
  ClaimedSuggestionJob,
  DeviceSessionInput,
  ExecutionRecordInput,
  ExecutionRecord,
  IntakeStore,
  ModelRunRecord,
  ExecutionObservation,
  HistoryCursor,
  HistoryStorePage,
  SuggestionJobState,
} from '../types';

interface MemoryJob {
  id: string;
  intakeId: string;
  userId: string;
  status: 'queued' | 'processing' | 'retry' | 'succeeded' | 'failed';
  input: AnalyzeInput | null;
  attempts: number;
  maxAttempts: number;
  availableAt: number;
  lockedAt: number | null;
  lockedBy: string | null;
  lastErrorCode: string | null;
}

interface MemorySuggestionJob {
  id: string;
  intakeId: string;
  userId: string;
  status: 'queued' | 'processing' | 'retry' | 'succeeded' | 'failed';
  generation: number;
  inputHash: string;
  input: GroundedSuggestionInput;
  attempts: number;
  maxAttempts: number;
  availableAt: number;
  lockedAt: number | null;
  lockedBy: string | null;
  lastErrorCode: string | null;
}

interface MemoryExecution extends ExecutionRecordInput {
  id: string;
  createdAt: string;
}

interface MemoryConfirmation {
  id: string;
  actionId: string;
  revision: number;
  confirmedAt: string;
}

interface MemoryRevision {
  id: string;
  actionId: string;
  revision: number;
  source: 'ai' | 'user' | 'system';
  createdAt: string;
}

const emptyDeviceContext = {
  possibleDuplicateContactCount: 0,
  calendarConflictCount: 0,
  relatedContacts: [],
};

function cloneAnalyzeInput(input: AnalyzeInput): AnalyzeInput {
  return {
    ...input,
    image: Buffer.from(input.image),
    now: new Date(input.now),
  };
}

export class InMemoryIntakeStore implements IntakeStore {
  readonly #intakes = new Map<string, Intake>();
  readonly #owners = new Map<string, string>();
  readonly #deviceSessions = new Map<string, AuthPrincipal>();
  readonly #insights = new Map<string, Insight[]>();
  readonly #confirmations = new Map<string, MemoryConfirmation>();
  readonly #executions = new Map<string, MemoryExecution>();
  readonly #revisions: MemoryRevision[] = [];
  readonly #jobs = new Map<string, MemoryJob>();
  readonly #suggestionJobs = new Map<string, MemorySuggestionJob>();
  readonly #modelRuns: ModelRunRecord[] = [];

  async createDeviceSession(input: DeviceSessionInput): Promise<void> {
    if (this.#deviceSessions.has(input.tokenHash)) {
      throw new Error('Device session token already exists');
    }
    this.#deviceSessions.set(input.tokenHash, {
      userId: input.userId,
      deviceId: input.deviceId,
    });
  }

  async findDeviceSession(tokenHash: string): Promise<AuthPrincipal | undefined> {
    const session = this.#deviceSessions.get(tokenHash);
    return session ? structuredClone(session) : undefined;
  }

  async revokeDeviceSession(deviceId: string): Promise<void> {
    for (const [tokenHash, principal] of this.#deviceSessions) {
      if (principal.deviceId === deviceId) this.#deviceSessions.delete(tokenHash);
    }
  }

  async deleteUser(userId: string): Promise<boolean> {
    await this.deleteAll(userId);
    let found = false;
    for (const [tokenHash, principal] of this.#deviceSessions) {
      if (principal.userId !== userId) continue;
      found = true;
      this.#deviceSessions.delete(tokenHash);
    }
    return found;
  }

  async create(
    userId: string,
    intake: Intake,
    analysisInput: AnalyzeInput,
    maxAttempts: number,
  ): Promise<void> {
    if (this.#intakes.has(intake.id)) {
      throw new Error(`Intake already exists: ${intake.id}`);
    }
    this.#intakes.set(intake.id, structuredClone(intake));
    this.#owners.set(intake.id, userId);
    const id = randomUUID();
    this.#jobs.set(id, {
      id,
      intakeId: intake.id,
      userId,
      status: 'queued',
      input: cloneAnalyzeInput(analysisInput),
      attempts: 0,
      maxAttempts,
      availableAt: Date.now(),
      lockedAt: null,
      lockedBy: null,
      lastErrorCode: null,
    });
  }

  async get(userId: string, id: string): Promise<Intake | undefined> {
    if (this.#owners.get(id) !== userId) return undefined;
    const intake = this.#intakes.get(id);
    return intake ? structuredClone(intake) : undefined;
  }

  async list(userId: string): Promise<Intake[]> {
    return [...this.#intakes.values()]
      .filter((intake) => this.#owners.get(intake.id) === userId)
      .toSorted((left, right) => right.createdAt.localeCompare(left.createdAt))
      .map((intake) => structuredClone(intake));
  }

  async listHistory(
    userId: string,
    input: { limit: number; before?: HistoryCursor },
  ): Promise<HistoryStorePage> {
    const candidates = [...this.#intakes.values()]
      .filter(
        (intake) =>
          this.#owners.get(intake.id) === userId &&
          (!input.before ||
            intake.createdAt < input.before.createdAt ||
            (intake.createdAt === input.before.createdAt && intake.id < input.before.id)),
      )
      .toSorted(
        (left, right) =>
          right.createdAt.localeCompare(left.createdAt) || right.id.localeCompare(left.id),
      );
    const page = candidates.slice(0, input.limit + 1);
    return {
      items: page.slice(0, input.limit).map(toHistoryItem),
      hasMore: page.length > input.limit,
    };
  }

  async listActivity(userId: string, intakeId: string): Promise<ActivityEvent[]> {
    if (this.#owners.get(intakeId) !== userId) return [];
    const intake = this.#intakes.get(intakeId);
    if (!intake) return [];
    const actionTypes = new Map(intake.actions.map((action) => [action.id, action.type]));
    const actionIds = new Set(actionTypes.keys());
    const events: ActivityEvent[] = [
      activityEventSchema.parse({
        id: intake.id,
        type: 'intake_created',
        source: 'user',
        occurredAt: intake.createdAt,
      }),
    ];

    const latestModelRun = this.#modelRuns
      .filter((run) => run.intakeId === intakeId && ['analysis', 'review'].includes(run.stage))
      .toSorted((left, right) => right.completedAt.getTime() - left.completedAt.getTime())[0];
    if (latestModelRun && ['ready', 'failed'].includes(intake.status)) {
      events.push(
        activityEventSchema.parse({
          id: latestModelRun.id,
          type: intake.status === 'ready' ? 'analysis_completed' : 'analysis_failed',
          source: 'ai',
          ...(latestModelRun.errorCode ? { errorCode: latestModelRun.errorCode } : {}),
          occurredAt: latestModelRun.completedAt.toISOString(),
        }),
      );
    }

    for (const revision of this.#revisions.filter((item) => actionIds.has(item.actionId))) {
      events.push(
        this.activityForAction(actionTypes, {
          id: revision.id,
          type: 'action_revised',
          source: revision.source,
          actionId: revision.actionId,
          revision: revision.revision,
          occurredAt: revision.createdAt,
        }),
      );
    }
    for (const confirmation of this.#confirmations.values()) {
      if (!actionIds.has(confirmation.actionId)) continue;
      events.push(
        this.activityForAction(actionTypes, {
          id: confirmation.id,
          type: 'action_confirmed',
          source: 'user',
          actionId: confirmation.actionId,
          revision: confirmation.revision,
          occurredAt: confirmation.confirmedAt,
        }),
      );
    }
    for (const execution of this.#executions.values()) {
      if (!actionIds.has(execution.actionId)) continue;
      const errorCode = this.safeErrorCode(execution.errorMessage);
      events.push(
        this.activityForAction(actionTypes, {
          id: execution.id,
          type: execution.status === 'succeeded' ? 'execution_succeeded' : 'execution_failed',
          source: 'device',
          actionId: execution.actionId,
          ...(errorCode ? { errorCode } : {}),
          occurredAt: execution.createdAt,
        }),
      );
    }
    return events
      .toSorted((left, right) => right.occurredAt.localeCompare(left.occurredAt))
      .slice(0, 200);
  }

  async getDataSummary(userId: string): Promise<DataSummary> {
    const intakes = [...this.#intakes.values()].filter(
      (intake) => this.#owners.get(intake.id) === userId,
    );
    const intakeIds = new Set(intakes.map((intake) => intake.id));
    const actionIds = new Set(
      intakes.flatMap((intake) => intake.actions.map((action) => action.id)),
    );
    return dataSummarySchema.parse({
      intakes: intakes.length,
      actions: intakes.reduce((total, intake) => total + intake.actions.length, 0),
      executionResults: [...this.#executions.values()].filter((item) =>
        actionIds.has(item.actionId),
      ).length,
      insights: [...this.#insights.entries()]
        .filter(([intakeId]) => intakeIds.has(intakeId))
        .reduce((total, [, items]) => total + items.length, 0),
      temporaryScreenshots: [...this.#jobs.values()].filter(
        (job) => job.userId === userId && job.input !== null,
      ).length,
      screenshotsRetainedAfterAnalysis: false,
    });
  }

  async replace(
    userId: string,
    intake: Intake,
    revisionSource: 'ai' | 'user' | 'system' = 'system',
  ): Promise<void> {
    if (!this.#intakes.has(intake.id) || this.#owners.get(intake.id) !== userId) {
      throw new Error(`Intake not found: ${intake.id}`);
    }
    for (const action of intake.actions) {
      const exists = this.#revisions.some(
        (revision) => revision.actionId === action.id && revision.revision === action.revision,
      );
      if (!exists) {
        this.#revisions.push({
          id: randomUUID(),
          actionId: action.id,
          revision: action.revision,
          source: revisionSource,
          createdAt: action.updatedAt,
        });
      }
    }
    this.#intakes.set(intake.id, structuredClone(intake));
  }

  async delete(userId: string, id: string): Promise<boolean> {
    const intake = this.#intakes.get(id);
    if (!intake || this.#owners.get(id) !== userId) return false;
    const actionIds = new Set(intake.actions.map((action) => action.id));
    this.#insights.delete(id);
    for (const [jobId, job] of this.#jobs) {
      if (job.intakeId === id) this.#jobs.delete(jobId);
    }
    for (const [jobId, job] of this.#suggestionJobs) {
      if (job.intakeId === id) this.#suggestionJobs.delete(jobId);
    }
    for (const [key, confirmation] of this.#confirmations) {
      if (actionIds.has(confirmation.actionId)) this.#confirmations.delete(key);
    }
    for (const [key, execution] of this.#executions) {
      if (actionIds.has(execution.actionId)) this.#executions.delete(key);
    }
    this.#revisions.splice(
      0,
      this.#revisions.length,
      ...this.#revisions.filter((revision) => !actionIds.has(revision.actionId)),
    );
    this.#modelRuns.splice(
      0,
      this.#modelRuns.length,
      ...this.#modelRuns.filter((run) => run.intakeId !== id),
    );
    this.#owners.delete(id);
    return this.#intakes.delete(id);
  }

  async deleteAll(userId: string): Promise<number> {
    const ids = [...this.#owners.entries()]
      .filter(([, ownerId]) => ownerId === userId)
      .map(([intakeId]) => intakeId);
    for (const intakeId of ids) await this.delete(userId, intakeId);
    return ids.length;
  }

  async getInsights(userId: string, intakeId: string): Promise<Insight[]> {
    if (this.#owners.get(intakeId) !== userId) return [];
    return structuredClone(this.#insights.get(intakeId) ?? []);
  }

  async setRuleInsights(userId: string, intakeId: string, insights: Insight[]): Promise<void> {
    if (this.#owners.get(intakeId) !== userId) {
      throw new Error(`Intake not found: ${intakeId}`);
    }
    const modelInsights = (this.#insights.get(intakeId) ?? []).filter(
      (insight) => insight.generator === 'model',
    );
    this.#insights.set(
      intakeId,
      structuredClone([
        ...insights.filter((insight) => insight.generator === 'rules'),
        ...modelInsights,
      ]),
    );
  }

  async enqueueSuggestionJob(
    userId: string,
    input: GroundedSuggestionInput,
    inputHash: string,
    maxAttempts: number,
  ): Promise<boolean> {
    const parsedInput = groundedSuggestionInputSchema.parse(input);
    if (this.#owners.get(parsedInput.intakeId) !== userId) {
      throw new Error(`Intake not found: ${parsedInput.intakeId}`);
    }
    if (!/^[a-f0-9]{64}$/.test(inputHash)) {
      throw new Error('Suggestion input hash must be a lowercase SHA-256 value');
    }
    const existing = [...this.#suggestionJobs.values()].find(
      (job) => job.intakeId === parsedInput.intakeId,
    );
    if (existing?.inputHash === inputHash && existing.status !== 'failed') return false;

    if (existing) this.#suggestionJobs.delete(existing.id);
    const id = randomUUID();
    this.#suggestionJobs.set(id, {
      id,
      intakeId: parsedInput.intakeId,
      userId,
      status: 'queued',
      generation: (existing?.generation ?? 0) + 1,
      inputHash,
      input: structuredClone(parsedInput),
      attempts: 0,
      maxAttempts,
      availableAt: Date.now(),
      lockedAt: null,
      lockedBy: null,
      lastErrorCode: null,
    });
    this.#insights.set(
      parsedInput.intakeId,
      (this.#insights.get(parsedInput.intakeId) ?? []).filter(
        (insight) => insight.generator === 'rules',
      ),
    );
    return true;
  }

  async getSuggestionJobState(userId: string, intakeId: string): Promise<SuggestionJobState> {
    if (this.#owners.get(intakeId) !== userId) {
      return { status: 'not_requested', generation: null };
    }
    const job = [...this.#suggestionJobs.values()].find((item) => item.intakeId === intakeId);
    if (!job) return { status: 'not_requested', generation: null };
    const statuses = {
      queued: 'queued',
      retry: 'queued',
      processing: 'processing',
      succeeded: 'ready',
      failed: 'failed',
    } as const;
    return { status: statuses[job.status], generation: job.generation };
  }

  async claimSuggestionJob(
    workerId: string,
    staleAfterMs: number,
  ): Promise<ClaimedSuggestionJob | null> {
    const now = Date.now();
    const jobs = [...this.#suggestionJobs.values()].toSorted(
      (left, right) => left.availableAt - right.availableAt,
    );

    for (const job of jobs) {
      const abandoned =
        job.status === 'processing' && job.lockedAt !== null && job.lockedAt <= now - staleAfterMs;
      if (abandoned && job.attempts >= job.maxAttempts) {
        await this.failSuggestionJob(job.id, job.generation, 'JOB_LEASE_EXHAUSTED');
        continue;
      }
      const available =
        ((job.status === 'queued' || job.status === 'retry') && job.availableAt <= now) ||
        abandoned;
      if (!available || job.attempts >= job.maxAttempts) continue;

      job.status = 'processing';
      job.attempts += 1;
      job.lockedAt = now;
      job.lockedBy = workerId;
      return {
        ...structuredClone(job.input),
        jobId: job.id,
        userId: job.userId,
        generation: job.generation,
        attempt: job.attempts,
        maxAttempts: job.maxAttempts,
      };
    }
    return null;
  }

  async completeSuggestionJob(
    jobId: string,
    generation: number,
    insights: Insight[],
  ): Promise<boolean> {
    const job = this.#suggestionJobs.get(jobId);
    if (!job || job.generation !== generation || job.status !== 'processing') return false;
    const ruleInsights = (this.#insights.get(job.intakeId) ?? []).filter(
      (insight) => insight.generator === 'rules',
    );
    this.#insights.set(
      job.intakeId,
      structuredClone([
        ...ruleInsights,
        ...insights.filter((insight) => insight.generator === 'model'),
      ]),
    );
    job.status = 'succeeded';
    job.lockedAt = null;
    job.lockedBy = null;
    job.lastErrorCode = null;
    return true;
  }

  async rescheduleSuggestionJob(
    jobId: string,
    generation: number,
    delayMs: number,
    errorCode: string,
  ): Promise<void> {
    const job = this.#suggestionJobs.get(jobId);
    if (!job || job.generation !== generation) return;
    job.status = 'retry';
    job.availableAt = Date.now() + delayMs;
    job.lockedAt = null;
    job.lockedBy = null;
    job.lastErrorCode = errorCode;
  }

  async failSuggestionJob(jobId: string, generation: number, errorCode: string): Promise<void> {
    const job = this.#suggestionJobs.get(jobId);
    if (!job || job.generation !== generation) return;
    job.status = 'failed';
    job.lockedAt = null;
    job.lockedBy = null;
    job.lastErrorCode = errorCode;
  }

  async rememberConfirmation(
    userId: string,
    idempotencyKey: string,
    actionId: string,
    revision: number,
  ): Promise<string> {
    if (!this.ownsAction(userId, actionId)) throw new Error(`Action not found: ${actionId}`);
    const existing = this.#confirmations.get(idempotencyKey);
    if (existing) return existing.actionId;
    this.#confirmations.set(idempotencyKey, {
      id: randomUUID(),
      actionId,
      revision,
      confirmedAt: new Date().toISOString(),
    });
    return actionId;
  }

  async getConfirmation(userId: string, idempotencyKey: string): Promise<string | undefined> {
    const actionId = this.#confirmations.get(idempotencyKey)?.actionId;
    return actionId && this.ownsAction(userId, actionId) ? actionId : undefined;
  }

  async getExecution(userId: string, idempotencyKey: string): Promise<ExecutionRecord | undefined> {
    const execution = this.#executions.get(idempotencyKey);
    return execution && this.ownsAction(userId, execution.actionId)
      ? { actionId: execution.actionId, status: execution.status }
      : undefined;
  }

  async recordExecution(userId: string, input: ExecutionRecordInput): Promise<ExecutionRecord> {
    if (!this.ownsAction(userId, input.actionId))
      throw new Error(`Action not found: ${input.actionId}`);
    const existing = this.#executions.get(input.idempotencyKey);
    if (existing) return { actionId: existing.actionId, status: existing.status };
    this.#executions.set(
      input.idempotencyKey,
      structuredClone({
        id: randomUUID(),
        ...input,
        deviceContext: input.deviceContext ?? emptyDeviceContext,
        createdAt: new Date().toISOString(),
      }),
    );
    return { actionId: input.actionId, status: input.status };
  }

  async listExecutionObservations(
    userId: string,
    intakeId: string,
  ): Promise<ExecutionObservation[]> {
    if (this.#owners.get(intakeId) !== userId) return [];
    const actionIds = new Set(
      this.#intakes.get(intakeId)?.actions.map((action) => action.id) ?? [],
    );
    return [...this.#executions.values()]
      .filter((execution) => actionIds.has(execution.actionId))
      .toSorted((left, right) => left.createdAt.localeCompare(right.createdAt))
      .map((execution) => ({
        actionId: execution.actionId,
        status: execution.status,
        deviceContext: structuredClone(execution.deviceContext ?? emptyDeviceContext),
        errorCode:
          execution.errorMessage && /^[A-Z][A-Z0-9_]{1,79}$/.test(execution.errorMessage)
            ? execution.errorMessage
            : null,
        createdAt: execution.createdAt,
      }));
  }

  async claimAnalysisJob(
    workerId: string,
    staleAfterMs: number,
  ): Promise<ClaimedAnalysisJob | null> {
    const now = Date.now();
    const jobs = [...this.#jobs.values()].toSorted(
      (left, right) => left.availableAt - right.availableAt,
    );

    for (const job of jobs) {
      const abandoned =
        job.status === 'processing' && job.lockedAt !== null && job.lockedAt <= now - staleAfterMs;
      if (abandoned && job.attempts >= job.maxAttempts) {
        await this.failAnalysisJob(
          job.id,
          'JOB_LEASE_EXHAUSTED',
          'Analysis worker stopped before completing the job',
        );
        continue;
      }

      const available =
        ((job.status === 'queued' || job.status === 'retry') && job.availableAt <= now) ||
        abandoned;
      if (!available || !job.input || job.attempts >= job.maxAttempts) continue;

      job.status = 'processing';
      job.attempts += 1;
      job.lockedAt = now;
      job.lockedBy = workerId;
      return {
        ...cloneAnalyzeInput(job.input),
        jobId: job.id,
        intakeId: job.intakeId,
        userId: job.userId,
        attempt: job.attempts,
        maxAttempts: job.maxAttempts,
      };
    }
    return null;
  }

  async completeAnalysisJob(jobId: string): Promise<void> {
    const job = this.#jobs.get(jobId);
    if (!job) return;
    job.status = 'succeeded';
    job.input = null;
    job.lockedAt = null;
    job.lockedBy = null;
    job.lastErrorCode = null;
  }

  async rescheduleAnalysisJob(jobId: string, delayMs: number, errorCode: string): Promise<void> {
    const job = this.#jobs.get(jobId);
    if (!job) return;
    job.status = 'retry';
    job.availableAt = Date.now() + delayMs;
    job.lockedAt = null;
    job.lockedBy = null;
    job.lastErrorCode = errorCode;
    const intake = this.#intakes.get(job.intakeId);
    if (intake) {
      this.#intakes.set(job.intakeId, {
        ...intake,
        status: 'queued',
        error: null,
        updatedAt: new Date().toISOString(),
      });
    }
  }

  async failAnalysisJob(jobId: string, errorCode: string, message: string): Promise<void> {
    const job = this.#jobs.get(jobId);
    if (!job) return;
    job.status = 'failed';
    job.input = null;
    job.lockedAt = null;
    job.lockedBy = null;
    job.lastErrorCode = errorCode;
    const intake = this.#intakes.get(job.intakeId);
    if (intake) {
      this.#intakes.set(job.intakeId, {
        ...intake,
        status: 'failed',
        error: { code: errorCode, message },
        updatedAt: new Date().toISOString(),
      });
    }
  }

  async recordModelRun(run: ModelRunRecord): Promise<void> {
    if (!this.#intakes.has(run.intakeId)) return;
    this.#modelRuns.push(structuredClone(run));
  }

  async healthCheck(): Promise<void> {}

  async close(): Promise<void> {}

  private ownsAction(userId: string, actionId: string): boolean {
    const intake = [...this.#intakes.values()].find((candidate) =>
      candidate.actions.some((action) => action.id === actionId),
    );
    return Boolean(intake && this.#owners.get(intake.id) === userId);
  }

  private safeErrorCode(value: string | undefined): string | undefined {
    return value && /^[A-Z][A-Z0-9_]{1,79}$/.test(value) ? value : undefined;
  }

  private activityForAction(
    actionTypes: Map<string, ActionType>,
    input: Omit<ActivityEvent, 'actionType'> & { actionId: string },
  ): ActivityEvent {
    return activityEventSchema.parse({
      ...input,
      actionType: actionTypes.get(input.actionId),
    });
  }
}
