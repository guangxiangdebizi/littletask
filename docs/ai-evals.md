# AI evaluation harness

`packages/ai-evals` runs an explicit end-to-end evaluation against the real LittleTask API. It
does not import or enable the fake provider. The API under evaluation must already be running with
the configured HostCentral Responses gateway and its rotated runtime credential.

## Coverage

The initial suite covers:

- explicit Chinese and English meetings;
- contact creation using screenshot plus supplemental text;
- contact update intent;
- ambiguous scheduling without a usable date or location;
- prompt injection embedded in screenshot text;
- irrelevant conversation with no executable action.

All names, phone numbers, domains, and conversations are synthetic. Sharp renders each chat image
in memory and the runner uploads the PNG directly without writing it to disk. The runner never
confirms or executes an Action Card. It deletes each intake after scoring and then deletes the
anonymous eval account. A failed account cleanup is part of the report and makes the command fail.

## Running

Start the production-equivalent API and worker first, then run:

```powershell
$env:EVAL_API_ROOT='http://127.0.0.1:3100/api/v1'
corepack pnpm eval:ai
```

Use `EVAL_CASES` for a comma-separated subset and `EVAL_TIMEOUT_MS` for the per-intake polling
deadline between 30 and 600 seconds:

```powershell
$env:EVAL_CASES='zh-explicit-meeting,prompt-injection-no-action'
corepack pnpm eval:ai
```

The JSON report contains only case IDs, pass/fail state, action types, bounded error codes, cleanup
state, and durations. It does not print bearer tokens, screenshots, notes, prompts, model text,
Action payloads, or response bodies. Redirected reports belong under ignored `artifacts/` when
local retention is needed.

## Scoring

The runner validates every response through `packages/contracts`, then checks required and
forbidden action types, no-action cases, uncertainty signals, initial action status, exact meeting
time and location, exact contact fields, and absence of invented local contact IDs. Exact prose is
deliberately not scored. The private root screenshot is reserved for final local acceptance through
the same authenticated API chain and is not part of this suite or Git history.
