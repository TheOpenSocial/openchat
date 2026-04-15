# Protocol App Registration And Token Lifecycle

This guide is for partner developers setting up a real OpenSocial protocol app.

Use it when you need one clear path for:

- app registration
- token issuance
- token rotation
- token revocation
- validating that your app session is still usable

It stays inside the shipped coordination-first protocol surface. It does not assume posts, follows, feeds, or other generic social-network primitives exist.

## Mental model

A protocol app has two different identity layers:

1. Registration identity
   - the persisted protocol app record
   - its metadata, requested scopes, and requested capabilities

2. Runtime credentials
   - the current app token issued for that app
   - used on every authenticated protocol request

Registration is durable. Tokens are lifecycle-managed credentials.

## What registration stores

At a high level, the app record captures:

- `appId`
- app name and summary
- app kind and status
- owner user id
- redirect URIs
- capability manifest
- requested scopes
- requested capabilities
- integration metadata

The backend persists the app registration and stores app-token material in hashed form. Treat the issued token like a secret. You will not get a second copy later by reading the app record back.

## Register a new app

The simplest path is the protocol client plus the partner onboarding example.

### Example using the client directly

```ts
import { createProtocolClientFromBaseUrl } from "@opensocial/protocol-client";

const client = createProtocolClientFromBaseUrl("https://api.example.com/api");
const protocolManifest = await client.getManifest();

const registration = await client.registerApp({
  registration: {
    protocolId: "opensocial.app-registration.v1",
    appId: "partner.example",
    name: "Partner Example",
    summary: "Example coordination integration",
    description: "Registers a partner app against OpenSocial protocol.",
    kind: "server",
    status: "draft",
    ownerUserId: "00000000-0000-4000-8000-000000000001",
    redirectUris: ["https://partner.example.com/callback"],
    capabilities: protocolManifest.capabilities,
    metadata: {
      environment: "sandbox",
    },
  },
  manifest: {
    ...protocolManifest,
    appId: "partner.example",
    manifestId: "partner.example.manifest",
    name: "Partner Example",
    homepageUrl: "https://partner.example.com",
  },
  requestedScopes: ["protocol.read", "actions.invoke"],
  requestedCapabilities: ["app.read", "intent.write", "request.write"],
});

console.log(registration.registration.appId);
console.log(registration.credentials.appToken);
```

### Example using the shipped script

```bash
PROTOCOL_BASE_URL=http://127.0.0.1:3000/api \
PROTOCOL_WEBHOOK_URL=http://127.0.0.1:4040/webhooks/opensocial \
PROTOCOL_OWNER_USER_ID=00000000-0000-4000-8000-000000000001 \
node --loader ./scripts/examples/protocol-example-loader.mjs \
  scripts/examples/protocol-partner-onboarding.mjs
```

See:

- [`/Users/cruciblelabs/Documents/openchat/scripts/examples/protocol-partner-onboarding.mjs`](/Users/cruciblelabs/Documents/openchat/scripts/examples/protocol-partner-onboarding.mjs)

## What happens at registration time

After successful registration:

- the app row is persisted
- issued scopes and capabilities are resolved for that app
- an app token is issued once
- the token becomes the credential you use for protocol requests

Do this immediately after registration:

1. persist `appId`
2. persist the issued token in your secret store
3. bind a client session with that token
4. verify the session on a read call before doing writes

## Bind an app-scoped client

```ts
import { createBoundProtocolAppClientFromBaseUrl } from "@opensocial/protocol-client";

const app = createBoundProtocolAppClientFromBaseUrl(
  "https://api.example.com/api",
  {
    appId: process.env.OPENSOCIAL_APP_ID!,
    appToken: process.env.OPENSOCIAL_APP_TOKEN!,
  },
);

const usage = await app.getAppUsageSummary();
console.log(usage.authFailures);
```

This is the easiest first validation step because it proves:

- the token is present
- the token is structurally accepted
- the app is not revoked
- auth diagnostics are reachable

## Rotate a token

Rotate when:

- a secret may have leaked
- you are moving to a new deployment environment
- you want regular credential hygiene

Example:

```ts
const rotated = await app.rotateAppToken();
console.log(rotated.credentials.appToken);
```

Operational rules:

- store the new token before cutting traffic over
- stop using the old token immediately after rotation
- treat rotation as a secret rollout, not just an API response

The usage summary helps verify rotation state:

```ts
const usage = await app.getAppUsageSummary();
console.log(usage.tokenAudit.lastRotatedAt);
console.log(usage.authFailures.recent);
```

## Revoke a token or app

Revoke when:

- the app should no longer be trusted
- an environment should be shut down completely
- a credential is known to be compromised

Example:

```ts
await app.revokeAppToken({
  reason: "Decommissioning sandbox integration",
});
```

After revocation:

- old authenticated requests should fail
- usage-summary auth diagnostics should show the failures
- any fresh writes should stop until a new valid token exists

## Common token lifecycle mistakes

### Registering but not persisting the token

Typical result:

- registration succeeded once
- later requests fail because the original issued token was lost

Fix:

- save the issued token at registration time
- do not rely on re-reading the app record to recover it

### Rotating without updating the runtime secret

Typical result:

- some environments still use the old token
- failures look random across deployments

Fix:

- rotate only when you have a rollout path ready
- update the bound client configuration everywhere

### Treating consent as token replacement

Typical result:

- app auth is valid
- user-scoped writes still fail

Fix:

- token auth proves the app
- delegated consent/grants still gate user-scoped actions

For that flow, use:

- [`/Users/cruciblelabs/Documents/openchat/docs/examples/protocol-consent-and-auth-troubleshooting.md`](/Users/cruciblelabs/Documents/openchat/docs/examples/protocol-consent-and-auth-troubleshooting.md)

## Recommended production checklist

Before enabling writes from a new partner app:

1. register the app and store `appId`
2. store the issued token in a real secret manager
3. bind an app-scoped client and verify a read call
4. inspect usage summary for empty or understandable auth failures
5. only then add consent, grants, webhook subscriptions, and write actions

## Related guides

- [`/Users/cruciblelabs/Documents/openchat/docs/examples/protocol-partner-quickstart.md`](/Users/cruciblelabs/Documents/openchat/docs/examples/protocol-partner-quickstart.md)
- [`/Users/cruciblelabs/Documents/openchat/docs/examples/protocol-consent-and-auth-troubleshooting.md`](/Users/cruciblelabs/Documents/openchat/docs/examples/protocol-consent-and-auth-troubleshooting.md)
- [`/Users/cruciblelabs/Documents/openchat/docs/examples/protocol-external-actions-reference.md`](/Users/cruciblelabs/Documents/openchat/docs/examples/protocol-external-actions-reference.md)
- [`/Users/cruciblelabs/Documents/openchat/docs/examples/protocol-operator-recovery.md`](/Users/cruciblelabs/Documents/openchat/docs/examples/protocol-operator-recovery.md)
