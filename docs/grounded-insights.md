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

The engine recalculates the intake's insights after confirmation and after every accepted execution result. Recalculation replaces the previous derived set, so stale conflict or failure messages do not accumulate.

## Evidence model

Evidence uses a closed source vocabulary: `action`, `screenshot`, `note`, `contact_check`, `calendar_check`, `history`, and `system`. Each reference contains a short label and detail plus the relevant intake/action IDs when available.

`kind=observation` means the message describes persisted or device-reported state. `kind=suggestion` means the message proposes a next step and must not be presented as a verified fact.

## Privacy boundary

The device context contains only `possibleDuplicateContactCount` and `calendarConflictCount`, each restricted to `0..8`. It never contains local contact names, phone numbers, email addresses, calendar titles, event titles, or event times. Historical matching is performed only against structured LittleTask records already stored for the user.

## Verification

Domain tests cover calendar conflicts, duplicate contacts, failures, evidence types, fact/suggestion separation, and relevant-history filtering. API and PostgreSQL integration tests verify device-context persistence and insight survival across process restarts. The iOS export verifies the SQLite ledger migration and reporting code can be bundled for the native target.

AI-authored advice is intentionally not part of this deterministic module. It will run asynchronously and may reference only a server-provided evidence registry; deterministic observations remain available if the model call fails.
