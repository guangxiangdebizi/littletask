# Grounded insights

LittleTask separates verified observations from suggestions. Every insight is schema-validated and carries one or more structured evidence references that the UI renders below the message.

## Current deterministic signals

- missing fields on a confirmed or completed Action Card;
- a failed device execution and its bounded error code;
- possible duplicate-contact count reported by the device;
- overlapping-calendar-item count reported by the device;
- meeting preparation and reply suggestions after a calendar write succeeds;
- follow-up suggestions after a contact write succeeds;
- a matching person in a previously succeeded LittleTask action.

The engine recalculates the intake's rule-generated insights after confirmation and after every accepted execution result. Recalculation replaces only the previous rule set, so stale conflict or failure messages do not accumulate and an AI failure cannot remove verified observations.

## Asynchronous model suggestions

After at least one action succeeds, the API builds a bounded evidence registry from the deterministic insights. Each entry receives a server-generated ID such as `E1`; the model receives only succeeded action IDs/types, the intake summary, and those registered evidence values. It cannot read device contact candidates, calendar item details, or the original screenshot during this stage.

The suggestion worker may return at most four `meeting_preparation`, `follow_up`, or `reply_suggestion` items. Deterministic validation rejects unknown action IDs, invented evidence IDs, malformed items, and duplicates before persistence. Accepted items are stored with `kind=suggestion` and `generator=model` so the UI can distinguish them from rule output.

Suggestion work has an input hash and monotonically increasing generation. A repeated context does not enqueue duplicate work, while a newer context clears stale model suggestions and prevents an older in-flight response from overwriting the new generation. Retryable gateway failures use the same bounded backoff as screenshot analysis; a permanent failure exposes `generationStatus=failed` while all deterministic insights remain available.

`GET /api/v1/intakes/:id/insights` returns both `items` and `generationStatus`. The mobile client polls only while that status is `queued` or `processing`.

## Evidence model

Evidence uses a closed source vocabulary: `action`, `screenshot`, `note`, `contact_check`, `calendar_check`, `history`, and `system`. Each reference contains a short label and detail plus the relevant intake/action IDs when available.

`kind=observation` means the message describes persisted or device-reported state. `kind=suggestion` means the message proposes a next step and must not be presented as a verified fact.

## Privacy boundary

The device context contains only `possibleDuplicateContactCount` and `calendarConflictCount`, each restricted to `0..8`. It never contains local contact names, phone numbers, email addresses, calendar titles, event titles, or event times. Historical matching is performed only against structured LittleTask records already stored for the user.

## Verification

Domain tests cover calendar conflicts, duplicate contacts, failures, evidence types, fact/suggestion separation, and relevant-history filtering. API and PostgreSQL integration tests verify device-context persistence and insight survival across process restarts. The iOS export verifies the SQLite ledger migration and reporting code can be bundled for the native target.

The async suggestion queue, stale-generation rejection, and gateway behavior will be exercised in the final consolidated test pass after the remaining product modules are complete.
