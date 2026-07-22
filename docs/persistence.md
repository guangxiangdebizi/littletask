# PostgreSQL persistence and AI worker

LittleTask has two persistence modes:

- `memory` is the zero-setup development mode. The API drains AI jobs inline and data is
  lost when the process exits.
- `postgres` is the durable mode. The API only accepts and reads work; a separate worker claims
  and processes screenshot-analysis and grounded-suggestion jobs.

Production must use `PERSISTENCE_PROVIDER=postgres` and run both PM2 entries from
`infra/pm2/ecosystem.config.cjs`.

## Data lifecycle

The initial migration stores intakes, actions, immutable action revisions, confirmations,
execution results, grounded insights, model-run metadata, analysis jobs, and suggestion jobs. The uploaded image
is held temporarily in the job row because the worker may run in another process. Its bytes are
cleared when the job succeeds or permanently fails. Intake history retains only the image hash,
MIME type, size, and optional original filename.

Native Contacts and Calendar record references are hashed before persistence. Model-run records
contain provider/model/version/timing metadata but not prompts, image bytes, API keys, or model
response bodies.

Anonymous users and device sessions are durable PostgreSQL records. A device receives one opaque
bearer token; only its SHA-256 hash is stored. Every intake has a required `user_id`, and ownership
filters are enforced before reading or mutating intakes, actions, confirmations, executions,
insights, history, and deletion state. Deleting an account cascades through its sessions and all
retained product data.

The user-isolation migration removes any intake created before authentication existed. Those rows
have no defensible owner and are not assigned to a shared or recoverable account. Apply this
migration only after taking any operational backup required by the deployment policy.

## Queue behavior

Workers claim one due job with a PostgreSQL transaction and `FOR UPDATE SKIP LOCKED`. Analysis jobs are prioritized so uploads are not delayed by follow-up generation. An analysis claim:

1. increments the attempt count;
2. records the worker and lease timestamp;
3. runs analysis and independent review;
4. atomically persists the normalized Action Cards and revisions;
5. clears the temporary image payload when complete.

Gateway rate limits, network errors, and transient gateway failures use bounded exponential
backoff. Schema and validation failures are not retried blindly. A different worker can reclaim a
job after `JOB_LEASE_MS`; an abandoned job that has exhausted its attempt budget is failed and its
image is deleted.

Suggestion jobs store only a bounded structured evidence registry, never screenshot bytes. A new input hash increments the job generation and clears only earlier model-authored suggestions. Completion locks and checks the generation before replacing model output, so an old worker response cannot overwrite newer context. Rule-generated insights are stored independently and survive suggestion retries or permanent failure.

Confirmation and execution requests use a UUID idempotency key with unique database constraints.
Repeating the same request does not create another confirmation or execution row.

## Local durable environment

Create the root configuration file and set `PERSISTENCE_PROVIDER=postgres`:

```powershell
Copy-Item .env.example .env
docker compose up -d postgres
corepack pnpm db:migrate:deploy
corepack pnpm dev:api
```

Run the worker in a second terminal:

```powershell
corepack pnpm dev:worker
```

Both processes load `.env.local` and then `.env` from the repository root. Set
`LITTLETASK_ENV_FILE` to use an explicit file, such as a production file mounted outside the
release directory.

## Isolated integration tests

The test profile uses a separate database on port `5433` backed by tmpfs:

```powershell
docker compose --profile test up -d postgres-test
$env:DATABASE_URL='postgresql://littletask:littletask@127.0.0.1:5433/littletask_test?schema=public'
corepack pnpm db:migrate:deploy
$env:TEST_DATABASE_URL=$env:DATABASE_URL
corepack pnpm test:integration
```

The integration suite proves API and worker restart recovery, abandoned lease recovery, persisted
history, model-run audit records, temporary-image deletion, and confirmation/execution
deduplication.

## PM2

After installing production dependencies, generating Prisma Client, applying migrations, and
building the workspace:

```bash
pm2 start infra/pm2/ecosystem.config.cjs
pm2 save
```

The ecosystem file deliberately contains no credentials. Provide `DATABASE_URL`, the AI provider
configuration, and the rotated `OPENAI_API_KEY` through the root `.env`, `.env.local`, or
`LITTLETASK_ENV_FILE`.
