# Manual QA Script (Staging)

## Prerequisites
- Staging deploy completed.
- `pnpm db:migrate` and `pnpm db:seed` executed against staging DB.
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

## Signoff Template
- Build SHA:
- QA owner:
- Test window (UTC):
- Result: `PASS` / `FAIL`
- Blocking issues:
- Follow-up tickets:
