# AI provider integration

LittleTask has one runtime provider and one test double selected by `AI_PROVIDER`:

- `openai`: the only provider accepted in development and production; it performs multimodal analysis through the fixed OpenAI-compatible Responses API.
- `fake`: a deterministic test double accepted only when `NODE_ENV=test`. It cannot start a development or production process.

## Runtime contract

The real provider uses these defaults:

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

`OPENAI_API_KEY` must be injected through the process environment or deployment secret store. Never add it to this file, `.env.example`, PM2 configuration committed to Git, logs, screenshots, issues, or pull requests.

The SDK resolves the configured base URL to `POST /responses`. Each intake makes two independent stateless requests:

1. **Analysis:** screenshot, optional note, current time, locale, and timezone -> structured draft.
2. **Review:** original inputs plus the candidate draft -> complete corrected draft.

Both requests set:

- `store: false`;
- `reasoning.effort: xhigh`;
- `detail: original` for image input;
- a strict Zod-backed `text.format` JSON schema.

The same required field contract is also embedded in the analysis and review instructions because
an OpenAI-compatible gateway may accept `text.format` without enforcing it. This is only a
compatibility aid: the provider still parses the returned JSON through the model-facing Zod schema
and then through the narrower domain schema before any Action Card can be persisted.

The model-facing schema uses required nullable fields because strict Structured Outputs requires every property to be present. The provider converts those nullable values back into the narrower application contract and validates the result again before materializing Action Cards.

Each provider result carries a separate minimal telemetry envelope. The service persists a bounded
response ID plus non-negative input, output, and total token counts when the gateway supplies them.
Structured-output validation failures retain that metadata for cost and reliability auditing, but
never persist the model body.

## Security boundaries

- Screenshot text, the optional note, and the first-pass draft are explicitly marked as untrusted data in the prompts.
- The model can only propose `create_event`, `create_contact`, and `update_contact`; it cannot execute them.
- Evidence must quote the screenshot or note. Unsupported claims should be removed by the review pass.
- No device contact IDs are invented. Contact matching remains a local/native stage.
- Gateway errors are mapped to stable messages so upstream bodies, headers, and credentials do not enter intake history.
- JPEG, PNG, and WebP are sent as in-memory data URLs. HEIC/HEIF is converted to JPEG in memory with Sharp.

## Verification

The automated provider tests use an in-process fetch double and verify both wire requests, including model routing, the image data URL, strict schema, `xhigh`, and `store: false`. They never call the paid gateway.

Before deploying:

1. Rotate any credential that has appeared in chat, terminal output, or another non-secret channel.
2. Inject the new key only into the target process environment.
3. Run a synthetic screenshot through the configured gateway.
4. Confirm both requests reach `/responses` and return a parsed draft.
5. Confirm the returned response reports the expected model and `store: false` behavior.
6. Test Chinese, English, mixed-language, ambiguous-time, irrelevant-image, prompt-injection, and unreadable-text fixtures.
7. Keep fake-provider use explicit and confined to test process configuration.

Run the non-content-logging capability probe with the runtime key before the full eval:

```powershell
$env:OPENAI_API_KEY='<runtime-secret>'
corepack pnpm probe:ai
Remove-Item Env:OPENAI_API_KEY
```

The probe renders a synthetic screenshot in memory and reports only completion state, output type
and length, JSON/schema validity, and invalid field paths. It never prints the key, prompt, image,
model text, Action payload, or response ID.

Reference behavior follows the official OpenAI [vision input](https://developers.openai.com/api/docs/guides/images-vision) and [Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs) contracts. The configured gateway remains subject to an explicit compatibility smoke test.

The synthetic end-to-end suite is documented in [ai-evals.md](./ai-evals.md).
