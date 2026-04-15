# Protocol Operator Recovery And Queue Health

This guide is the day-two companion to the partner quickstart.

Use it when a protocol integration is already running and you need to answer questions like:

- is this an auth problem or a delivery problem?
- are dead letters accumulating?
- should I replay one delivery or a batch?
- is the queue draining or stuck?

## Files

- [`/Users/cruciblelabs/Documents/openchat/scripts/examples/protocol-partner-operations.mjs`](/Users/cruciblelabs/Documents/openchat/scripts/examples/protocol-partner-operations.mjs)
- [`/Users/cruciblelabs/Documents/openchat/docs/examples/protocol-consent-and-auth-troubleshooting.md`](/Users/cruciblelabs/Documents/openchat/docs/examples/protocol-consent-and-auth-troubleshooting.md)
- [`/Users/cruciblelabs/Documents/openchat/docs/examples/protocol-event-subscriptions-and-replay.md`](/Users/cruciblelabs/Documents/openchat/docs/examples/protocol-event-subscriptions-and-replay.md)

## 1. Inspect The App Operational Snapshot

The fastest first check is the app-level operational snapshot:

```bash
PROTOCOL_BASE_URL=http://127.0.0.1:3000/api \
PROTOCOL_APP_ID=partner.onboarding.123 \
PROTOCOL_APP_TOKEN=<app-token> \
node --loader ./scripts/examples/protocol-example-loader.mjs \
  scripts/examples/protocol-partner-operations.mjs --action=inspect
```

This prints:

- auth-failure summary
- token and grant audit timestamps
- queue-health summary
- current queue counts
- current webhooks
- current grants
- current consent requests

Use this first because it tells you whether the problem is:

- auth
- delegated access
- delivery backlog
- dead-letter accumulation

## 2. Replay One Known Failed Delivery

If one delivery is dead-lettered and the consumer is fixed:

```bash
PROTOCOL_BASE_URL=http://127.0.0.1:3000/api \
PROTOCOL_APP_ID=partner.onboarding.123 \
PROTOCOL_APP_TOKEN=<app-token> \
node --loader ./scripts/examples/protocol-example-loader.mjs \
  scripts/examples/protocol-partner-operations.mjs \
  --action=replay-delivery \
  --delivery-id=<delivery-id>
```

Use this when the issue was isolated and you want the narrowest possible recovery.

## 3. Replay Dead Letters In Batches

If the receiver was down or a parsing/signature bug affected many deliveries:

```bash
PROTOCOL_BASE_URL=http://127.0.0.1:3000/api \
PROTOCOL_APP_ID=partner.onboarding.123 \
PROTOCOL_APP_TOKEN=<app-token> \
node --loader ./scripts/examples/protocol-example-loader.mjs \
  scripts/examples/protocol-partner-operations.mjs \
  --action=replay-dead-letters \
  --limit=25
```

Use batch replay only after the underlying issue is fixed.

## 4. Dispatch Due Queue Work

If you want to trigger queue work for the app directly:

```bash
PROTOCOL_BASE_URL=http://127.0.0.1:3000/api \
PROTOCOL_APP_ID=partner.onboarding.123 \
PROTOCOL_APP_TOKEN=<app-token> \
node --loader ./scripts/examples/protocol-example-loader.mjs \
  scripts/examples/protocol-partner-operations.mjs \
  --action=dispatch-queue \
  --limit=25
```

This is useful for controlled recovery, but it is not a substitute for fixing auth or delivery bugs.

## Recovery Order

Use this sequence:

1. inspect the operational snapshot
2. decide whether the problem is auth or delivery
3. fix the underlying cause
4. replay one delivery if the failure was isolated
5. replay dead letters in batches if the failure was systemic

That keeps recovery narrow and avoids turning the queue into a guessing game.

## Signs It Is An Auth Problem

Check:

- `authFailures.total`
- recent auth-failure entries
- token audit timestamps
- grant audit timestamps

If those look wrong, use the consent/auth troubleshooting guide first instead of replaying deliveries blindly.

## Signs It Is A Delivery Problem

Check:

- dead-letter count rising
- retrying count not draining
- oldest queued timestamp getting older
- last dead-letter timestamp moving forward

Those are queue and delivery symptoms, not consent problems.
