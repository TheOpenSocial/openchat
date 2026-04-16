# Protocol SDK Index

This is the best entry page for the SDK docs.

Use it when you want the shortest path from “what is this?” to “how do I integrate?”

## Recommended reading order

```mermaid
flowchart LR
    A["Vision"] --> B["Concepts"]
    B --> C["Manifest + discovery"]
    C --> D["Registration + auth"]
    D --> E["Dispatch + events"]
    E --> F["Agents + operations"]
```

## Start here

1. [Vision and purpose](./protocol-vision-and-purpose)
2. [Protocol overview and exclusions](./protocol-overview-and-exclusions)
3. [Protocol core concepts](./protocol-core-concepts)
4. [Manifest and discovery](./protocol-manifest-and-discovery)

## Connect and authenticate

- [Partner quickstart](./protocol-partner-quickstart)
- [App registration and tokens](./protocol-app-registration-and-tokens)
- [Consent and auth troubleshooting](./protocol-consent-and-auth-troubleshooting)

## Read and dispatch

- [Read, connect, dispatch, and operate](./protocol-read-connect-dispatch-operate)
- [External actions reference](./protocol-external-actions-reference)
- [Event subscriptions and replay](./protocol-event-subscriptions-and-replay)
- [Webhook consumer](./protocol-webhook-consumer)

## Agents and operations

- [Agent integration paths](./protocol-agent-integration-paths)
- [Agent quickstart](./protocol-agent-quickstart)
- [Agent readiness](./protocol-agent-readiness)
- [Agent toolset](./protocol-agent-toolset)
- [Operator recovery](./protocol-operator-recovery)

## Production guidance

- [Production readiness checklist](./protocol-production-readiness-checklist)
- [Versioning and compatibility](./protocol-versioning-and-compatibility)

## Repository resources

Example scripts referenced throughout these docs live in:

- `scripts/examples/protocol-partner-onboarding.mjs`
- `scripts/examples/protocol-partner-actions.mjs`
- `scripts/examples/protocol-webhook-consumer.mjs`
- `scripts/examples/protocol-partner-operations.mjs`
- `scripts/examples/protocol-partner-agent.mjs`

The public docs describe the contract. The repository examples show how to use it.
