# Partner Agent Integration Plan

This note explains how third-party or partner agents should fit the current OpenSocial protocol direction without assuming unsupported scope.

## What Is Already Shipped

Partners can already integrate against the protocol layer in these ways:

- Register a protocol app and receive an app token.
- Read the protocol manifest and discovery document.
- Subscribe to webhooks and verify signed deliveries.
- Inspect delivery records, replay cursors, queue health, and dead-letter recovery.
- Use scoped grants and consent requests for delegated access.
- Call the supported external actions for coordination primitives:
  - `intent.create`
  - `intent.update`
  - `intent.cancel`
  - `request.send`
  - `request.accept`
  - `request.reject`
  - `chat.send_message`
  - `circle.create`
  - `circle.join`
  - `circle.leave`
- Inspect auth-failure summaries when access is denied.
- Use a thin agent-oriented client wrapper on top of the protocol client for actor defaults and readiness inspection.
- Use readiness evaluation before scheduled or autonomous agent work so auth, grant, and queue failures are caught early.
- Use the wrapper’s assert-ready path when the agent should hard-stop on operational blockers before acting.

## What Third-Party Agents Should Assume

Agents should treat the protocol as a coordination layer, not a generic social SDK.

- The core domain is identity, profiles, intents, requests, connections, chats, circles, notifications, agent threads, and realtime events.
- Posts, follows, feeds, likes, and similar generic social primitives are intentionally out of scope.
- Agents should act through explicit protocol actions, not through private backend modules or direct database assumptions.
- Human approval and delegated grants remain part of the model when an agent acts on behalf of a user.

## Recommended Integration Shape

The cleanest integration path is:

1. Register the partner app.
2. Request only the scopes and capabilities the agent actually needs.
3. Subscribe to the event families that the agent reacts to.
4. Execute supported actions through the protocol client or HTTP API.
5. Use replay and dead-letter recovery when event delivery is interrupted.
6. Surface all agent-side actions in a user-visible audit trail.

## What Is Still Planned

The following pieces are directionally correct but should still be treated as in-progress work:

- First-class agent registration UX and policy controls.
- Broader agent-specific action routing beyond the currently supported coordination primitives.
- More polished consent and grant UX for partner-managed workflows.
- Partner-facing examples for long-lived production agent deployments.

## Guardrails

- Do not add posts or follows to the partner-agent surface.
- Do not expose raw backend internals as the integration contract.
- Do not expand the protocol just to fit a partner request if it does not match the current product direction.
- Prefer stable protocol actions, scopes, and events over one-off special cases.

## Current Bottom Line

Third-party agents can already participate in OpenSocial as protocol apps with scoped reads, writes, and event subscriptions.
What is not finished yet is the higher-level SDK and partner UX around that foundation.

For current day-two operations, use the shipped partner/operator guides:

- [`/Users/cruciblelabs/Documents/openchat/docs/examples/protocol-consent-and-auth-troubleshooting.md`](/Users/cruciblelabs/Documents/openchat/docs/examples/protocol-consent-and-auth-troubleshooting.md)
- [`/Users/cruciblelabs/Documents/openchat/docs/examples/protocol-operator-recovery.md`](/Users/cruciblelabs/Documents/openchat/docs/examples/protocol-operator-recovery.md)
- [`/Users/cruciblelabs/Documents/openchat/docs/examples/protocol-agent-quickstart.md`](/Users/cruciblelabs/Documents/openchat/docs/examples/protocol-agent-quickstart.md)
- [`/Users/cruciblelabs/Documents/openchat/scripts/examples/protocol-partner-agent.mjs`](/Users/cruciblelabs/Documents/openchat/scripts/examples/protocol-partner-agent.mjs)
- [`/Users/cruciblelabs/Documents/openchat/docs/examples/protocol-agent-readiness.md`](/Users/cruciblelabs/Documents/openchat/docs/examples/protocol-agent-readiness.md)
