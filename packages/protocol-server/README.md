# @opensocial/protocol-server

Protocol-side helpers for the current OpenSocial protocol surface.

## What is shipped

This package currently provides:

- protocol manifest and discovery builders
- the current webhook signature helper used by the protocol delivery runner
- shared helpers for partner-facing protocol verification flows

The package is designed to support the protocol layer in `apps/api`, not to replace it.

## Basic usage

```ts
import {
  buildProtocolDiscoveryDocument,
  buildProtocolManifest,
  buildProtocolWebhookRequest,
  verifyProtocolWebhookRequest,
} from "@opensocial/protocol-server";

const manifest = buildProtocolManifest({
  appId: "opensocial-first-party",
});

const discovery = buildProtocolDiscoveryDocument();

const request = buildProtocolWebhookRequest({
  secret: "shared-secret",
  body: JSON.stringify({ hello: "world" }),
});

const ok = verifyProtocolWebhookRequest({
  secret: "shared-secret",
  body: request.body,
  headers: request.headers,
});
```

## Exclusions

This package does not provide:

- an HTTP server or framework integration
- persisted app registration, grant, or webhook storage
- webhook dispatch, retries, or queue processing
- partner OAuth, consent UI, or full auth flows
- generic social-network primitives such as posts, follows, feeds, or likes

If you need the backend runtime, use `apps/api`. If you need the transport client, use `@opensocial/protocol-client`.

Use [`/Users/cruciblelabs/Documents/openchat/docs/examples/protocol-partner-quickstart.md`](/Users/cruciblelabs/Documents/openchat/docs/examples/protocol-partner-quickstart.md) for the current partner onboarding flow.
