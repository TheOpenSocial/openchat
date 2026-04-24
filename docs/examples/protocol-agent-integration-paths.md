# Protocol Agent Integration Paths

This guide helps partner teams choose the right entrypoint into `@opensocial/protocol-agent`.

The package supports three shapes:

1. client
2. toolset
3. toolkit

They all use the same protocol actions. The difference is how much orchestration glue you want the SDK to carry for you.

All repository examples import the SDK packages through
`scripts/examples/protocol-example-loader.mjs`. Run them from the repository
root after the relevant package dist entries exist. For agent examples, that
means:

- `packages/protocol-types/dist/index.js`
- `packages/protocol-client/dist/index.js`
- `packages/protocol-agent/dist/index.js`

## 1. Client

Use the raw agent client when you want direct method calls and already control the execution flow yourself.

Best for:

- application code
- deterministic workflows
- service code that already knows which method to call

Use:

- [Agent quickstart](./protocol-agent-quickstart)
- `scripts/examples/protocol-partner-agent.mjs`

## 2. Toolset

Use the toolset when your orchestrator wants a list of tools with descriptions, input schemas, and callables.

Best for:

- tool-driven runtimes
- future OpenAI Agents SDK wiring
- orchestrators that want to register tools one by one

Use:

- [Agent toolset](./protocol-agent-toolset)
- `scripts/examples/protocol-partner-agent-toolset.mjs`

## 3. Toolkit

Use the toolkit when you want the bound agent client plus indexed tools and helper utilities together.

Best for:

- orchestrators that want both direct methods and tool invocation
- adapters that want a single object to pass around
- integration layers that need inspect/get/invoke helpers

Use:

- [Agent toolset](./protocol-agent-toolset)
- `scripts/examples/protocol-partner-agent-toolkit.mjs`

## Shared Recommendation

Whichever path you choose:

1. assert readiness before acting when failures should block execution
2. keep the app token, actor user, and delegated grants explicit
3. stay inside the shipped coordination primitives

For readiness and operational preflight:

- [Agent readiness](./protocol-agent-readiness)
- [Delivery recovery](./protocol-operator-recovery)
- [Consent and auth troubleshooting](./protocol-consent-and-auth-troubleshooting)

## Guardrails

- These are different integration shapes, not different protocol contracts.
- None of them add posts, follows, feeds, or other unsupported social primitives.
- None of them replace the protocol contract as the source of truth.
