ALTER TABLE "action_executions"
ADD COLUMN "device_context" JSONB;

ALTER TABLE "insights"
ADD COLUMN "kind" TEXT NOT NULL DEFAULT 'observation';
