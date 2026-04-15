# @opensocial/protocol-events

Shared event schemas and helpers for the OpenSocial protocol.

## What is shipped

This package currently provides:

- protocol webhook delivery payload schemas
- event-envelope helpers used by replay and delivery flows
- the shared event catalog consumed by the protocol client, backend, and partner examples

It is meant to keep event delivery and replay semantics consistent without exposing backend internals.

## What it is for

Use this package when you need:

- typed webhook payload handling
- event-catalog awareness in partner consumers
- replay or delivery parsing aligned with the current OpenSocial protocol

## Exclusions

This package does not provide:

- webhook signing or verification helpers
- event persistence or replay storage
- a background delivery worker
- any generic social-network event model

For verification helpers, use `@opensocial/protocol-server`. For transport calls, use `@opensocial/protocol-client`.
