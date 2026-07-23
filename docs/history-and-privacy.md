# History and privacy controls

LittleTask retains structured results so users can revisit confirmed actions without retaining the original screenshot after analysis.

## Device identity and isolation

The app creates an anonymous device session on first use. iOS stores the bearer token in Keychain through Expo SecureStore; the Web acceptance build uses local storage. PostgreSQL stores only the token's SHA-256 hash. Every intake belongs to a generated user ID, and all history, Action Card, execution, insight, summary, and deletion queries enforce that ownership relation. A token from another user receives the same `404` response as a missing resource.

The device session survives API and worker restarts. A rejected or revoked token is replaced once by the client; concurrent `401` responses share the same refresh operation rather than creating multiple identities. Registration, uploads, and general API traffic have separate fixed-window limits. Production enables Fastify `trustProxy` only while the API remains bound to the loopback interface behind Nginx.

## History API

`GET /api/v1/history?limit=20&cursor=...` returns compact history items. Each item contains the intake status, derived outcome, action counts, summary, and timestamps. The opaque cursor encodes the stable `(createdAt, id)` boundary; clients do not depend on database offsets.

`GET /api/v1/intakes/:id/activity` returns at most 200 structured events in reverse chronological order. Provenance distinguishes `user`, `ai`, `system`, and `device` sources and covers intake creation, analysis completion or failure, action revisions, confirmations, and execution outcomes. Error details are restricted to bounded uppercase error codes.

## Deletion

- `DELETE /api/v1/intakes/:id` deletes one intake.
- `DELETE /api/v1/history` deletes all retained intakes for the current data scope.
- `DELETE /api/v1/account` deletes the current anonymous user, every associated intake, and all device sessions.
- PostgreSQL foreign keys cascade through actions, revisions, confirmations, executions, insights, model runs, and queued jobs.
- The in-memory store applies the same cascade explicitly.
- Deleted data returns `404` and is omitted from history and summary endpoints.

Deleting server history never reverses a contact or calendar mutation already performed on the user's device.

## Data summary

`GET /api/v1/data-summary` reports counts for intakes, actions, execution results, insights, and pending temporary screenshots. `screenshotsRetainedAfterAnalysis` is always `false`. Screenshot bytes exist only on an incomplete analysis job and are cleared after success or terminal failure.

## Device ledger

The privacy screen treats the local execution ledger separately from server history. Clearing it removes only local idempotency/recovery metadata. It does not delete Contacts, Calendar events, or server records. The UI warns that clearing this ledger also removes the strongest local duplicate-write guard for completed attempts.

Deleting the anonymous account also clears the current device token and local execution ledger. A later request creates a new unrelated identity. It still does not reverse Contacts or Calendar writes already completed on the device.
