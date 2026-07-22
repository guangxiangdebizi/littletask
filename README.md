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
- Simulate execution in the Web acceptance build
- Receive grounded follow-up insights
- Review cursor-paginated history and action provenance
- Delete one intake or all retained server-side data

The GPT-5.6 Terra provider is implemented with stateless analysis and review requests. PostgreSQL persists the complete intake/action audit trail and feeds a restart-safe standalone analysis worker. The iOS client includes editable revision-bound cards, local contact matching, calendar conflict checks, native Contacts/Calendar adapters, a SQLite execution ledger, history provenance, and privacy controls. Its iOS JavaScript bundle passes locally; an EAS build and physical-device acceptance remain before TestFlight. A rotated runtime credential is still required for the live gateway compatibility check. The full product and delivery plan is documented in [plan.md](./plan.md).

## Stack

- Expo / React Native / TypeScript for the iOS app and web acceptance build
- Fastify / PostgreSQL / Prisma for the backend
- OpenAI-compatible Responses API for multimodal analysis and review
- PM2 / Nginx / Let's Encrypt for deployment

## Repository layout

```text
apps/mobile        Expo React app for iOS and Web acceptance
apps/api           Fastify API, Prisma schema, migrations, and analysis worker
packages/contracts Shared Zod API and Action Card contracts
packages/domain    Framework-independent state and insight rules
infra/pm2          Separate production API and worker process definitions
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

The default `memory` persistence mode needs no database and drains fake-analysis jobs inside the API process. To run the durable API/worker topology, set `PERSISTENCE_PROVIDER=postgres` in `.env`, then run:

```bash
docker compose up -d postgres
corepack pnpm db:migrate:deploy
corepack pnpm dev:api
```

Start `corepack pnpm dev:worker` in another terminal. See [docs/persistence.md](./docs/persistence.md) for the queue lifecycle, isolated PostgreSQL integration suite, and PM2 process topology.

Native execution is never performed by the Web acceptance build. See [docs/native-execution.md](./docs/native-execution.md) for permission timing, confirmation ordering, duplicate/conflict checks, crash recovery, and the physical-device test checklist.

History returns compact summaries through an opaque cursor rather than downloading every intake. Each intake exposes a provenance timeline for AI revisions, user edits and confirmations, and device results. The privacy page shows retained counts, deletes a single intake or all server-side records, and separately clears the local execution ledger. See [docs/history-and-privacy.md](./docs/history-and-privacy.md).

Run the complete local quality gate:

```bash
corepack pnpm check
```

## AI configuration

The committed configuration defaults to `AI_PROVIDER=fake`. To enable real inference, set `AI_PROVIDER=openai` and inject `OPENAI_API_KEY` at runtime. The provider sends the screenshot twice through the OpenAI-compatible Responses API: first for extraction, then for an independent evidence review. It uses `gpt-5.6-terra`, `xhigh` reasoning, Structured Outputs, original-detail vision input, and `store: false` on every request.

HEIC screenshots are converted to high-quality JPEG in memory before inference. In PostgreSQL mode, original screenshot bytes are retained only in the pending job and cleared after success or permanent failure; history retains only image metadata and a SHA-256 hash. See [docs/ai-provider.md](./docs/ai-provider.md) for the request contract and gateway smoke-test checklist.

## Security

Do not commit API keys, real contact data, or private chat screenshots. Use synthetic or fully anonymized fixtures for tests and examples.

## License

[MIT](./LICENSE)
