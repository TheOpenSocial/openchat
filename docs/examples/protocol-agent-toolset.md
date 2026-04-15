# Protocol Agent Toolset

This guide shows how to expose `@opensocial/protocol-agent` as a tool catalog for an orchestrator.

The goal is to give future OpenAI Agents SDK or other orchestrator integrations a clean bridge on top of the stable protocol actions.

## What Is Shipped

The package now exports:

- `createProtocolAgentToolset(agent)`
- `indexProtocolAgentToolset(tools)`
- `createProtocolAgentToolkit(agent)`
- `createProtocolAgentToolkitFromBaseUrl(baseUrl, session)`
- `describeProtocolAgentToolkit(toolkit)`
- `getProtocolAgentTool(toolkit, toolName)`
- `listProtocolAgentTools(toolkit)`
- `invokeProtocolAgentTool(toolkit, toolName, input)`

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

## Toolkit Shortcut

If you want the bound agent client plus indexed tools together:

```ts
import { createProtocolAgentToolkitFromBaseUrl } from "@opensocial/protocol-agent";

const toolkit = createProtocolAgentToolkitFromBaseUrl(
  "http://127.0.0.1:3000/api",
  {
    appId: process.env.PROTOCOL_APP_ID!,
    appToken: process.env.PROTOCOL_APP_TOKEN!,
    actorUserId: process.env.PROTOCOL_ACTOR_USER_ID!,
    agentId: "partner.concierge",
  },
);

await toolkit.toolsByName.protocol_agent_assert_ready.invoke({
  requireActiveGrant: true,
  failOnDeadLetters: true,
  failOnAuthFailures: true,
});
```

Or, if you want safer runtime lookup by name:

```ts
import {
  createProtocolAgentToolkitFromBaseUrl,
  describeProtocolAgentToolkit,
  getProtocolAgentTool,
  invokeProtocolAgentTool,
} from "@opensocial/protocol-agent";

const toolkit = createProtocolAgentToolkitFromBaseUrl(
  "http://127.0.0.1:3000/api",
  {
    appId: process.env.PROTOCOL_APP_ID!,
    appToken: process.env.PROTOCOL_APP_TOKEN!,
    actorUserId: process.env.PROTOCOL_ACTOR_USER_ID!,
    agentId: "partner.concierge",
  },
);

console.log(describeProtocolAgentToolkit(toolkit));

const assertReadyTool = getProtocolAgentTool(
  toolkit,
  "protocol_agent_assert_ready",
);

await assertReadyTool.invoke({
  requireActiveGrant: true,
  failOnDeadLetters: true,
  failOnAuthFailures: true,
});
```

## Run the shipped example

```bash
PROTOCOL_BASE_URL=http://127.0.0.1:3000/api \
PROTOCOL_APP_ID=partner.onboarding.123 \
PROTOCOL_APP_TOKEN=<app-token> \
PROTOCOL_ACTOR_USER_ID=00000000-0000-4000-8000-000000000001 \
node --loader ./scripts/examples/protocol-example-loader.mjs \
  scripts/examples/protocol-partner-agent-toolset.mjs
```

The example:

- prints the current toolkit summary
- prints each tool’s input schema
- runs the assert-ready tool
- runs the create-intent tool

If you prefer the toolkit helper:

```bash
PROTOCOL_BASE_URL=http://127.0.0.1:3000/api \
PROTOCOL_APP_ID=partner.onboarding.123 \
PROTOCOL_APP_TOKEN=<app-token> \
PROTOCOL_ACTOR_USER_ID=00000000-0000-4000-8000-000000000001 \
node --loader ./scripts/examples/protocol-example-loader.mjs \
  scripts/examples/protocol-partner-agent-toolkit.mjs
```

## Why This Exists

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
