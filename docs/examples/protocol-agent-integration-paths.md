# Protocol Agent Integration Paths

This guide helps partner teams choose the right entrypoint into the current `@opensocial/protocol-agent` surface.

The package currently supports three practical shapes:

1. client
2. toolset
3. toolkit

They all use the same stable protocol actions underneath. The difference is how much orchestration glue you want the SDK to carry for you.

## 1. Client

Use the raw agent client when you want direct method calls and already control the execution flow yourself.

Best for:

- application code
- deterministic workflows
- service code that already knows which method to call

Use:

- [`/Users/cruciblelabs/Documents/openchat/docs/examples/protocol-agent-quickstart.md`](/Users/cruciblelabs/Documents/openchat/docs/examples/protocol-agent-quickstart.md)
- [`/Users/cruciblelabs/Documents/openchat/scripts/examples/protocol-partner-agent.mjs`](/Users/cruciblelabs/Documents/openchat/scripts/examples/protocol-partner-agent.mjs)

## 2. Toolset

Use the toolset when your orchestrator wants a list of tools with descriptions, input schemas, and callables.

Best for:

- tool-driven runtimes
- future OpenAI Agents SDK wiring
- orchestrators that want to register tools one by one

Use:

- [`/Users/cruciblelabs/Documents/openchat/docs/examples/protocol-agent-toolset.md`](/Users/cruciblelabs/Documents/openchat/docs/examples/protocol-agent-toolset.md)
- [`/Users/cruciblelabs/Documents/openchat/scripts/examples/protocol-partner-agent-toolset.mjs`](/Users/cruciblelabs/Documents/openchat/scripts/examples/protocol-partner-agent-toolset.mjs)

## 3. Toolkit

Use the toolkit when you want the bound agent client plus indexed tools and helper utilities together.

Best for:

- orchestrators that want both direct methods and tool invocation
- adapters that want a single object to pass around
- integration layers that need inspect/get/invoke helpers

Use:

- [`/Users/cruciblelabs/Documents/openchat/docs/examples/protocol-agent-toolset.md`](/Users/cruciblelabs/Documents/openchat/docs/examples/protocol-agent-toolset.md)
- [`/Users/cruciblelabs/Documents/openchat/scripts/examples/protocol-partner-agent-toolkit.mjs`](/Users/cruciblelabs/Documents/openchat/scripts/examples/protocol-partner-agent-toolkit.mjs)

## Shared recommendation

Whichever path you choose:

1. assert readiness before acting when failures should block execution
2. keep the app token, actor user, and delegated grants explicit
3. stay inside the shipped coordination primitives

For readiness and operational preflight:

- [`/Users/cruciblelabs/Documents/openchat/docs/examples/protocol-agent-readiness.md`](/Users/cruciblelabs/Documents/openchat/docs/examples/protocol-agent-readiness.md)
- [`/Users/cruciblelabs/Documents/openchat/docs/examples/protocol-operator-recovery.md`](/Users/cruciblelabs/Documents/openchat/docs/examples/protocol-operator-recovery.md)
- [`/Users/cruciblelabs/Documents/openchat/docs/examples/protocol-consent-and-auth-troubleshooting.md`](/Users/cruciblelabs/Documents/openchat/docs/examples/protocol-consent-and-auth-troubleshooting.md)

## Guardrails

- These are different integration shapes, not different protocol contracts.
- None of them add posts, follows, feeds, or other unsupported social primitives.
- None of them replace the backend protocol as the source of truth.
