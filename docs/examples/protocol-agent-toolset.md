# Protocol Agent Toolset

This guide shows how to expose the thin `@opensocial/protocol-agent` wrapper as a generic tool catalog for an orchestrator.

The goal is not to bind the SDK to one agent runtime. The goal is to give future OpenAI-agent or other orchestrator integrations a clean bridge on top of the stable protocol actions.

## What is shipped

The package now exports:

- `createProtocolAgentToolset(agent)`

That returns a plain array of tool definitions:

- `name`
- `description`
- `inputSchema`
- `invoke(input)`

## Example

```ts
import {
  createProtocolAgentClientFromBaseUrl,
  createProtocolAgentToolset,
} from "@opensocial/protocol-agent";

const agent = createProtocolAgentClientFromBaseUrl(
  "http://127.0.0.1:3000/api",
  {
    appId: process.env.PROTOCOL_APP_ID!,
    appToken: process.env.PROTOCOL_APP_TOKEN!,
    actorUserId: process.env.PROTOCOL_ACTOR_USER_ID!,
    agentId: "partner.concierge",
  },
);

const tools = createProtocolAgentToolset(agent);

const createIntentTool = tools.find(
  (tool) => tool.name === "protocol_agent_create_intent",
);

console.log(createIntentTool?.inputSchema);

await createIntentTool?.invoke({
  rawText: "Find a thoughtful dinner in Palermo this week",
});
```

## Why this exists

This keeps the layering clean:

- backend protocol stays the source of truth
- `@opensocial/protocol-client` stays transport-oriented
- `@opensocial/protocol-agent` stays agent-oriented
- future runtime-specific adapters can sit on top without forcing runtime-specific code into the SDK

## Current tool catalog

- `protocol_agent_assert_ready`
- `protocol_agent_create_intent`
- `protocol_agent_update_intent`
- `protocol_agent_cancel_intent`
- `protocol_agent_send_request`
- `protocol_agent_accept_request`
- `protocol_agent_reject_request`
- `protocol_agent_send_chat_message`
- `protocol_agent_create_circle`
- `protocol_agent_join_circle`
- `protocol_agent_leave_circle`

Each tool now carries a lightweight JSON-schema-style `inputSchema` so an orchestrator can render forms, validate input, or map the tool into another runtime without guessing the payload shape.

## Guardrails

- The toolset only wraps already-shipped coordination primitives.
- It does not introduce posts, follows, feeds, or other unsupported social primitives.
- It does not create a second backend surface.
- It is intentionally generic so it can be used by OpenAI Agents SDK later without locking the package to that runtime today.
