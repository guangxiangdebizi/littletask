# Security and observability

## Anonymous device sessions

`POST /api/v1/auth/device` creates an anonymous user and one device session. The bearer token contains 32 random bytes and is returned only once. The server stores a SHA-256 token hash, never the plaintext token. iOS keeps the token in Keychain with `AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY`; the Web acceptance build uses local storage.

All `/api/v1/intakes`, `/actions`, `/history`, `/data-summary`, activity, and insight routes require `Authorization: Bearer <token>`. Store methods take `userId` explicitly, and PostgreSQL queries enforce ownership through the intake relation. Cross-user access returns `404` so resource existence is not disclosed.

`DELETE /api/v1/auth/device` revokes only the current session. `DELETE /api/v1/account` cascades through all sessions, intakes, actions, revisions, confirmations, executions, insights, model runs, and jobs for the anonymous user. Contacts and Calendar records already written on the device are outside that cascade.

## Rate limits

The API uses bounded in-process fixed windows for its single production API instance:

- `RATE_LIMIT_REGISTRATIONS`: anonymous registrations per source IP;
- `RATE_LIMIT_UPLOADS`: screenshot uploads per device;
- `RATE_LIMIT_REQUESTS`: all authenticated business requests per device;
- `RATE_LIMIT_WINDOW_MS`: shared window duration.

Exceeded limits return `429`, the stable `RATE_LIMITED` code, and `Retry-After`. Production requires `TRUST_PROXY=true` and `HOST=127.0.0.1`; this is safe only because Nginx is the sole public listener and overwrites forwarding headers.

## Logging and metrics

Pino redacts authorization, cookies, API keys, and response cookies. Application logs must not include screenshot bytes, model prompts or outputs, notes, Action payloads, bearer tokens, database URLs, or native record identifiers.

`GET /api/metrics` exports Prometheus text with only HTTP method, fixed Fastify route template, and status class labels. It does not use intake IDs, action IDs, users, IPs, filenames, or error messages as labels. Nginx must deny this endpoint publicly; monitoring should scrape it locally.

Model runs persist provider, model, stage, status, reasoning effort, prompt/schema versions, bounded error code, duration, a validated response ID, and non-negative token counts returned by the gateway. Prompts, response bodies, and screenshot bytes are never copied into model-run audit rows.

## Production boundary

Production startup fails unless it uses PostgreSQL, loopback binding, trusted Nginx proxying, the fixed HostCentral Responses endpoint, `gpt-5.6-terra`, `xhigh`, and `store:false`. The fake provider is accepted only under `NODE_ENV=test` and is not a runtime fallback.
