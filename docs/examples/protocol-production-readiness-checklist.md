# Protocol Production Readiness Checklist

Use this checklist before calling an OpenSocial protocol integration production-ready.

It is intentionally practical. The goal is to make sure the integration is truly operable, not just that the happy path demo worked once.

## 1. Contract bootstrap

- manifest is fetched successfully
- discovery is fetched successfully
- the integration is aligned with documented capabilities and actions
- unsupported primitives are not being modeled as hidden custom workarounds

Guides:

- [`/Users/cruciblelabs/Documents/openchat/docs/examples/protocol-manifest-and-discovery.md`](/Users/cruciblelabs/Documents/openchat/docs/examples/protocol-manifest-and-discovery.md)
- [`/Users/cruciblelabs/Documents/openchat/docs/examples/protocol-overview-and-exclusions.md`](/Users/cruciblelabs/Documents/openchat/docs/examples/protocol-overview-and-exclusions.md)

## 2. App identity and tokens

- app registration is persisted
- `appId` is stored in partner config
- issued token is stored in a real secret manager
- token rotation procedure exists
- token revocation procedure exists
- a read call succeeds with the stored token

Guide:

- [`/Users/cruciblelabs/Documents/openchat/docs/examples/protocol-app-registration-and-tokens.md`](/Users/cruciblelabs/Documents/openchat/docs/examples/protocol-app-registration-and-tokens.md)

## 3. Consent and grants

- the integration knows which actions require delegated grants
- consent request flow is exercised
- approval path is exercised
- revocation path is understood
- denied-access troubleshooting is documented internally

Guide:

- [`/Users/cruciblelabs/Documents/openchat/docs/examples/protocol-consent-and-auth-troubleshooting.md`](/Users/cruciblelabs/Documents/openchat/docs/examples/protocol-consent-and-auth-troubleshooting.md)

## 4. Action surface discipline

- the integration uses documented actions only
- request, intent, chat, and circle writes map to shipped protocol actions
- partner code does not depend on internal backend modules
- no feed, follow, or post abstractions are being layered on top

Guide:

- [`/Users/cruciblelabs/Documents/openchat/docs/examples/protocol-external-actions-reference.md`](/Users/cruciblelabs/Documents/openchat/docs/examples/protocol-external-actions-reference.md)

## 5. Webhooks and replay

- webhook signature verification is implemented
- delivery inspection path exists
- single-delivery replay is understood
- dead-letter batch replay is understood
- replay cursor strategy exists if downstream state reconstruction is needed

Guides:

- [`/Users/cruciblelabs/Documents/openchat/docs/examples/protocol-webhook-consumer.md`](/Users/cruciblelabs/Documents/openchat/docs/examples/protocol-webhook-consumer.md)
- [`/Users/cruciblelabs/Documents/openchat/docs/examples/protocol-event-subscriptions-and-replay.md`](/Users/cruciblelabs/Documents/openchat/docs/examples/protocol-event-subscriptions-and-replay.md)
- [`/Users/cruciblelabs/Documents/openchat/docs/examples/protocol-operator-recovery.md`](/Users/cruciblelabs/Documents/openchat/docs/examples/protocol-operator-recovery.md)

## 6. Agent readiness, if applicable

- the partner agent uses readiness checks before autonomous work
- grant and auth blockers are surfaced early
- queue health is inspected before blaming model behavior
- the agent uses the thin SDK wrapper rather than hidden private calls

Guides:

- [`/Users/cruciblelabs/Documents/openchat/docs/examples/protocol-agent-quickstart.md`](/Users/cruciblelabs/Documents/openchat/docs/examples/protocol-agent-quickstart.md)
- [`/Users/cruciblelabs/Documents/openchat/docs/examples/protocol-agent-readiness.md`](/Users/cruciblelabs/Documents/openchat/docs/examples/protocol-agent-readiness.md)
- [`/Users/cruciblelabs/Documents/openchat/docs/examples/protocol-agent-toolset.md`](/Users/cruciblelabs/Documents/openchat/docs/examples/protocol-agent-toolset.md)

## 7. Operational visibility

- auth-failure summaries are inspected somewhere in operations
- queue health is observable
- dead-letter recovery path is known
- token rotation and revocation timestamps are monitored when relevant
- the integration team knows where to look first when writes fail

## 8. Documentation hygiene

- the partner team has a single internal entry doc linking to the relevant OpenSocial guides
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
