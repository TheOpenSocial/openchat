# Manual QA Script (Staging)

## Prerequisites
- Staging deploy completed.
- `pnpm db:migrate` and `pnpm db:seed` executed against staging DB.
- Staging sandbox world prepared when testing daily-loop/mobile behavior:
  - `pnpm playground:sandbox -- --action=create --world-id=design-sandbox-v1 --reset=1`
  - `pnpm playground:sandbox -- --action=join --world-id=design-sandbox-v1 --focal-user-id=<your-staging-user-uuid>`
- Test admin headers configured:
  - `x-admin-user-id`
  - `x-admin-role`
  - `x-admin-api-key`

## Scenario A: End-to-end happy path
1. Start OAuth flow (`GET /api/auth/google`) and complete callback.
2. Create intent (`POST /api/intents`) as seeded sender user.
3. Verify request appears in recipient inbox (`GET /api/inbox/:userId/requests`).
4. Accept request (`POST /api/inbox/:requestId/accept`).
5. Confirm connection/chat exists (`GET /api/chats/:chatId/messages`).
6. Send a chat message (`POST /api/chats/:chatId/messages`) and verify readback.

Pass criteria:
- Intent reaches `fanout`/`partial`/`connected` state.
- Chat message is persisted and visible to both participants.

Operational check:
- Inspect `GET /api/admin/ops/manual-verification` before and after fanout-heavy tests.
- Use it as the default snapshot for request pressure, queue health, and auth health together.
- Read `assessment.overallStatus`, `assessment.findings`, and `assessment.nextActions` first instead of manually comparing every subsection on every run.
- If you need deeper detail, then drill into the narrower endpoints below.
- Inspect `GET /api/admin/ops/request-pressure` only when you need recipient-level detail.
- Confirm no recipient is unintentionally saturated during repeated manual test runs.

Protocol delivery check:
- Inspect `GET /api/admin/ops/manual-verification` after action, webhook, or replay-heavy tests.
- Confirm the combined snapshot does not surface a `protocol_queue` critical finding before moving on.
- Inspect `GET /api/admin/ops/protocol-queue-health` after action, webhook, or replay-heavy tests.
- Confirm:
  - `recentAttemptSummary` is not dominated by `dead_lettered`
  - `recentAttempts` show retries progressing rather than repeating the same failure forever
  - `deadLetterSample` is either empty or clearly explained by the test you just ran

Protocol auth check:
- Inspect `GET /api/admin/ops/manual-verification` during app-registration, consent, and delegated-action testing.
- Confirm the combined snapshot does not surface a `protocol_auth` critical finding before treating the scenario as product-safe.
- Inspect `GET /api/admin/ops/protocol-auth-health` during app-registration, consent, and delegated-action testing.
- Confirm:
  - executable delegation is concentrated in `user` subjects, not accidentally drifting into modeled-only subject types
  - pending consent backlog matches the scenarios you intentionally created
  - recent auth failures are understandable and bounded rather than climbing silently
  - recent auth-failure samples clearly show whether the issue is missing token, missing scopes, missing capabilities, or modeled-only non-user grants

## Scenario B: Launch control gating
1. Disable new intents via `POST /api/admin/launch-controls`:
   - `{ "enableNewIntents": false, "reason": "qa_gate" }`
2. Confirm `POST /api/intents` is rejected with service-unavailable.
3. Re-enable intents, disable realtime:
   - `{ "enableNewIntents": true, "enableRealtimeChat": false, "reason": "qa_gate" }`
4. Confirm websocket `chat.send` / `room.join` fail with `realtime_chat_disabled`.

Pass criteria:
- Launch toggles take effect immediately for guarded endpoints/events.

## Scenario C: Invite-only and cohort
1. Enable invite-only with one cohort user:
   - `{ "inviteOnlyMode": true, "alphaCohortUserIds": ["<seed-sender-user-id>"] }`
2. Verify non-cohort user is blocked on:
   - intent creation
   - discovery endpoints
   - personalization endpoints
3. Verify cohort user can access the same actions.

Pass criteria:
- Non-cohort requests are denied consistently.

## Scenario D: Moderation strictness
1. Enable moderation strictness:
   - `{ "enableModerationStrictness": true }`
2. Send a review-grade text in chat (for example content containing `underage`).
3. Verify message is blocked (not hidden as review).

Pass criteria:
- Review-grade terms escalate to blocked behavior while strictness is enabled.

## Scenario E: Privacy/compliance checks
1. Verify policy endpoints:
   - `GET /api/privacy/policy`
   - `GET /api/compliance/policy`
2. Exercise user rights APIs:
   - data export
   - message deletion
   - memory reset
3. Record terms/privacy acceptance and birth date.
4. Check eligibility response.

Pass criteria:
- All privacy/compliance endpoints return valid payloads and persist state.

## Scenario F: Protocol delivery and replay health
1. Register or reuse a protocol app with a webhook subscription.
2. Trigger a protocol-backed action that should emit a delivery.
3. Inspect `GET /api/admin/ops/manual-verification`.
4. Read `assessment.findings` first so you can tell whether the immediate problem is request pressure, queue state, or auth/configuration before drilling further.
5. If you need delivery-level detail, inspect `GET /api/admin/ops/protocol-queue-health`.
6. If you intentionally point the webhook at a failing endpoint, confirm:
   - `recentAttemptSummary` shows the expected error bucket
   - the delivery moves through `retrying` and then `dead_lettered`
7. Replay the delivery or dead-letter batch through the protocol/admin tooling after fixing the consumer.
8. Inspect the same endpoint again and confirm:
   - `recentAttempts` now show `replayed` / `delivered`
   - dead-letter backlog drops
   - `replayCursorSummary` is not quietly showing lagging or stale consumers after queue recovery

Pass criteria:
- failures are visible without raw DB inspection
- retries and replays are inspectable from the admin snapshot
- recoveries are obvious from the latest attempts

## Signoff Template
- Build SHA:
- QA owner:
- Test window (UTC):
- Result: `PASS` / `FAIL`
- Blocking issues:
- Follow-up tickets:
