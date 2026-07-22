import type { AnalysisDraft, Insight, Intake } from '@littletask/contracts';

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

export interface IntakeStore {
  create(intake: Intake): void;
  get(id: string): Intake | undefined;
  list(): Intake[];
  replace(intake: Intake): void;
  delete(id: string): boolean;
  getInsights(intakeId: string): Insight[];
  setInsights(intakeId: string, insights: Insight[]): void;
  rememberConfirmation(idempotencyKey: string, actionId: string): void;
  getConfirmation(idempotencyKey: string): string | undefined;
}
