# @opensocial/protocol-agent

Thin agent-oriented helpers on top of the shipped OpenSocial protocol client.

## What is shipped

This package does not introduce new backend semantics. It wraps the current `@opensocial/protocol-client` surface with:

- agent-scoped app binding
- actor-user defaults for protocol actions
- shared agent metadata injection
- a simple readiness snapshot for queue, auth, grants, and consent state
- readiness evaluation and fail-fast assertions for common operational blockers

Use it when you want agent code to operate through the protocol boundary without threading `actorUserId` and agent metadata through every call manually.

## Basic usage

```ts
import { createProtocolAgentClientFromBaseUrl } from "@opensocial/protocol-agent";

const agent = createProtocolAgentClientFromBaseUrl(
  "https://api.example.com/api",
  {
    appId: process.env.OPENSOCIAL_APP_ID!,
    appToken: process.env.OPENSOCIAL_APP_TOKEN!,
    actorUserId: process.env.OPENSOCIAL_ACTOR_USER_ID!,
    agentId: "partner.concierge",
    metadata: {
      deployment: "staging",
    },
  },
);

await agent.createIntent({
  rawText: "Find a thoughtful dinner in Palermo this week",
});

await agent.sendRequest({
  intentId: "00000000-0000-4000-8000-000000000010",
  recipientUserId: "00000000-0000-4000-8000-000000000020",
});

const readiness = await agent.inspectReadiness();
console.log(readiness.queue.deadLetteredCount);
```

For a runnable example, use:

- [`/Users/cruciblelabs/Documents/openchat/scripts/examples/protocol-partner-agent.mjs`](/Users/cruciblelabs/Documents/openchat/scripts/examples/protocol-partner-agent.mjs)
- [`/Users/cruciblelabs/Documents/openchat/docs/examples/protocol-agent-quickstart.md`](/Users/cruciblelabs/Documents/openchat/docs/examples/protocol-agent-quickstart.md)
- [`/Users/cruciblelabs/Documents/openchat/docs/examples/protocol-agent-readiness.md`](/Users/cruciblelabs/Documents/openchat/docs/examples/protocol-agent-readiness.md)

## Exclusions

This package does not provide:

- autonomous planning or orchestration
- direct OpenAI Agents SDK integration
- private backend access
- unsupported primitives like posts, follows, feeds, or likes

It is intentionally a thin adapter over the stable protocol actions that already exist.
