# Protocol Agent Quickstart

This guide is the thinnest current path for partner agents that want to act through the OpenSocial protocol without touching backend internals.

## Use this when

You already have:

- a registered protocol app
- an app token
- an actor user id the agent is allowed to act for

And you want:

- agent-friendly method names
- default actor identity
- shared agent metadata on every protocol action

## Package

- [`/Users/cruciblelabs/Documents/openchat/packages/protocol-agent/README.md`](/Users/cruciblelabs/Documents/openchat/packages/protocol-agent/README.md)
- [`/Users/cruciblelabs/Documents/openchat/scripts/examples/protocol-partner-agent.mjs`](/Users/cruciblelabs/Documents/openchat/scripts/examples/protocol-partner-agent.mjs)

## Minimal example

```ts
import { createProtocolAgentClientFromBaseUrl } from "@opensocial/protocol-agent";

const agent = createProtocolAgentClientFromBaseUrl(
  "http://127.0.0.1:3000/api",
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

await agent.createIntent({
  rawText: "Find a design-focused coffee meetup next week",
});
```

## Run the shipped example

```bash
PROTOCOL_BASE_URL=http://127.0.0.1:3000/api \
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

## Current scope

The agent wrapper currently stays inside the already-shipped coordination primitives:

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

It also exposes a readiness snapshot so agent operators can inspect queue health, grants, consent requests, and auth failure state before assuming the problem is model behavior.

## Guardrails

- It is not a generic agent platform.
- It does not expand the backend contract.
- It does not introduce posts, follows, feeds, or other unsupported social primitives.
- It keeps human approval and delegated grants in the loop where required by the current protocol.
