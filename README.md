# LittleTask

Turn chat screenshots into confirmable actions and grounded personal insights.

LittleTask is an iOS-first AI assistant that understands chat screenshots and optional user notes, extracts executable intents, and presents them as editable Action Cards. No contact or calendar mutation occurs until the user explicitly confirms the exact action.

## MVP actions

- Create a calendar event
- Create a contact
- Update an existing contact

After confirmed actions are executed, LittleTask uses the relevant contact, calendar, and conversation context to surface useful follow-up suggestions, conflicts, and preparation notes.

## Status

The project is in active development. The first vertical slice includes:

- Upload a screenshot and optional note
- Receive three grounded Action Card types
- Confirm a stable action revision
- Execute contact and calendar mutations only in the iOS app
- Receive grounded follow-up insights
- Review cursor-paginated history and action provenance
- Delete one intake or all retained server-side data
- Isolate anonymous device sessions and delete the complete account

GPT-5.6 Terra runs inside a LangGraph ReAct workflow. Each intake gets an isolated in-memory action workspace whose tools can only record validated drafts; the model cannot mutate contacts or calendars. PostgreSQL persists the complete intake/action audit trail and feeds a restart-safe standalone AI worker. Anonymous device sessions isolate every user-owned query while storing only bearer-token hashes. The iOS client includes editable revision-bound cards, local contact matching, calendar conflict checks, native Contacts/Calendar adapters, a SQLite execution ledger, evidence-grounded suggestions, history provenance, and privacy controls. Its iOS JavaScript bundle passes locally; an EAS build and physical-device acceptance remain before TestFlight. The full product and delivery plan is documented in [plan.md](./plan.md).

## Stack

- Expo / React Native / TypeScript for the iOS app and web acceptance build
- Fastify / PostgreSQL / Prisma for the backend
- LangGraph ReAct agents over the OpenAI-compatible Responses API
- PM2 / Nginx / Let's Encrypt for deployment

## Repository layout

```text
apps/mobile        Expo React app for iOS and Web acceptance
apps/api           Fastify API, Prisma schema, migrations, and AI worker
packages/contracts Shared Zod API and Action Card contracts
packages/domain    Framework-independent state and insight rules
infra/pm2          Separate production API and worker process definitions
infra/deploy       Immutable release, rollback, backup, and host setup scripts
infra/nginx        manbaout.com Web/API/Webmail routing and bounded rate limits
```

## Local development

Requirements:

- Node.js 22+
- Corepack
- Docker Desktop when working on PostgreSQL stages

Install dependencies:

```bash
corepack pnpm install
```

Create local configuration without committing secrets:

```powershell
Copy-Item .env.example .env
```

Start the API in one terminal:

```bash
corepack pnpm dev:api
```

Start Expo in another terminal:

```bash
corepack pnpm dev:mobile
```

Press `w` in Expo to open the Web acceptance build. The default API URL is `http://127.0.0.1:3100/api/v1`; override it with `EXPO_PUBLIC_API_URL` when testing on a physical device or cloud environment.

The default `memory` persistence mode needs no database and drains real AI jobs inside the API process. It still requires a runtime `OPENAI_API_KEY`. To run the durable API/worker topology, set `PERSISTENCE_PROVIDER=postgres` in `.env`, then run:

```bash
docker compose up -d postgres
corepack pnpm db:migrate:deploy
corepack pnpm dev:api
```

Start `corepack pnpm dev:worker` in another terminal. See [docs/persistence.md](./docs/persistence.md) for the queue lifecycle, isolated PostgreSQL integration suite, and PM2 process topology.

Native execution is never performed by the Web acceptance build. See [docs/native-execution.md](./docs/native-execution.md) for permission timing, confirmation ordering, duplicate/conflict checks, crash recovery, and the physical-device test checklist.

EAS development, preview, and production profiles are committed for the iOS release path. See
[docs/ios-release.md](./docs/ios-release.md) for one-time project linking, TestFlight commands, and
the physical-device release gates.

History returns compact summaries through an opaque cursor rather than downloading every intake. Each intake exposes a provenance timeline for AI revisions, user edits and confirmations, and device results. The privacy page shows retained counts, deletes a single intake, all user records, or the anonymous account, and separately clears the local execution ledger. Grounded model advice runs in a separate generation-safe queue and can only cite the server's bounded evidence registry. See [docs/history-and-privacy.md](./docs/history-and-privacy.md) and [docs/grounded-insights.md](./docs/grounded-insights.md).

The API stores only anonymous device-token hashes, applies ownership at every store boundary, rate-limits registration/uploads/general traffic separately, and exposes bounded-label Prometheus metrics. See [docs/security-and-observability.md](./docs/security-and-observability.md).

The API publishes its OpenAPI 3.1 contract at `/api/openapi.json`; component schemas are generated
from the same Zod contracts consumed by the app. The public privacy policy is available in the app
and at `/privacy-policy` in the Web export.

Production uses an isolated Node 22 runtime, PostgreSQL container, low-privilege PM2 children,
atomic Git-SHA releases, Nginx/SSL, daily database dumps, and validated rollback while preserving
the existing Roundcube service at `/webmail/`. See [docs/deployment.md](./docs/deployment.md).

Run the complete local quality gate:

```bash
corepack pnpm check
```

## AI configuration

All environments use the same LangGraph/OpenAI runtime path. Inject `OPENAI_API_KEY` at runtime. The agent receives the screenshot and optional text as one multimodal message, uses Zod-validated workspace tools to build Action Cards, performs an independent review run, and later uses a separate evidence-constrained workspace for suggestions. It uses `gpt-5.6-terra`, `xhigh` reasoning, Responses API vision input, and `store: false` on every model turn.

HEIC screenshots are converted to high-quality JPEG in memory before inference. In PostgreSQL mode, original screenshot bytes are retained only in the pending job and cleared after success or permanent failure; history retains only image metadata and a SHA-256 hash. See [docs/ai-provider.md](./docs/ai-provider.md) for the request contract and gateway smoke-test checklist.

## Security

Do not commit API keys, real contact data, or private chat screenshots. Semantic acceptance files must remain Git-ignored and be deleted from the server after the run.

## License

[MIT](./LICENSE)
