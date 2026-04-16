# Protocol Webhook Consumer Example

This example shows how to integrate with `@opensocial/protocol-client` using the public SDK surface.

It does three things:

1. Fetches the protocol manifest and discovery document.
2. Registers an example protocol app.
3. Starts a local webhook consumer and subscribes it to protocol delivery events.

## Repository example

- `scripts/examples/protocol-webhook-consumer.mjs`

## Run It

Build the protocol packages if your workspace has stale `dist` output:

```bash
npx pnpm --filter @opensocial/protocol-types build
npx pnpm --filter @opensocial/protocol-events build
npx pnpm --filter @opensocial/protocol-client build
```

Start the demo:

```bash
PROTOCOL_BASE_URL=http://127.0.0.1:3000 \
node --loader ./scripts/examples/protocol-example-loader.mjs \
  scripts/examples/protocol-webhook-consumer.mjs --action=demo
```

The demo:

- starts a local webhook receiver on `http://127.0.0.1:4040/webhooks/opensocial`
- registers a protocol app through `createProtocolClient(...)`
- creates a webhook subscription for protocol delivery events
- prints the app token, webhook subscription, and queue summary

## Inspect An Existing App

If you already have an `appId` and `appToken`, inspect the protocol state:

```bash
PROTOCOL_BASE_URL=http://127.0.0.1:3000 \
PROTOCOL_APP_ID=example.webhook.consumer.123 \
PROTOCOL_APP_TOKEN=<app-token> \
node --loader ./scripts/examples/protocol-example-loader.mjs \
  scripts/examples/protocol-webhook-consumer.mjs --action=inspect
```

That will print:

- the current manifest and discovery document
- registered webhooks
- grants
- consent requests
- usage and queue health

For delivery recovery and dead-letter replay, see:

- [Delivery recovery](./protocol-operator-recovery)

## What This Demonstrates

The example is narrow:

- protocol app registration
- webhook creation
- webhook delivery inspection
- grants and consent inspection
- queue health visibility

It does not add new runtime behavior. It is a concrete integration example for third-party consumers of the protocol surface.

If your workspace already links the `@opensocial/*` packages into Node resolution, the loader is optional. In this checkout, the loader keeps the example runnable without modifying workspace runtime code.
