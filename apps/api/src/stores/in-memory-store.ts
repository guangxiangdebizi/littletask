import { randomUUID } from 'node:crypto';

import type { Insight, Intake } from '@littletask/contracts';

import type {
  AnalyzeInput,
  ClaimedAnalysisJob,
  ExecutionRecordInput,
  ExecutionRecord,
  IntakeStore,
  ModelRunRecord,
} from '../types';

interface MemoryJob {
  id: string;
  intakeId: string;
  status: 'queued' | 'processing' | 'retry' | 'succeeded' | 'failed';
  input: AnalyzeInput | null;
  attempts: number;
  maxAttempts: number;
  availableAt: number;
  lockedAt: number | null;
  lockedBy: string | null;
  lastErrorCode: string | null;
}

function cloneAnalyzeInput(input: AnalyzeInput): AnalyzeInput {
  return {
    ...input,
    image: Buffer.from(input.image),
    now: new Date(input.now),
  };
}

export class InMemoryIntakeStore implements IntakeStore {
  readonly #intakes = new Map<string, Intake>();
  readonly #insights = new Map<string, Insight[]>();
  readonly #confirmations = new Map<string, { actionId: string; revision: number }>();
  readonly #executions = new Map<string, ExecutionRecordInput>();
  readonly #jobs = new Map<string, MemoryJob>();
  readonly #modelRuns: ModelRunRecord[] = [];

  async create(intake: Intake, analysisInput: AnalyzeInput, maxAttempts: number): Promise<void> {
    if (this.#intakes.has(intake.id)) {
      throw new Error(`Intake already exists: ${intake.id}`);
    }
    this.#intakes.set(intake.id, structuredClone(intake));
    const id = randomUUID();
    this.#jobs.set(id, {
      id,
      intakeId: intake.id,
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

  async get(id: string): Promise<Intake | undefined> {
    const intake = this.#intakes.get(id);
    return intake ? structuredClone(intake) : undefined;
  }

  async list(): Promise<Intake[]> {
    return [...this.#intakes.values()]
      .toSorted((left, right) => right.createdAt.localeCompare(left.createdAt))
      .map((intake) => structuredClone(intake));
  }

  async replace(intake: Intake): Promise<void> {
    if (!this.#intakes.has(intake.id)) {
      throw new Error(`Intake not found: ${intake.id}`);
    }
    this.#intakes.set(intake.id, structuredClone(intake));
  }

  async delete(id: string): Promise<boolean> {
    this.#insights.delete(id);
    for (const [jobId, job] of this.#jobs) {
      if (job.intakeId === id) this.#jobs.delete(jobId);
    }
    return this.#intakes.delete(id);
  }

  async getInsights(intakeId: string): Promise<Insight[]> {
    return structuredClone(this.#insights.get(intakeId) ?? []);
  }

  async setInsights(intakeId: string, insights: Insight[]): Promise<void> {
    this.#insights.set(intakeId, structuredClone(insights));
  }

  async rememberConfirmation(
    idempotencyKey: string,
    actionId: string,
    revision: number,
  ): Promise<string> {
    const existing = this.#confirmations.get(idempotencyKey);
    if (existing) return existing.actionId;
    this.#confirmations.set(idempotencyKey, { actionId, revision });
    return actionId;
  }

  async getConfirmation(idempotencyKey: string): Promise<string | undefined> {
    return this.#confirmations.get(idempotencyKey)?.actionId;
  }

  async getExecution(idempotencyKey: string): Promise<ExecutionRecord | undefined> {
    const execution = this.#executions.get(idempotencyKey);
    return execution ? { actionId: execution.actionId, status: execution.status } : undefined;
  }

  async recordExecution(input: ExecutionRecordInput): Promise<ExecutionRecord> {
    const existing = this.#executions.get(input.idempotencyKey);
    if (existing) return { actionId: existing.actionId, status: existing.status };
    this.#executions.set(input.idempotencyKey, structuredClone(input));
    return { actionId: input.actionId, status: input.status };
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
        attempt: job.attempts,
        maxAttempts: job.maxAttempts,
      };
    }
    return null;
  }

  async completeAnalysisJob(jobId: string): Promise<void> {
    const job = this.requireJob(jobId);
    job.status = 'succeeded';
    job.input = null;
    job.lockedAt = null;
    job.lockedBy = null;
    job.lastErrorCode = null;
  }

  async rescheduleAnalysisJob(jobId: string, delayMs: number, errorCode: string): Promise<void> {
    const job = this.requireJob(jobId);
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
    const job = this.requireJob(jobId);
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
    this.#modelRuns.push(structuredClone(run));
  }

  async close(): Promise<void> {}

  private requireJob(id: string): MemoryJob {
    const job = this.#jobs.get(id);
    if (!job) throw new Error(`Analysis job not found: ${id}`);
    return job;
  }
}
