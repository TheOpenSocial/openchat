# Protocol Event Subscriptions and Replay

This guide focuses on the shipped event surfaces in the current OpenSocial protocol layer:

- app registration
- webhook subscription creation
- webhook delivery inspection
- single-delivery replay
- dead-letter batch replay
- event-stream replay from a saved cursor

It complements the partner quickstart and stays inside the current coordination-first protocol direction. It does not introduce posts, follows, feeds, or other social-network primitives.

## When To Use This

Use this guide when your integration needs to:

1. receive protocol events as they happen
2. inspect webhook deliveries after a failure
3. replay one failed delivery or a batch of dead letters
4. resume an event feed from a saved cursor

## Shipped Client Surfaces

The current `@opensocial/protocol-client` surface includes these methods:

- `createWebhook(appId, appToken, payload)`
- `listWebhooks(appId, appToken)`
- `listWebhookDeliveries(appId, appToken, subscriptionId)`
- `listWebhookDeliveryAttempts(appId, appToken, deliveryId)`
- `replayWebhookDelivery(appId, appToken, deliveryId)`
- `replayDeadLetteredDeliveries(appId, appToken, input)`
- `inspectDeliveryQueue(appId, appToken, cursor)`
- `replayEvents(appId, appToken, cursor)`
- `getReplayCursor(appId, appToken)`
- `saveReplayCursor(appId, appToken, cursor)`

The server-side webhook helpers live in `@opensocial/protocol-server` and provide signature helpers for webhook receivers.

## 1. Subscribe To Events

Start by registering a partner app, then create a webhook subscription for the event families you care about.

```ts
import { createProtocolClientFromBaseUrl } from "@opensocial/protocol-client";

const client = createProtocolClientFromBaseUrl("http://127.0.0.1:3000/api");

const subscription = await client.createWebhook(
  "partner.example",
  "<app-token>",
  {
    targetUrl: "https://partner.example.com/webhooks/protocol",
    events: [
      "intent.created",
      "intent.updated",
      "request.sent",
      "request.accepted",
      "request.rejected",
      "chat.message.created",
      "circle.created",
      "circle.member.joined",
      "circle.member.left",
    ],
    resources: ["intent", "request", "chat", "circle"],
    deliveryMode: "json",
  },
);
```

Keep the subscription narrow. The protocol is coordination-first, so subscribe only to the event families your integration actually handles.

## 2. Inspect Deliveries

If a webhook does not arrive, inspect the subscription deliveries first.

```ts
const deliveries = await client.listWebhookDeliveries(
  "partner.example",
  "<app-token>",
  subscription.webhookId,
);

const attempts = await client.listWebhookDeliveryAttempts(
  "partner.example",
  "<app-token>",
  deliveries[0].deliveryId,
);
```

What to look for:

- `queued` deliveries that never moved
- `retrying` deliveries that need another attempt
- `dead_lettered` deliveries that should be replayed manually

## 3. Replay A Single Delivery

Use single-delivery replay when the receiver is fixed and you want to resend one known failed item.

```ts
await client.replayWebhookDelivery(
  "partner.example",
  "<app-token>",
  "<delivery-id>",
);
```

This is the narrowest recovery path and is the safest first choice for one failed message.

## 4. Replay Dead Letters In Batches

If you have a backlog of dead-lettered deliveries, replay them in batches.

```ts
await client.replayDeadLetteredDeliveries("partner.example", "<app-token>", {
  limit: 25,
});
```

Use batch replay when:

- the consumer was down for a while
- you fixed a systematic signature or parsing issue
- you want to recover without manually selecting individual delivery ids

## 5. Resume Event Streams

If your integration stores a replay cursor, save it after processing and restore from it later.

```ts
const cursor = await client.getReplayCursor("partner.example", "<app-token>");

const events = await client.replayEvents(
  "partner.example",
  "<app-token>",
  cursor.cursor,
);

await client.saveReplayCursor(
  "partner.example",
  "<app-token>",
  events.at(-1)?.cursor ?? cursor.cursor,
);
```

This is useful for:

- cold starts
- backfills
- rebuilding an integration after downtime

## 6. Verify Your Receiver

The shipped protocol-server helper verifies the signature on webhook deliveries.

At a high level:

1. read the raw request body
2. read the protocol signature header
3. verify the signature with your shared secret
4. reject unsigned or mismatched requests before processing

The helper package is intentionally small so you can use it in your own service without importing backend runtime code.

## Safe Recovery Order

When something fails, use this order:

1. inspect the delivery
2. replay a single delivery if the issue was isolated
3. replay dead letters in batches if the issue was systemic
4. replay events from a cursor only if you need to rebuild downstream state

That sequence keeps recovery narrow and avoids unnecessary duplicate processing.

## What Not To Build

Do not treat the protocol as a generic social feed API.

Do not model:

- posts
- follows
- likes
- global timelines
- broadcast-only social primitives

The current protocol is centered on coordination, messaging, circles, and recoverable delivery.

