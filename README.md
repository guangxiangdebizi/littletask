# LittleTask

Turn chat screenshots into confirmable actions and grounded personal insights.

LittleTask is an iOS-first AI assistant that understands chat screenshots and optional user notes, extracts executable intents, and presents them as editable Action Cards. No contact or calendar mutation occurs until the user explicitly confirms the exact action.

## MVP actions

- Create a calendar event
- Create a contact
- Update an existing contact

After confirmed actions are executed, LittleTask uses the relevant contact, calendar, and conversation context to surface useful follow-up suggestions, conflicts, and preparation notes.

## Status

The project is in active development. The first vertical slice is available with a deterministic fake AI provider:

- Upload a screenshot and optional note
- Receive three grounded Action Card types
- Confirm a stable action revision
- Simulate execution in the Web acceptance build
- Receive deterministic follow-up insights

The GPT-5.6 Terra provider is implemented behind an environment switch with stateless analysis and review requests. A rotated runtime credential is still required for the live gateway compatibility check. PostgreSQL persistence and native Contacts/Calendar execution are the next implementation stages. The full product and delivery plan is documented in [plan.md](./plan.md).

## Stack

- Expo / React Native / TypeScript for the iOS app and web acceptance build
- Fastify / PostgreSQL / Prisma for the backend
- OpenAI-compatible Responses API for multimodal analysis and review
- PM2 / Nginx / Let's Encrypt for deployment

## Repository layout

```text
apps/mobile        Expo React app for iOS and Web acceptance
apps/api           Fastify API and current fake analysis pipeline
packages/contracts Shared Zod API and Action Card contracts
packages/domain    Framework-independent state and insight rules
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

Run the complete local quality gate:

```bash
corepack pnpm check
```

## AI configuration

The committed configuration defaults to `AI_PROVIDER=fake`. To enable real inference, set `AI_PROVIDER=openai` and inject `OPENAI_API_KEY` at runtime. The provider sends the screenshot twice through the OpenAI-compatible Responses API: first for extraction, then for an independent evidence review. It uses `gpt-5.6-terra`, `xhigh` reasoning, Structured Outputs, original-detail vision input, and `store: false` on every request.

HEIC screenshots are converted to high-quality JPEG in memory before inference. Original screenshot bytes are not persisted by the current API. See [docs/ai-provider.md](./docs/ai-provider.md) for the request contract and gateway smoke-test checklist.

## Security

Do not commit API keys, real contact data, or private chat screenshots. Use synthetic or fully anonymized fixtures for tests and examples.

## License

[MIT](./LICENSE)
