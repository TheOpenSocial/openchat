# Protocol Consent And Auth Troubleshooting

This guide is for partner developers integrating with the current OpenSocial protocol surface.

Use it when a protocol action fails and you need to tell whether the problem is:

- missing or invalid app auth
- missing scopes or capabilities
- missing delegated consent
- revoked access

## Mental model

There are two different gates in the current protocol:

1. App-level auth
   - your app token proves which protocol app is calling
   - your app registration determines which scopes and capabilities were issued

2. Delegated user access
   - some actions also require an active grant for a specific user
   - consent requests are not grants yet
   - an approved consent request is what becomes an active grant

If app auth is valid but delegated access is missing, writes can still fail.

## Fastest diagnostic flow

Start with the app-scoped client:

```ts
import {
  createBoundProtocolAppClientFromBaseUrl,
} from "@opensocial/protocol-client";

const app = createBoundProtocolAppClientFromBaseUrl(
  "https://api.example.com/api",
  {
    appId: process.env.OPENSOCIAL_APP_ID!,
    appToken: process.env.OPENSOCIAL_APP_TOKEN!,
  },
);

const usage = await app.getAppUsageSummary();
console.log(JSON.stringify(usage.authFailures, null, 2));
console.log(JSON.stringify(usage.tokenAudit, null, 2));
console.log(JSON.stringify(usage.grantAudit, null, 2));
```

Look at:

- `authFailures.total`
- `authFailures.recent`
- `tokenAudit.lastRotatedAt`
- `tokenAudit.lastRevokedAt`
- `grantAudit.lastGrantedAt`
- `grantAudit.lastRevokedAt`

## Common failure patterns

### Missing token

Typical symptom:

- request is denied before any delegated grant check matters

What to inspect:

- confirm `x-protocol-app-token` is present
- confirm you are using the current token after rotation
- inspect `usage.authFailures.recent`

Likely fix:

- update your integration to use the latest issued token

### Revoked or stale token

Typical symptom:

- requests that used to work start failing consistently

What to inspect:

- `tokenAudit.lastRevokedAt`
- `tokenAudit.lastRotatedAt`
- any recent auth-failure entries

Likely fix:

- rotate the token intentionally
- store the new token safely
- stop using the old one

### Missing scope or capability

Typical symptom:

- app can read protocol state but cannot invoke a write action

What to inspect:

- the app registration’s `issuedScopes`
- the app registration’s `issuedCapabilities`
- recent auth-failure diagnostics in usage summary

Likely fix:

- request the right capability during app registration
- do not assume `protocol.read` is enough for `actions.invoke`

### Missing delegated consent

Typical symptom:

- app auth succeeds, but a user-scoped action is denied

What to inspect:

- `listConsentRequests()`
- `listGrants()`
- whether the consent request is still `pending`

Likely fix:

- create a consent request
- approve it through the first-party settings/admin flow
- verify that an active grant now exists

## Consent lifecycle example

```ts
const consent = await app.createConsentRequest({
  subjectType: "user",
  subjectId: "00000000-0000-4000-8000-000000000001",
  scopes: ["actions.invoke"],
  capabilities: ["request.write"],
  reason: "Send introductions on behalf of the user",
});

const approved = await app.approveConsentRequest(consent.id, {
  actorUserId: "00000000-0000-4000-8000-000000000999",
  note: "Approved for partner coordination trial",
});

const grants = await app.listGrants();
console.log(approved.status, grants.map((grant) => grant.id));
```

Important:

- a pending consent request is not active access
- approval is what resolves it into an active grant
- revoking the grant removes access even if the old consent request remains in history

## When to replay or inspect delivery state

If a partner action succeeded but the downstream webhook consumer looks out of sync:

- inspect queue health with `getAppUsageSummary()`
- inspect the delivery queue with `inspectDeliveryQueue()`
- inspect delivery attempts with `listWebhookDeliveryAttempts(deliveryId)`
- replay a dead-lettered delivery if needed

This is a delivery problem, not an auth problem.

## Recommended operational checklist

For every partner environment, keep these visible:

- current app id
- current app token issue time
- issued scopes
- issued capabilities
- recent auth failures
- pending consent requests
- active grants
- queue health summary

That is the minimum set that keeps protocol integration debugging grounded in the actual shipped model.
