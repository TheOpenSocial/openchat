# @opensocial/protocol-agent

Agent helpers on top of the OpenSocial protocol client.

Use [`/Users/cruciblelabs/Documents/openchat/docs/examples/protocol-sdk-index.md`](/Users/cruciblelabs/Documents/openchat/docs/examples/protocol-sdk-index.md) for the full SDK docs map.

## What is shipped

This package does not introduce new backend semantics. It wraps `@opensocial/protocol-client` with:

- agent-scoped app binding
- actor-user defaults for protocol actions
- shared agent metadata injection
- a simple readiness snapshot for queue, auth, grants, and consent state
- readiness evaluation and fail-fast assertions for common operational blockers
- a generic toolset adapter for orchestration runtimes
- a toolkit helper that bundles the agent client plus indexed tools
- runtime-safe helpers for listing tools and invoking them by name
- self-describing toolkit helpers for inspection and discovery

Use it when agent code should operate through the protocol boundary without repeating `actorUserId` and metadata on every call.

## Basic usage

```ts
import { createProtocolAgentClientFromBaseUrl } from "@opensocial/protocol-agent";

const agent = createProtocolAgentClientFromBaseUrl(
  "https://api.example.com",
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

await agent.assertReady({
  requireActiveGrant: true,
  failOnDeadLetters: true,
  failOnAuthFailures: true,
});

await agent.createIntent({
  rawText: "Find a thoughtful dinner in Palermo this week",
});

const readiness = await agent.checkReadiness();
console.log(readiness.snapshot.queue.deadLetteredCount);
```

Delegated execution rule:

- `user` grants are executable today
- `app`, `service`, and `agent` grants remain modeled-only

So agent readiness should be interpreted as “is there an executable user grant for this actor?” rather than “does any grant row exist?”

For runnable examples, see:

- [`/Users/cruciblelabs/Documents/openchat/docs/examples/protocol-agent-integration-paths.md`](/Users/cruciblelabs/Documents/openchat/docs/examples/protocol-agent-integration-paths.md)
- [`/Users/cruciblelabs/Documents/openchat/scripts/examples/protocol-partner-agent.mjs`](/Users/cruciblelabs/Documents/openchat/scripts/examples/protocol-partner-agent.mjs)
- [`/Users/cruciblelabs/Documents/openchat/scripts/examples/protocol-partner-agent-toolset.mjs`](/Users/cruciblelabs/Documents/openchat/scripts/examples/protocol-partner-agent-toolset.mjs)
- [`/Users/cruciblelabs/Documents/openchat/scripts/examples/protocol-partner-agent-toolkit.mjs`](/Users/cruciblelabs/Documents/openchat/scripts/examples/protocol-partner-agent-toolkit.mjs)
- [`/Users/cruciblelabs/Documents/openchat/docs/examples/protocol-agent-quickstart.md`](/Users/cruciblelabs/Documents/openchat/docs/examples/protocol-agent-quickstart.md)
- [`/Users/cruciblelabs/Documents/openchat/docs/examples/protocol-agent-readiness.md`](/Users/cruciblelabs/Documents/openchat/docs/examples/protocol-agent-readiness.md)
- [`/Users/cruciblelabs/Documents/openchat/docs/examples/protocol-agent-toolset.md`](/Users/cruciblelabs/Documents/openchat/docs/examples/protocol-agent-toolset.md)

## Exclusions

This package does not provide:

- autonomous planning or orchestration
- direct OpenAI Agents SDK integration
- private backend access
- unsupported primitives like posts, follows, feeds, or likes

It stays focused on the stable protocol actions that already exist.
