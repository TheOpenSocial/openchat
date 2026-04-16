# Protocol Production Readiness Checklist

Use this checklist before calling an OpenSocial protocol integration production-ready.

The goal is simple: make sure the integration is operable, not just that the happy path demo worked once.

## 1. Contract bootstrap

- manifest is fetched successfully
- discovery is fetched successfully
- the integration is aligned with documented capabilities and actions
- unsupported primitives are not being modeled as hidden custom workarounds

Guides:

- [Manifest and discovery](./protocol-manifest-and-discovery)
- [Protocol overview and exclusions](./protocol-overview-and-exclusions)

## 2. App identity and tokens

- app registration is persisted
- `appId` is stored in partner config
- issued token is stored in a real secret manager
- token rotation procedure exists
- token revocation procedure exists
- a read call succeeds with the stored token

Guide:

- [App registration and tokens](./protocol-app-registration-and-tokens)

## 3. Consent and grants

- the integration knows which actions require delegated grants
- consent request flow is exercised
- approval path is exercised
- revocation path is understood
- denied-access troubleshooting is documented clearly

Guide:

- [Consent and auth troubleshooting](./protocol-consent-and-auth-troubleshooting)

## 4. Action surface discipline

- the integration uses documented actions only
- request, intent, chat, and circle writes map to shipped protocol actions
- partner code does not depend on private modules
- no feed, follow, or post abstractions are being layered on top

Guide:

- [External actions reference](./protocol-external-actions-reference)

## 5. Webhooks and replay

- webhook signature verification is implemented
- delivery inspection path exists
- single-delivery replay is understood
- dead-letter batch replay is understood
- replay cursor strategy exists if downstream state reconstruction is needed

Guides:

- [Webhook consumer](./protocol-webhook-consumer)
- [Event subscriptions and replay](./protocol-event-subscriptions-and-replay)
- [Delivery recovery](./protocol-operator-recovery)

## 6. Agent readiness, if applicable

- the partner agent uses readiness checks before autonomous work
- grant and auth blockers are surfaced early
- queue health is inspected before blaming model behavior
- the agent uses the SDK wrapper rather than hidden private calls

Guides:

- [Agent quickstart](./protocol-agent-quickstart)
- [Agent readiness](./protocol-agent-readiness)
- [Agent toolset](./protocol-agent-toolset)

## 7. Operational visibility

- auth-failure summaries are inspected somewhere in operations
- queue health is observable
- dead-letter recovery path is known
- token rotation and revocation timestamps are monitored when relevant
- the integration team knows where to look first when writes fail

## 8. Documentation hygiene

- the partner team has a single entry doc linking to the relevant OpenSocial guides
- runbooks reference the exact SDK layer in use
- environment-specific assumptions are documented separately from protocol contract assumptions

## Minimum ready bar

An integration is meaningfully ready when all of these are true:

1. manifest and discovery are used before registration assumptions
2. app token lifecycle is controlled
3. consent and grant requirements are understood
4. webhook verification and replay are operational
5. the integration uses only documented coordination primitives

If any of those are missing, the integration may work, but it is not yet production-ready.
