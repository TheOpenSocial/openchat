# Protocol External Actions Reference

This reference describes the writable action surface that is already shipped in the OpenSocial protocol.

The goal is to make the supported write contract explicit for partner apps and agent integrations.

These actions stay inside the coordination-first product direction. They do not imply support for posts, follows, feeds, likes, or other generic social-network primitives.

## Shared expectations

For all external actions:

- app auth must be valid
- the app must have `actions.invoke`
- the app must have the relevant write capability
- user-delegated actions also require an active grant when the protocol layer enforces delegated access

Common blocking causes across actions:

- missing or stale app token
- missing `actions.invoke`
- missing capability such as `intent.write`, `request.write`, `chat.write`, or `circle.write`
- no active delegated grant for the acting user
- pending consent request that has not been approved yet

For auth and consent debugging, use:

- [`/Users/cruciblelabs/Documents/openchat/docs/examples/protocol-consent-and-auth-troubleshooting.md`](/Users/cruciblelabs/Documents/openchat/docs/examples/protocol-consent-and-auth-troubleshooting.md)

## Intent actions

### `intent.create`

Purpose:

- create a new coordination intent for the acting user

Expected access:

- scope: `actions.invoke`
- capability: `intent.write`

Returns:

- `ProtocolIntentActionResult`

Emits:

- `intent.created`

Common failure modes:

- missing delegated grant
- invalid or missing app token
- actor does not have permission to create via this app context

### `intent.update`

Purpose:

- update the raw text of an existing user-owned intent

Expected access:

- scope: `actions.invoke`
- capability: `intent.write`

Returns:

- `ProtocolIntentActionResult`

Emits:

- `intent.updated`

Common failure modes:

- actor does not own the intent
- missing delegated grant
- invalid token or missing capability

### `intent.cancel`

Purpose:

- cancel an existing intent and stop associated request flow

Expected access:

- scope: `actions.invoke`
- capability: `intent.write`

Returns:

- `ProtocolIntentActionResult`

Emits:

- `intent.cancelled`

Common failure modes:

- actor does not own the intent
- delegated access missing
- the intent is already effectively inactive

## Request actions

### `request.send`

Purpose:

- send a coordination request for an intent to a recipient

Expected access:

- scope: `actions.invoke`
- capability: `request.write`

Returns:

- `ProtocolRequestActionResult`

Emits:

- `request.sent`

Common failure modes:

- actor cannot act for the intent
- delegated grant missing
- recipient or intent is invalid for the current flow

### `request.accept`

Purpose:

- accept a received coordination request

Expected access:

- scope: `actions.invoke`
- capability: `request.write`

Returns:

- `ProtocolRequestActionResult`

Emits:

- `request.accepted`

Common failure modes:

- actor is not allowed to accept the request
- request is already resolved
- delegated access missing

### `request.reject`

Purpose:

- reject a received coordination request

Expected access:

- scope: `actions.invoke`
- capability: `request.write`

Returns:

- `ProtocolRequestActionResult`

Emits:

- `request.rejected`

Common failure modes:

- actor is not allowed to reject the request
- request is already resolved
- delegated access missing

## Chat action

### `chat.send_message`

Purpose:

- send a message into an existing chat

Expected access:

- scope: `actions.invoke`
- capability: `chat.write`

Returns:

- `ProtocolChatMessageActionResult`

Emits:

- `chat.message.sent`

Common failure modes:

- actor is not allowed in the chat
- delegated grant missing
- invalid chat id

## Circle actions

### `circle.create`

Purpose:

- create a recurring coordination circle

Expected access:

- scope: `actions.invoke`
- capability: `circle.write`

Returns:

- `ProtocolCircleActionResult`

Emits:

- `circle.created`

Common failure modes:

- invalid cadence or shape
- delegated grant missing
- invalid or missing app auth

### `circle.join`

Purpose:

- join a circle or add a member to a circle

Expected access:

- scope: `actions.invoke`
- capability: `circle.write`

Returns:

- `ProtocolCircleActionResult`

Emits:

- `circle.joined`

Common failure modes:

- actor is not allowed to manage membership
- circle or member is invalid
- delegated grant missing

### `circle.leave`

Purpose:

- leave a circle or remove a member from a circle

Expected access:

- scope: `actions.invoke`
- capability: `circle.write`

Returns:

- `ProtocolCircleActionResult`

Emits:

- `circle.left`

Common failure modes:

- actor is not allowed to remove the target member
- circle or member is invalid
- delegated grant missing

## Practical usage

If you want a runnable walkthrough of these actions:

- [`/Users/cruciblelabs/Documents/openchat/scripts/examples/protocol-partner-actions.mjs`](/Users/cruciblelabs/Documents/openchat/scripts/examples/protocol-partner-actions.mjs)
- [`/Users/cruciblelabs/Documents/openchat/docs/examples/protocol-partner-quickstart.md`](/Users/cruciblelabs/Documents/openchat/docs/examples/protocol-partner-quickstart.md)

If you want the agent-oriented wrapper over the same action surface:

- [`/Users/cruciblelabs/Documents/openchat/docs/examples/protocol-agent-integration-paths.md`](/Users/cruciblelabs/Documents/openchat/docs/examples/protocol-agent-integration-paths.md)
