-- CreateEnum
CREATE TYPE "IntakeStatus" AS ENUM ('queued', 'processing', 'ready', 'failed');

-- CreateEnum
CREATE TYPE "AnalysisJobStatus" AS ENUM ('queued', 'processing', 'retry', 'succeeded', 'failed');

-- CreateEnum
CREATE TYPE "ModelRunStage" AS ENUM ('analysis', 'review');

-- CreateEnum
CREATE TYPE "ModelRunStatus" AS ENUM ('succeeded', 'failed');

-- CreateEnum
CREATE TYPE "RevisionSource" AS ENUM ('ai', 'user', 'system');

-- CreateEnum
CREATE TYPE "ExecutionStatus" AS ENUM ('succeeded', 'failed');

-- CreateTable
CREATE TABLE "intakes" (
    "id" UUID NOT NULL,
    "status" "IntakeStatus" NOT NULL,
    "note" TEXT,
    "locale" TEXT NOT NULL,
    "timezone" TEXT NOT NULL,
    "image_sha256" CHAR(64) NOT NULL,
    "image_mime_type" TEXT NOT NULL,
    "image_bytes" INTEGER NOT NULL,
    "image_original_name" TEXT,
    "summary" TEXT,
    "participants" JSONB NOT NULL,
    "facts" JSONB NOT NULL,
    "uncertainties" JSONB NOT NULL,
    "clarifying_questions" JSONB NOT NULL,
    "error" JSONB,
    "created_at" TIMESTAMPTZ(3) NOT NULL,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "intakes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "actions" (
    "id" UUID NOT NULL,
    "intake_id" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "revision" INTEGER NOT NULL,
    "confidence" TEXT NOT NULL,
    "evidence" JSONB NOT NULL,
    "assumptions" JSONB NOT NULL,
    "payload" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "actions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "action_revisions" (
    "id" UUID NOT NULL,
    "action_id" UUID NOT NULL,
    "revision" INTEGER NOT NULL,
    "source" "RevisionSource" NOT NULL,
    "snapshot" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "action_revisions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "action_confirmations" (
    "id" UUID NOT NULL,
    "action_id" UUID NOT NULL,
    "revision" INTEGER NOT NULL,
    "idempotency_key" UUID NOT NULL,
    "confirmed_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "action_confirmations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "action_executions" (
    "id" UUID NOT NULL,
    "action_id" UUID NOT NULL,
    "idempotency_key" UUID NOT NULL,
    "status" "ExecutionStatus" NOT NULL,
    "native_record_ref" TEXT,
    "error_message" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "action_executions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "insights" (
    "id" UUID NOT NULL,
    "intake_id" UUID NOT NULL,
    "action_id" UUID,
    "type" TEXT NOT NULL,
    "priority" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "evidence" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "insights_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "model_runs" (
    "id" UUID NOT NULL,
    "intake_id" UUID NOT NULL,
    "stage" "ModelRunStage" NOT NULL,
    "status" "ModelRunStatus" NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "reasoning_effort" TEXT NOT NULL,
    "prompt_version" TEXT NOT NULL,
    "schema_version" TEXT NOT NULL,
    "duration_ms" INTEGER NOT NULL,
    "input_tokens" INTEGER,
    "output_tokens" INTEGER,
    "total_tokens" INTEGER,
    "response_id" TEXT,
    "error_code" TEXT,
    "started_at" TIMESTAMPTZ(3) NOT NULL,
    "completed_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "model_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "analysis_jobs" (
    "id" UUID NOT NULL,
    "intake_id" UUID NOT NULL,
    "status" "AnalysisJobStatus" NOT NULL,
    "image_payload" BYTEA,
    "mime_type" TEXT NOT NULL,
    "context_now" TIMESTAMPTZ(3) NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "max_attempts" INTEGER NOT NULL,
    "available_at" TIMESTAMPTZ(3) NOT NULL,
    "locked_at" TIMESTAMPTZ(3),
    "locked_by" TEXT,
    "last_error_code" TEXT,
    "completed_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "analysis_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "intakes_created_at_idx" ON "intakes"("created_at" DESC);

-- CreateIndex
CREATE INDEX "actions_intake_id_idx" ON "actions"("intake_id");

-- CreateIndex
CREATE INDEX "action_revisions_action_id_idx" ON "action_revisions"("action_id");

-- CreateIndex
CREATE UNIQUE INDEX "action_revisions_action_id_revision_key" ON "action_revisions"("action_id", "revision");

-- CreateIndex
CREATE UNIQUE INDEX "action_confirmations_idempotency_key_key" ON "action_confirmations"("idempotency_key");

-- CreateIndex
CREATE INDEX "action_confirmations_action_id_idx" ON "action_confirmations"("action_id");

-- CreateIndex
CREATE UNIQUE INDEX "action_executions_idempotency_key_key" ON "action_executions"("idempotency_key");

-- CreateIndex
CREATE INDEX "action_executions_action_id_idx" ON "action_executions"("action_id");

-- CreateIndex
CREATE INDEX "insights_intake_id_idx" ON "insights"("intake_id");

-- CreateIndex
CREATE INDEX "model_runs_intake_id_stage_idx" ON "model_runs"("intake_id", "stage");

-- CreateIndex
CREATE UNIQUE INDEX "analysis_jobs_intake_id_key" ON "analysis_jobs"("intake_id");

-- CreateIndex
CREATE INDEX "analysis_jobs_status_available_at_idx" ON "analysis_jobs"("status", "available_at");

-- AddForeignKey
ALTER TABLE "actions" ADD CONSTRAINT "actions_intake_id_fkey" FOREIGN KEY ("intake_id") REFERENCES "intakes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "action_revisions" ADD CONSTRAINT "action_revisions_action_id_fkey" FOREIGN KEY ("action_id") REFERENCES "actions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "action_confirmations" ADD CONSTRAINT "action_confirmations_action_id_fkey" FOREIGN KEY ("action_id") REFERENCES "actions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "action_executions" ADD CONSTRAINT "action_executions_action_id_fkey" FOREIGN KEY ("action_id") REFERENCES "actions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "insights" ADD CONSTRAINT "insights_intake_id_fkey" FOREIGN KEY ("intake_id") REFERENCES "intakes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "insights" ADD CONSTRAINT "insights_action_id_fkey" FOREIGN KEY ("action_id") REFERENCES "actions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "model_runs" ADD CONSTRAINT "model_runs_intake_id_fkey" FOREIGN KEY ("intake_id") REFERENCES "intakes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "analysis_jobs" ADD CONSTRAINT "analysis_jobs_intake_id_fkey" FOREIGN KEY ("intake_id") REFERENCES "intakes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
