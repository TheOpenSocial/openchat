# Protocol Agent Readiness

This guide is the preflight companion to the thin `@opensocial/protocol-agent` wrapper.

Use it when you want an agent to fail fast before acting, instead of discovering protocol problems mid-run.

## What readiness checks cover

The shipped readiness helpers look at:

- recent auth failures
- dead-lettered deliveries
- in-flight or failed delivery pressure
- queued backlog
- token freshness
- whether executable delegated grants exist
- whether consent is still pending

That gives an agent team one place to decide whether it is safe to proceed.

Important:

- active grants are not all equivalent
- `user` grants are executable today
- `app`, `service`, and `agent` grants are modeled-only today

If only modeled-only grants exist, readiness should block delegated writes.

## Basic usage

```ts
import {
  assertProtocolAgentReady,
  createProtocolAgentClientFromBaseUrl,
} from "@opensocial/protocol-agent";

const agent = createProtocolAgentClientFromBaseUrl(
  "http://127.0.0.1:3000",
  {
    appId: process.env.PROTOCOL_APP_ID!,
    appToken: process.env.PROTOCOL_APP_TOKEN!,
    actorUserId: process.env.PROTOCOL_ACTOR_USER_ID!,
    agentId: "partner.concierge",
  },
);

const readiness = await agent.checkReadiness({
  requireActiveGrant: true,
  failOnDeadLetters: true,
  failOnAuthFailures: true,
  failOnStaleToken: false,
});

assertProtocolAgentReady(readiness);
```

Or more compactly:

```ts
await agent.assertReady({
  requireActiveGrant: true,
  failOnDeadLetters: true,
  failOnAuthFailures: true,
  failOnStaleToken: false,
});
```

If readiness is not good enough, the assertion throws with a compact explanation of the blocking issues.

## Typical interpretation

- `auth_failures_present`
  - app token, scopes, capabilities, or delegated grants are likely wrong
- `dead_letters_present`
  - downstream delivery is unhealthy; do not assume the agent is the problem
- `retrying_deliveries_present`
  - warning state; delivery pressure is present
- `queued_backlog_present`
  - optional blocking state if you decide backlog size should gate execution
- `token_rotation_due_soon`
  - warning state; rotate on the next routine credential rollout
- `token_rotation_stale`
  - warning by default, or blocking if `failOnStaleToken` is enabled
- `no_active_grants`
  - delegated actions are likely to fail
- `no_executable_grants`
  - grants exist, but only in modeled-only subject types, so delegated actions are still expected to fail
- `pending_consent_requests`
  - approval may still be outstanding

## When to use this

Use readiness checks before:

- running a scheduled partner agent
- opening a new outbound coordination wave
- debugging a “why are writes failing?” incident

Do not use readiness checks as a replacement for queue recovery itself. For that, use:

- [Delivery recovery](./protocol-operator-recovery)
- [Consent and auth troubleshooting](./protocol-consent-and-auth-troubleshooting)
