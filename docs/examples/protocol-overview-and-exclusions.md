# OpenSocial Protocol Overview And Exclusions

This is the high-level orientation doc for the current OpenSocial protocol surface.

Use it before diving into the action reference or partner examples.

## What OpenSocial protocol is

OpenSocial protocol is a coordination-first integration surface extracted from the product we already run.

It is built around the real OpenSocial domain:

- identity
- profiles
- intents
- requests
- connections
- chats
- circles
- notifications
- agent threads
- realtime and replayable events

The protocol is meant to let:

- first-party clients
- third-party apps
- partner agents

read state, write approved actions, and subscribe to relevant events without depending on private backend internals.

## What it is not

It is not a generic social-network SDK.

It is not designed around:

- posts
- follows
- feeds
- likes
- generic timeline primitives

Those are intentionally outside the supported contract.

If a partner tries to model OpenSocial as a feed or follow graph, they are pointing at the wrong abstraction layer.

## Core integration modes

The current protocol surface supports three integration modes:

1. read state
2. write actions
3. subscribe to events

That is the stable mental model for the whole SDK family.

## Current resource shape

The core resource model is:

- `user`
- `profile`
- `intent`
- `intent_request`
- `connection`
- `chat`
- `chat_message`
- `circle`
- `notification`
- `agent_thread`
- protocol app registration and webhook resources

These are the primitives the backend and SDK are converging around.

## Current write surface

The current writable action surface is intentionally narrow:

- intent lifecycle
- request lifecycle
- chat send
- circle create/join/leave

Use the detailed reference for those:

- [`/Users/cruciblelabs/Documents/openchat/docs/examples/protocol-external-actions-reference.md`](/Users/cruciblelabs/Documents/openchat/docs/examples/protocol-external-actions-reference.md)

## Current event surface

The current event model is also coordination-first.

Examples include:

- intent lifecycle events
- request lifecycle events
- chat message events
- circle lifecycle events
- webhook delivery and failure events

Use the event and replay guide for the operational view:

- [`/Users/cruciblelabs/Documents/openchat/docs/examples/protocol-event-subscriptions-and-replay.md`](/Users/cruciblelabs/Documents/openchat/docs/examples/protocol-event-subscriptions-and-replay.md)

## Auth and delegated access

There are two important gates in the current protocol:

1. app-level auth
2. delegated grants for user-scoped actions

This is why partner integrations need to think about both:

- app tokens
- scopes and capabilities
- consent requests
- active grants

Use these guides for the details:

- [`/Users/cruciblelabs/Documents/openchat/docs/examples/protocol-consent-and-auth-troubleshooting.md`](/Users/cruciblelabs/Documents/openchat/docs/examples/protocol-consent-and-auth-troubleshooting.md)
- [`/Users/cruciblelabs/Documents/openchat/docs/examples/protocol-operator-recovery.md`](/Users/cruciblelabs/Documents/openchat/docs/examples/protocol-operator-recovery.md)

## SDK family

The current package family is:

- `@opensocial/protocol-types`
- `@opensocial/protocol-events`
- `@opensocial/protocol-client`
- `@opensocial/protocol-server`
- `@opensocial/protocol-agent`

Each package stays narrow:

- `protocol-types`: schemas and shared types
- `protocol-events`: event payloads and event vocabulary
- `protocol-client`: transport-backed protocol calls
- `protocol-server`: helper utilities like webhook verification
- `protocol-agent`: thin agent-oriented wrappers on top of the client

## Choosing the next doc

After this overview, the usual next step is:

- onboarding flow:
  - [`/Users/cruciblelabs/Documents/openchat/docs/examples/protocol-partner-quickstart.md`](/Users/cruciblelabs/Documents/openchat/docs/examples/protocol-partner-quickstart.md)
- writable contract:
  - [`/Users/cruciblelabs/Documents/openchat/docs/examples/protocol-external-actions-reference.md`](/Users/cruciblelabs/Documents/openchat/docs/examples/protocol-external-actions-reference.md)
- operational recovery:
  - [`/Users/cruciblelabs/Documents/openchat/docs/examples/protocol-operator-recovery.md`](/Users/cruciblelabs/Documents/openchat/docs/examples/protocol-operator-recovery.md)
- agent integrations:
  - [`/Users/cruciblelabs/Documents/openchat/docs/examples/protocol-agent-integration-paths.md`](/Users/cruciblelabs/Documents/openchat/docs/examples/protocol-agent-integration-paths.md)
