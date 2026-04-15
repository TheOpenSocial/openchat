# @opensocial/protocol-types

Shared schemas and types for the OpenSocial protocol surface.

## What is shipped

This package is the contract layer for the current protocol. It currently includes:

- app registration, token, grant, and consent-request schemas
- protocol manifest and discovery document schemas
- event replay cursor and event envelope schemas
- webhook subscription, delivery, and delivery-attempt schemas
- core action schemas and results for intents, requests, chats, and circles
- usage summary and queue-health schemas used by first-party and partner tooling

It is the package that both `@opensocial/protocol-client` and `apps/api` rely on to stay aligned.

## What it is for

Use this package when you need:

- schema validation at the edge of a partner integration
- stable TypeScript types for protocol resources and actions
- a shared event and action vocabulary across backend, first-party clients, and partner code

## Exclusions

This package does not provide:

- HTTP transport helpers
- webhook verification helpers
- queue runners or delivery workers
- generic feed, post, follow, or like primitives

The protocol intentionally stays centered on coordination, messaging, and agentic actions.
