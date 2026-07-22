import type {
  ActivityEvent,
  AnalysisDraft,
  DataSummary,
  ExecutionDeviceContext,
  HistoryItem,
  Insight,
  Intake,
} from '@littletask/contracts';

export interface AnalyzeInput {
  image: Buffer;
  mimeType: string;
  note: string | null;
  locale: string;
  timezone: string;
  now: Date;
}

export interface AIProvider {
  analyze(input: AnalyzeInput): Promise<AnalysisDraft>;
  review(input: AnalyzeInput, draft: AnalysisDraft): Promise<AnalysisDraft>;
}

export interface ClaimedAnalysisJob extends AnalyzeInput {
  jobId: string;
  intakeId: string;
  attempt: number;
  maxAttempts: number;
}

export interface ModelRunRecord {
  id: string;
  intakeId: string;
  stage: 'analysis' | 'review';
  status: 'succeeded' | 'failed';
  provider: string;
  model: string;
  reasoningEffort: string;
  promptVersion: string;
  schemaVersion: string;
  durationMs: number;
  errorCode: string | null;
  startedAt: Date;
  completedAt: Date;
}

export interface ExecutionRecordInput {
  actionId: string;
  idempotencyKey: string;
  status: 'succeeded' | 'failed';
  nativeRecordRef?: string;
  errorMessage?: string;
  deviceContext?: ExecutionDeviceContext;
}

export interface ExecutionRecord {
  actionId: string;
  status: ExecutionRecordInput['status'];
}

export interface ExecutionObservation {
  actionId: string;
  status: ExecutionRecordInput['status'];
  deviceContext: ExecutionDeviceContext;
  errorCode: string | null;
  createdAt: string;
}

export interface HistoryCursor {
  createdAt: string;
  id: string;
}

export interface HistoryStorePage {
  items: HistoryItem[];
  hasMore: boolean;
}

export interface IntakeStore {
  create(intake: Intake, analysisInput: AnalyzeInput, maxAttempts: number): Promise<void>;
  get(id: string): Promise<Intake | undefined>;
  list(): Promise<Intake[]>;
  listHistory(input: { limit: number; before?: HistoryCursor }): Promise<HistoryStorePage>;
  listActivity(intakeId: string): Promise<ActivityEvent[]>;
  getDataSummary(): Promise<DataSummary>;
  replace(intake: Intake, revisionSource?: 'ai' | 'user' | 'system'): Promise<void>;
  delete(id: string): Promise<boolean>;
  deleteAll(): Promise<number>;
  getInsights(intakeId: string): Promise<Insight[]>;
  setInsights(intakeId: string, insights: Insight[]): Promise<void>;
  rememberConfirmation(idempotencyKey: string, actionId: string, revision: number): Promise<string>;
  getConfirmation(idempotencyKey: string): Promise<string | undefined>;
  getExecution(idempotencyKey: string): Promise<ExecutionRecord | undefined>;
  recordExecution(input: ExecutionRecordInput): Promise<ExecutionRecord>;
  listExecutionObservations(intakeId: string): Promise<ExecutionObservation[]>;
  claimAnalysisJob(workerId: string, staleAfterMs: number): Promise<ClaimedAnalysisJob | null>;
  completeAnalysisJob(jobId: string): Promise<void>;
  rescheduleAnalysisJob(jobId: string, delayMs: number, errorCode: string): Promise<void>;
  failAnalysisJob(jobId: string, errorCode: string, message: string): Promise<void>;
  recordModelRun(run: ModelRunRecord): Promise<void>;
  close(): Promise<void>;
}
