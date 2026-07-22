# LangGraph AI integration

LittleTask has one AI runtime path: a LangGraph-backed ReAct agent using the configured
OpenAI-compatible Responses API. There is no runtime fallback provider or generated-content
probe.

## Runtime contract

```dotenv
AI_PROVIDER=openai
OPENAI_BASE_URL=https://api.hostcentral.cc
OPENAI_MODEL=gpt-5.6-terra
OPENAI_REVIEW_MODEL=gpt-5.6-terra
OPENAI_REASONING_EFFORT=xhigh
OPENAI_STORE=false
OPENAI_TIMEOUT_MS=180000
OPENAI_MAX_RETRIES=2
OPENAI_MAX_OUTPUT_TOKENS=16000
```

`OPENAI_API_KEY` must come from the process environment or deployment secret store. Never place it
in Git, PM2 configuration, logs, screenshots, issues, or pull requests.

`langchain.createAgent` builds the ReAct loop on LangGraph. `ChatOpenAI` is forced onto the
Responses API with `gpt-5.6-terra`, `xhigh`, and zero-data-retention mode, which sends
`store:false` on every model turn.

## Intake workspace

Each analysis or review run creates a new in-memory action workspace. The agent receives one
multimodal message containing the screenshot and optional note and can call only these tools:

- `record_context`
- `propose_create_event`
- `propose_create_contact`
- `propose_update_contact`
- `finish_analysis`

The tools write drafts only. They cannot access contacts, calendars, the network, a shell, or the
filesystem. Every tool input is validated with Zod before it enters the workspace, and the complete
workspace is validated again against the domain contract before Action Cards are persisted. The
independent review run receives the original image and draft, then rebuilds a corrected workspace
with the review model.

Screenshot text, notes, prior drafts, and tool output are all marked as untrusted data. Model tool
calls never mutate a device. Contact and calendar writes remain native iOS operations behind the
explicit revision-bound confirmation screen.

## Insight workspace

After an action is confirmed and successfully executed, a separate ReAct run receives only the
allowed evidence registry and successful action IDs. It can call `propose_insight` and
`finish_insights`. Unknown action IDs or evidence IDs are rejected again before persistence.

iOS may include up to eight contact summaries related to the confirmed card: display name,
company, job title, and whether a phone or email exists. It never uploads an address-book export or
the actual phone/email values for insight generation. This context is submitted only with the
confirmed execution result and is removed by intake/account deletion.

## Image handling and audit

JPEG, PNG, and WebP are sent as in-memory data URLs. HEIC/HEIF is converted to JPEG in memory with
Sharp. PostgreSQL clears queued screenshot bytes after success or permanent failure; history keeps
only bounded metadata and SHA-256.

Model-run audit rows contain stage, provider, model, prompt/schema versions, duration, bounded
response ID, token counts, and stable error code. They never contain the screenshot, prompt, tool
arguments, model text, API key, or Action payload.

## Real acceptance

Semantic acceptance uses the ignored private screenshot through the public authenticated API,
PostgreSQL queue, PM2 worker, and configured model. The acceptance client reports only status,
counts, action types, and validation outcomes, then deletes its intake/account. It never confirms
or executes an Action Card and never commits the screenshot.
