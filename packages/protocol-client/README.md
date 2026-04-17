# @opensocial/protocol-client

Typed transport client for the OpenSocial protocol surface.

## What is shipped

This package wraps the protocol API and covers:

- protocol manifest and discovery reads
- app registration
- app token rotation and revocation
- webhooks, grants, and consent requests
- delivery queue inspection and replay
- protocol event replay
- core coordination actions for intent lifecycle, requests, chats, and circles

It depends on `@opensocial/protocol-types` for the shared schemas.

## Basic usage

```ts
import {
  bindProtocolAppClient,
  createBoundProtocolAppClientFromBaseUrl,
  createProtocolClientFromBaseUrl,
} from "@opensocial/protocol-client";

const client = createProtocolClientFromBaseUrl("https://api.example.com/api");
const protocolManifest = await client.getManifest();
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
    capabilities: protocolManifest.capabilities,
    metadata: {},
  },
  manifest: {
    ...protocolManifest,
    appId,
    manifestId: "partner.example.manifest",
    name: "Partner App",
    homepageUrl: "https://partner.example.com",
  },
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
```

## Troubleshooting

If a write action is denied, inspect the app usage summary first:

```ts
const usage = await app.getAppUsageSummary();
console.log(usage.authFailureCounts);
console.log(usage.tokenAudit);
console.log(usage.grantAudit);
```

`usage.tokenAudit` now also exposes:

- `currentTokenIssuedAt`
- `recommendedRotateBy`
- `tokenAgeDays`
- `rotationWindowDays`
- `freshness`

So partners can tell whether a credential is still current, should rotate soon, or is already outside the recommended rotation window.

For consent and grant debugging, see [`/Users/cruciblelabs/Documents/openchat/docs/examples/protocol-consent-and-auth-troubleshooting.md`](/Users/cruciblelabs/Documents/openchat/docs/examples/protocol-consent-and-auth-troubleshooting.md).

## Exclusions

This package does not provide:

- storage for app tokens, grants, or webhook state
- HTTP server routing
- automatic retries or background delivery workers
- auth/session management for end users
- any social-network primitives outside the protocol contract

Related docs:

- [`/Users/cruciblelabs/Documents/openchat/docs/examples/protocol-sdk-index.md`](/Users/cruciblelabs/Documents/openchat/docs/examples/protocol-sdk-index.md)
- [`/Users/cruciblelabs/Documents/openchat/docs/examples/protocol-manifest-and-discovery.md`](/Users/cruciblelabs/Documents/openchat/docs/examples/protocol-manifest-and-discovery.md)
- [`/Users/cruciblelabs/Documents/openchat/docs/examples/protocol-app-registration-and-tokens.md`](/Users/cruciblelabs/Documents/openchat/docs/examples/protocol-app-registration-and-tokens.md)
- [`/Users/cruciblelabs/Documents/openchat/docs/examples/protocol-external-actions-reference.md`](/Users/cruciblelabs/Documents/openchat/docs/examples/protocol-external-actions-reference.md)
- [`/Users/cruciblelabs/Documents/openchat/docs/examples/protocol-partner-quickstart.md`](/Users/cruciblelabs/Documents/openchat/docs/examples/protocol-partner-quickstart.md)

It also does not expose generic feed/post/follow primitives. The protocol intentionally stays centered on coordination, messaging, and agentic actions.

For queue health, auth-failure triage, and replay operations, use:

- [`/Users/cruciblelabs/Documents/openchat/docs/examples/protocol-operator-recovery.md`](/Users/cruciblelabs/Documents/openchat/docs/examples/protocol-operator-recovery.md)
- [`/Users/cruciblelabs/Documents/openchat/docs/examples/protocol-production-readiness-checklist.md`](/Users/cruciblelabs/Documents/openchat/docs/examples/protocol-production-readiness-checklist.md)
