# Protocol Manifest And Discovery

This guide is the safest first read for a new OpenSocial protocol integration.

Use it before app registration when you want to answer:

- what protocol surface is this server advertising
- which capabilities exist
- which exclusions are explicit
- which routes and resources should my integration assume are live

It is the bootstrap step that keeps partner code grounded in the shipped contract instead of assumptions.

## Why this matters

The OpenSocial protocol is intentionally narrow.

It is coordination-first, not a generic social-network SDK. That means a partner should discover the live contract before trying to register, request capabilities, or invoke actions.

The two foundational reads are:

1. manifest
2. discovery document

Together they tell you what kind of protocol server you are talking to and what integration paths it expects.

## Shipped client surface

The current `@opensocial/protocol-client` already exposes:

- `getManifest()`
- `getDiscovery()`

That means every serious integration can start from a read-only bootstrap flow.

## 1. Read the manifest

The manifest is the high-level identity and policy document for the protocol server.

Typical uses:

- confirm you are pointed at the expected server
- inspect capability vocabulary before registration
- inspect metadata that explains exclusions and policy

Example:

```ts
import { createProtocolClientFromBaseUrl } from "@opensocial/protocol-client";

const client = createProtocolClientFromBaseUrl("https://api.example.com/api");

const manifest = await client.getManifest();

console.log(manifest.id);
console.log(manifest.name);
console.log(manifest.capabilities);
console.log(manifest.metadata);
```

What to look for first:

- protocol identity and name
- capability names
- any metadata that clarifies unsupported primitives or policy

Do not skip this if your integration is deciding what it can ask for at registration time.

## 2. Read the discovery document

The discovery document is the more operational bootstrap read.

Typical uses:

- verify the protocol routes exposed by the server
- inspect integration endpoints before you hardcode behavior
- understand where replay, delivery, and app flows live

Example:

```ts
const discovery = await client.getDiscovery();

console.log(discovery.protocolVersion);
console.log(discovery.baseUrl);
console.log(discovery.resources);
console.log(discovery.actions);
```

The exact fields matter less than the habit:

- use discovery to align your integration to the live server
- do not assume every partner environment exposes the same operational shape forever

## 3. Bootstrap registration from discovery, not guesswork

A good partner flow is:

1. fetch manifest
2. fetch discovery
3. decide which capabilities and scopes you actually need
4. only then register the app

That sequence helps prevent two common mistakes:

- requesting capabilities your integration does not actually use
- assuming unsupported primitives exist because they exist in some other platform

## 4. Use manifest to enforce exclusions in your own code

OpenSocial intentionally excludes:

- posts
- follows
- feeds
- likes
- generic timeline primitives

Your integration should treat those as unsupported by design, not as missing features that need a workaround.

If you need a feed-style abstraction, you are outside the intended protocol surface.

## 5. Recommended bootstrap snippet

This is the minimal pre-registration sequence:

```ts
import { createProtocolClientFromBaseUrl } from "@opensocial/protocol-client";

const client = createProtocolClientFromBaseUrl(process.env.PROTOCOL_BASE_URL!);

const [manifest, discovery] = await Promise.all([
  client.getManifest(),
  client.getDiscovery(),
]);

console.log({
  protocol: manifest.name,
  capabilities: manifest.capabilities,
  resources: discovery.resources,
  actions: discovery.actions,
});
```

If this output does not match your intended integration, stop there and fix the environment or integration assumptions before registering an app.

## 6. What to do next

Once manifest and discovery look right:

1. register the app
2. store the issued token safely
3. inspect usage summary with the app-scoped client
4. only then move to consent, webhooks, and write actions

Use these guides next:

- [`/Users/cruciblelabs/Documents/openchat/docs/examples/protocol-app-registration-and-tokens.md`](/Users/cruciblelabs/Documents/openchat/docs/examples/protocol-app-registration-and-tokens.md)
- [`/Users/cruciblelabs/Documents/openchat/docs/examples/protocol-partner-quickstart.md`](/Users/cruciblelabs/Documents/openchat/docs/examples/protocol-partner-quickstart.md)
- [`/Users/cruciblelabs/Documents/openchat/docs/examples/protocol-external-actions-reference.md`](/Users/cruciblelabs/Documents/openchat/docs/examples/protocol-external-actions-reference.md)

## Recommended rule

Never start a production integration with write actions first.

Start with:

1. manifest
2. discovery
3. registration
4. token validation

That order keeps the SDK honest and keeps partner assumptions aligned with the real protocol.
