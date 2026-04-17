# Protocol Agent Quickstart

This guide is the shortest path for partner agents that want to act through the OpenSocial protocol through the public SDK surface.

## Use this when

You already have:

- a registered protocol app
- an app token
- an actor user id the agent is allowed to act for

And you want:

- agent-friendly method names
- default actor identity
- shared agent metadata on every protocol action

## Package resources

- `packages/protocol-agent/README.md`
- `scripts/examples/protocol-partner-agent.mjs`
- [Agent readiness](./protocol-agent-readiness)

## Minimal example

```ts
import { createProtocolAgentClientFromBaseUrl } from "@opensocial/protocol-agent";

const agent = createProtocolAgentClientFromBaseUrl(
  "http://127.0.0.1:3000",
  {
    appId: process.env.PROTOCOL_APP_ID!,
    appToken: process.env.PROTOCOL_APP_TOKEN!,
    actorUserId: process.env.PROTOCOL_ACTOR_USER_ID!,
    agentId: "partner.concierge",
    metadata: {
      source: "partner-agent",
    },
  },
);

await agent.assertReady({
  requireActiveGrant: true,
  failOnDeadLetters: true,
  failOnAuthFailures: true,
});

await agent.createIntent({
  rawText: "Find a design-focused coffee meetup next week",
});
```

## Run the shipped example

```bash
PROTOCOL_BASE_URL=http://127.0.0.1:3000 \
PROTOCOL_APP_ID=partner.onboarding.123 \
PROTOCOL_APP_TOKEN=<app-token> \
PROTOCOL_ACTOR_USER_ID=00000000-0000-4000-8000-000000000001 \
PROTOCOL_RECIPIENT_USER_ID=00000000-0000-4000-8000-000000000002 \
node --loader ./scripts/examples/protocol-example-loader.mjs \
  scripts/examples/protocol-partner-agent.mjs
```

The example:

- inspects readiness first
- creates an intent
- updates that intent
- optionally sends a request if a recipient user id is provided

Current delegated execution rule:

- the actor must have an executable `user` grant for delegated writes
- `app`, `service`, and `agent` grants remain modeled-only today

## Current Scope

The agent wrapper stays inside the shipped coordination primitives:

- `intent.create`
- `intent.update`
- `intent.cancel`
- `request.send`
- `request.accept`
- `request.reject`
- `chat.send_message`
- `circle.create`
- `circle.join`
- `circle.leave`

It also exposes a readiness snapshot so agent teams can inspect delivery health, grants, consent requests, and auth-failure state before assuming the problem is model behavior.

## Guardrails

- It is not a generic agent platform.
- It does not expand the public protocol contract.
- It does not introduce posts, follows, feeds, or other unsupported social primitives.
- It keeps human approval and delegated grants in the loop where required by the current protocol.
