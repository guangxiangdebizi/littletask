# LittleTask

Turn chat screenshots into confirmable actions and grounded personal insights.

LittleTask is an iOS-first AI assistant that understands chat screenshots and optional user notes, extracts executable intents, and presents them as editable Action Cards. No contact or calendar mutation occurs until the user explicitly confirms the exact action.

## MVP actions

- Create a calendar event
- Create a contact
- Update an existing contact

After confirmed actions are executed, LittleTask uses the relevant contact, calendar, and conversation context to surface useful follow-up suggestions, conflicts, and preparation notes.

## Status

The project is in active development. The approved product and delivery plan is documented in [plan.md](./plan.md).

## Planned stack

- Expo / React Native / TypeScript for the iOS app and web acceptance build
- Fastify / PostgreSQL / Prisma for the backend
- OpenAI-compatible Responses API for multimodal analysis and review
- PM2 / Nginx / Let's Encrypt for deployment

## Security

Do not commit API keys, real contact data, or private chat screenshots. Use synthetic or fully anonymized fixtures for tests and examples.

## License

[MIT](./LICENSE)
