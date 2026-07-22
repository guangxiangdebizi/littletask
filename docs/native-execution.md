# Native action execution

LittleTask executes contact and calendar mutations on the user's device. The API confirms an exact Action Card revision and records the result, but it never receives permission to write to iOS Contacts or Calendar directly.

## Supported actions

- `create_event`: selects a writable calendar, checks overlapping events, then creates one event.
- `create_contact`: ranks possible duplicates locally, then creates one contact.
- `update_contact`: requires the user to select a concrete local contact and displays the field-level diff before updating it.

The Web acceptance build uses an adapter marked `simulated`. It follows the same confirmation and reporting protocol but never requests native permissions or changes system data.

## Confirmation sequence

1. The user opens an Action Card and can edit its payload.
2. The client asks for the relevant permission only after the user taps the device-check button.
3. Contact candidates or calendar conflicts are read locally and displayed.
4. The user reviews the complete executable payload and explicitly accepts any duplicate or conflict warning.
5. The client confirms the exact action revision with the API.
6. Only after the API accepts that confirmation does the native adapter perform the device mutation.
7. The native record reference or a bounded error code is reported to the API.

Editing or choosing a contact produces a new server revision and invalidates the previous device check. A fresh check is required before that new revision can be confirmed.

## Duplicate and conflict checks

Contact matching normalizes names, Chinese phone prefixes, and email casing. Phone and email matches rank above name-only matches. At most eight relevant candidates are shown; the client does not upload the full address book.

Calendar conflicts are events that overlap the proposed start/end interval. The client reads the selected interval across visible calendars, shows at most eight conflicts, and requires a separate acknowledgement before creation. Existing events are never changed.

Attendee names are appended to event notes for reference. The MVP does not send calendar invitations.

## Device execution ledger

iOS uses `expo-sqlite` and a WAL-backed `action_execution_ledger` table keyed by `(action_id, revision)`. Each row has a stable confirmation key and execution-attempt key. State transitions are transactionally guarded:

```text
prepared -> confirmed -> executing -> succeeded
                                |-> failed -> confirmed (new attempt key)
                                |-> uncertain
```

- A known pre-mutation failure can be retried with a new execution key.
- If a native call may have succeeded but its result is unclear, the row becomes `uncertain`; automatic retry is blocked.
- The user must check Contacts or Calendar and then either mark the existing record as found or explicitly authorize a new attempt.
- If the device write succeeded but API reporting failed, reopening the action replays only the report and does not repeat the native write.

The Web implementation uses versioned `localStorage` only for acceptance testing. It is not presented as the iOS durability guarantee.

## iOS constraints

The current build intentionally rejects contact-note writes on iOS because Apple's notes field requires an additional Contacts entitlement. Other supported contact fields remain available. The UI asks the user to remove a note change rather than silently dropping it.

Permission descriptions in `apps/mobile/app.json` reflect both local conflict/candidate reads and confirmed writes. Permissions are not requested at launch.

## Verification

Automated coverage includes candidate ranking, timezone/DST conversion, confirmation-before-mutation ordering, duplicate-write prevention, uncertain-result blocking, failure retry keys, API idempotency conflicts, and PostgreSQL persistence.

Run the local quality gates:

```powershell
corepack pnpm check
$env:TEST_DATABASE_URL='postgresql://littletask:littletask@localhost:5433/littletask_test?schema=public'
corepack pnpm test:integration
corepack pnpm --filter @littletask/mobile exec expo export --platform ios --output-dir dist-ios
```

The JavaScript iOS bundle passes locally on Windows. Final native acceptance still requires an EAS development/TestFlight build and a physical iPhone using disposable test contacts and a dedicated test calendar. Verify each action, permission denial/recovery, app termination during execution, offline result reporting, and the uncertain-result recovery screen before release.
