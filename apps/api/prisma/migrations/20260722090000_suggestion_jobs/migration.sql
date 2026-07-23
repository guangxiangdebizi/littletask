ALTER TYPE "ModelRunStage" ADD VALUE IF NOT EXISTS 'insight';

ALTER TABLE "insights"
ADD COLUMN "generator" TEXT NOT NULL DEFAULT 'rules';

CREATE TABLE "suggestion_jobs" (
  "id" UUID NOT NULL,
  "intake_id" UUID NOT NULL,
  "status" "AnalysisJobStatus" NOT NULL,
  "generation" INTEGER NOT NULL,
  "input_hash" CHAR(64) NOT NULL,
  "input" JSONB NOT NULL,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "max_attempts" INTEGER NOT NULL,
  "available_at" TIMESTAMPTZ(3) NOT NULL,
  "locked_at" TIMESTAMPTZ(3),
  "locked_by" TEXT,
  "last_error_code" TEXT,
  "completed_at" TIMESTAMPTZ(3),
  "created_at" TIMESTAMPTZ(3) NOT NULL,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "suggestion_jobs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "suggestion_jobs_intake_id_key" ON "suggestion_jobs"("intake_id");
CREATE INDEX "suggestion_jobs_status_available_at_idx" ON "suggestion_jobs"("status", "available_at");

ALTER TABLE "suggestion_jobs"
ADD CONSTRAINT "suggestion_jobs_intake_id_fkey"
FOREIGN KEY ("intake_id") REFERENCES "intakes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
