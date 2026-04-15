# Protocol Partner Quickstart

This quickstart points at the two concrete example scripts that exercise the current shipped `@opensocial/protocol-client` surface:

1. [`scripts/examples/protocol-partner-onboarding.mjs`](/Users/cruciblelabs/Documents/openchat/scripts/examples/protocol-partner-onboarding.mjs)
2. [`scripts/examples/protocol-partner-actions.mjs`](/Users/cruciblelabs/Documents/openchat/scripts/examples/protocol-partner-actions.mjs)

The examples stay inside the current protocol direction:

- app registration
- delegated consent and webhook setup
- core actions for intents, requests, chats, and circles
- usage, grants, consent, and queue inspection

They do not use posts, follows, feeds, or other generic social primitives.

For event subscriptions, delivery inspection, and replay, see:

- [`docs/examples/protocol-event-subscriptions-and-replay.md`](/Users/cruciblelabs/Documents/openchat/docs/examples/protocol-event-subscriptions-and-replay.md)

## Run Them

Register a partner app and create optional consent/webhook setup:

```bash
PROTOCOL_BASE_URL=http://127.0.0.1:3000/api \
PROTOCOL_WEBHOOK_URL=http://127.0.0.1:4040/webhooks/opensocial \
PROTOCOL_OWNER_USER_ID=00000000-0000-4000-8000-000000000001 \
node --loader ./scripts/examples/protocol-example-loader.mjs \
  scripts/examples/protocol-partner-onboarding.mjs
```

Use the returned app token to run the core action example:

```bash
PROTOCOL_BASE_URL=http://127.0.0.1:3000/api \
PROTOCOL_APP_ID=partner.onboarding.123 \
PROTOCOL_APP_TOKEN=<app-token> \
PROTOCOL_ACTOR_USER_ID=00000000-0000-4000-8000-000000000001 \
PROTOCOL_RECIPIENT_USER_ID=00000000-0000-4000-8000-000000000002 \
node --loader ./scripts/examples/protocol-example-loader.mjs \
  scripts/examples/protocol-partner-actions.mjs
```

## What This Demonstrates

- app registration and token issuance
- consent request creation
- webhook subscription creation
- intent creation
- request sending
- chat message sending
- circle creation and membership actions
- grant, consent, usage, and delivery inspection
- auth failure diagnostics through usage summaries

The examples are intentionally narrow and remain coordination-first:

- circles and memberships
- notifications
- agent threads
- protocol events and delivery recovery

Do not model these as protocol primitives:

- posts
- follows
- feeds
- likes
- generic social-network timelines

## 9. Suggested first production check

Before going live, verify these three things:

1. Your app token works on a read endpoint.
2. Your webhook receiver validates signed deliveries.
3. You can replay a dead-lettered delivery without manual database access.

If all three are true, you are using the protocol surface as intended.
