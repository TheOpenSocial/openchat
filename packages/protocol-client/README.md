# @opensocial/protocol-client

Thin typed client for the current OpenSocial protocol surface.

## What is shipped

This package is a transport-backed wrapper around the protocol API. It currently covers:

- protocol manifest and discovery reads
- app registration
- app token rotation and revocation
- webhooks, grants, and consent requests
- delivery queue inspection and replay
- protocol event replay
- core coordination actions for intents, requests, chats, and circles

It depends on `@opensocial/protocol-types` and `@opensocial/protocol-events` for schemas and shared types.

## Basic usage

```ts
import {
  bindProtocolAppClient,
  createBoundProtocolAppClientFromBaseUrl,
  createProtocolClientFromBaseUrl,
} from "@opensocial/protocol-client";
import {
  buildProtocolManifest,
} from "@opensocial/protocol-server";

const client = createProtocolClientFromBaseUrl("https://api.example.com/api");
const manifest = await client.getManifest();
const appId = "partner.example";
const registration = await client.registerApp({
  registration: {
    protocolId: "opensocial.app-registration.v1",
    appId,
    name: "Partner App",
    summary: "Example partner integration",
    description: "Registers a partner app against the OpenSocial protocol.",
    kind: "server",
    status: "draft",
    ownerUserId: "00000000-0000-4000-8000-000000000001",
    redirectUris: [],
    capabilities: manifest.capabilities,
    metadata: {},
  },
  manifest: buildProtocolManifest({
    appId,
    name: "Partner App",
    homepageUrl: "https://partner.example.com",
  }),
  requestedScopes: ["protocol.read", "actions.invoke"],
  requestedCapabilities: ["app.read", "intent.write"],
});

const app = bindProtocolAppClient(client, {
  appId: registration.registration.appId,
  appToken: registration.credentials.appToken,
});

const webhook = await app.createWebhook({
  targetUrl: "https://partner.example.com/webhooks/protocol",
  events: ["intent.created"],
  resources: ["intent"],
  deliveryMode: "json",
});

const sameApp = createBoundProtocolAppClientFromBaseUrl(
  "https://api.example.com/api",
  {
    appId: registration.registration.appId,
    appToken: registration.credentials.appToken,
  },
);
```

## Troubleshooting

If a write action is denied, inspect the app usage summary before assuming the transport is broken:

```ts
const usage = await app.getAppUsageSummary();
console.log(usage.authFailures);
console.log(usage.tokenAudit);
console.log(usage.grantAudit);
```

Use [`/Users/cruciblelabs/Documents/openchat/docs/examples/protocol-consent-and-auth-troubleshooting.md`](/Users/cruciblelabs/Documents/openchat/docs/examples/protocol-consent-and-auth-troubleshooting.md) for the current consent/grant debugging flow.

## Exclusions

This package does not provide:

- storage for app tokens, grants, or webhook state
- HTTP server routing
- automatic retries or background delivery workers
- auth/session management for end users
- any social-network primitives outside the protocol contract

Use [`/Users/cruciblelabs/Documents/openchat/docs/examples/protocol-partner-quickstart.md`](/Users/cruciblelabs/Documents/openchat/docs/examples/protocol-partner-quickstart.md) for an end-to-end walkthrough using the shipped example scripts.

It also does not expose generic feed/post/follow primitives. The protocol intentionally stays centered on coordination, messaging, and agentic actions.
