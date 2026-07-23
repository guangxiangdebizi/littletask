CREATE TABLE "users" (
  "id" UUID NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "device_sessions" (
  "id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "token_hash" CHAR(64) NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL,
  "last_seen_at" TIMESTAMPTZ(3) NOT NULL,
  "revoked_at" TIMESTAMPTZ(3),
  CONSTRAINT "device_sessions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "device_sessions_token_hash_key" ON "device_sessions"("token_hash");
CREATE INDEX "device_sessions_user_id_idx" ON "device_sessions"("user_id");

ALTER TABLE "device_sessions"
ADD CONSTRAINT "device_sessions_user_id_fkey"
FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Pre-authentication rows cannot be assigned to a real anonymous account safely.
DELETE FROM "intakes";

ALTER TABLE "intakes" ADD COLUMN "user_id" UUID NOT NULL;

CREATE INDEX "intakes_user_id_created_at_idx"
ON "intakes"("user_id", "created_at" DESC);

ALTER TABLE "intakes"
ADD CONSTRAINT "intakes_user_id_fkey"
FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
