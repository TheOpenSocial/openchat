# Protocol Versioning And Compatibility

This guide explains how to think about compatibility for the current OpenSocial protocol SDK.

Use it when you are deciding:

- what assumptions a partner integration may safely make
- how to adopt new fields or helpers without breaking older code
- how to treat unsupported primitives and missing features

## Compatibility rule of thumb

The OpenSocial protocol should be treated as:

- narrow at the core
- additive when possible
- explicit about exclusions

Partners should rely on:

- manifest
- discovery
- documented action surface
- documented event surface

Partners should not rely on:

- private backend internals
- undocumented fields
- inferred support for generic social primitives

## What is stable right now

The current stable contract is centered on:

- app registration
- app token lifecycle
- consent requests and grants
- webhook subscriptions
- delivery inspection and replay
- intent lifecycle actions
- request actions
- chat send
- circle actions
- thin agent helpers layered on top of the client

These are the pieces the SDK docs and examples now treat as the canonical surface.

## Additive changes

The safest future evolution path is additive:

- new documented fields
- new documented event families
- new documented capabilities
- new documented actions that fit the same coordination model
- new client helpers that wrap already-shipped endpoints

Partner code should be written to tolerate:

- additional fields in responses
- additional metadata keys
- additional documented guides and helper methods

## Breaking assumptions to avoid

Do not assume:

- the protocol will broaden into posts or follows later
- an undocumented field is safe to depend on
- a helper existing in one package means the backend contract widened
- agent helper APIs are a separate backend surface

The SDK packages are there to make the shipped protocol easier to consume, not to imply new domain scope.

## How to adopt safely

Recommended partner strategy:

1. bootstrap from manifest and discovery
2. code against documented actions only
3. tolerate additive response fields
4. gate higher-risk flows behind your own integration flags
5. prefer the thin client and agent helpers over ad hoc HTTP wrappers

## Unsupported primitives are a compatibility guarantee too

These are intentionally excluded:

- posts
- follows
- feeds
- likes
- generic timelines

That is not a temporary omission. It is part of the product direction.

Treat that exclusion as stable guidance, not as an invitation to emulate those concepts in custom metadata and pretend they are first-class protocol objects.

## SDK package expectations

Current package expectations:

- `@opensocial/protocol-types`
  - shared schemas and types
- `@opensocial/protocol-events`
  - event vocabulary and payload shapes
- `@opensocial/protocol-client`
  - transport-backed client methods for the documented protocol surface
- `@opensocial/protocol-server`
  - helper utilities like manifest/discovery builders and webhook verification
- `@opensocial/protocol-agent`
  - thin agent-oriented wrappers on top of the client

If a future helper appears in one of these packages, prefer it over inventing your own wrapper, but still check whether the underlying backend route is part of the documented contract.

## Recommended partner policy

For production integrations:

1. pin your SDK package versions deliberately
2. review manifest and discovery on environment changes
3. adopt new actions only after the reference docs and examples mention them
4. treat docs plus examples as the compatibility contract, not internal repo structure

## Related guides

- [`/Users/cruciblelabs/Documents/openchat/docs/examples/protocol-sdk-index.md`](/Users/cruciblelabs/Documents/openchat/docs/examples/protocol-sdk-index.md)
- [`/Users/cruciblelabs/Documents/openchat/docs/examples/protocol-overview-and-exclusions.md`](/Users/cruciblelabs/Documents/openchat/docs/examples/protocol-overview-and-exclusions.md)
- [`/Users/cruciblelabs/Documents/openchat/docs/examples/protocol-manifest-and-discovery.md`](/Users/cruciblelabs/Documents/openchat/docs/examples/protocol-manifest-and-discovery.md)
- [`/Users/cruciblelabs/Documents/openchat/docs/examples/protocol-external-actions-reference.md`](/Users/cruciblelabs/Documents/openchat/docs/examples/protocol-external-actions-reference.md)
