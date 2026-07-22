import type {
  ActivityEvent,
  AnalysisDraft,
  DataSummary,
  ExecutionDeviceContext,
  GroundedSuggestionInput,
  HistoryItem,
  Insight,
  InsightGenerationStatus,
  InsightType,
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

export interface ModelTelemetry {
  responseId: string | null;
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
}

export interface ModelResult<T> {
  data: T;
  telemetry: ModelTelemetry;
}

export interface AIProvider {
  analyze(input: AnalyzeInput): Promise<ModelResult<AnalysisDraft>>;
  review(input: AnalyzeInput, draft: AnalysisDraft): Promise<ModelResult<AnalysisDraft>>;
  suggestInsights(input: GroundedSuggestionInput): Promise<ModelResult<GroundedSuggestionDraft[]>>;
}

export interface GroundedSuggestionDraft {
  actionId: string | null;
  type: Extract<InsightType, 'meeting_preparation' | 'follow_up' | 'reply_suggestion'>;
  priority: 'medium' | 'low';
  title: string;
  body: string;
  evidenceIds: string[];
}

export interface ClaimedAnalysisJob extends AnalyzeInput {
  jobId: string;
  intakeId: string;
  userId: string;
  attempt: number;
  maxAttempts: number;
}

export interface ClaimedSuggestionJob extends GroundedSuggestionInput {
  jobId: string;
  userId: string;
  generation: number;
  attempt: number;
  maxAttempts: number;
}

export interface ModelRunRecord {
  id: string;
  intakeId: string;
  stage: 'analysis' | 'review' | 'insight';
  status: 'succeeded' | 'failed';
  provider: string;
  model: string;
  reasoningEffort: string;
  promptVersion: string;
  schemaVersion: string;
  durationMs: number;
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
  responseId: string | null;
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

export interface SuggestionJobState {
  status: InsightGenerationStatus;
  generation: number | null;
}

export interface AuthPrincipal {
  userId: string;
  deviceId: string;
}

export interface DeviceSessionInput extends AuthPrincipal {
  tokenHash: string;
  createdAt: Date;
}

export interface IntakeStore {
  createDeviceSession(input: DeviceSessionInput): Promise<void>;
  findDeviceSession(tokenHash: string): Promise<AuthPrincipal | undefined>;
  revokeDeviceSession(deviceId: string): Promise<void>;
  deleteUser(userId: string): Promise<boolean>;
  create(
    userId: string,
    intake: Intake,
    analysisInput: AnalyzeInput,
    maxAttempts: number,
  ): Promise<void>;
  get(userId: string, id: string): Promise<Intake | undefined>;
  list(userId: string): Promise<Intake[]>;
  listHistory(
    userId: string,
    input: { limit: number; before?: HistoryCursor },
  ): Promise<HistoryStorePage>;
  listActivity(userId: string, intakeId: string): Promise<ActivityEvent[]>;
  getDataSummary(userId: string): Promise<DataSummary>;
  replace(userId: string, intake: Intake, revisionSource?: 'ai' | 'user' | 'system'): Promise<void>;
  delete(userId: string, id: string): Promise<boolean>;
  deleteAll(userId: string): Promise<number>;
  getInsights(userId: string, intakeId: string): Promise<Insight[]>;
  setRuleInsights(userId: string, intakeId: string, insights: Insight[]): Promise<void>;
  enqueueSuggestionJob(
    userId: string,
    input: GroundedSuggestionInput,
    inputHash: string,
    maxAttempts: number,
  ): Promise<boolean>;
  getSuggestionJobState(userId: string, intakeId: string): Promise<SuggestionJobState>;
  claimSuggestionJob(workerId: string, staleAfterMs: number): Promise<ClaimedSuggestionJob | null>;
  completeSuggestionJob(jobId: string, generation: number, insights: Insight[]): Promise<boolean>;
  rescheduleSuggestionJob(
    jobId: string,
    generation: number,
    delayMs: number,
    errorCode: string,
  ): Promise<void>;
  failSuggestionJob(jobId: string, generation: number, errorCode: string): Promise<void>;
  rememberConfirmation(
    userId: string,
    idempotencyKey: string,
    actionId: string,
    revision: number,
  ): Promise<string>;
  getConfirmation(userId: string, idempotencyKey: string): Promise<string | undefined>;
  getExecution(userId: string, idempotencyKey: string): Promise<ExecutionRecord | undefined>;
  recordExecution(userId: string, input: ExecutionRecordInput): Promise<ExecutionRecord>;
  listExecutionObservations(userId: string, intakeId: string): Promise<ExecutionObservation[]>;
  claimAnalysisJob(workerId: string, staleAfterMs: number): Promise<ClaimedAnalysisJob | null>;
  completeAnalysisJob(jobId: string): Promise<void>;
  rescheduleAnalysisJob(jobId: string, delayMs: number, errorCode: string): Promise<void>;
  failAnalysisJob(jobId: string, errorCode: string, message: string): Promise<void>;
  recordModelRun(run: ModelRunRecord): Promise<void>;
  healthCheck(): Promise<void>;
  close(): Promise<void>;
}
