# Purpose Scenario Matrix

This matrix keeps readiness tied to the actual job of the app: help a user
understand social matching state, notice what changed, coordinate with real
people, and recover when matching stalls.

## How To Use

List the pack without running anything:

```bash
pnpm test:purpose:scenario-pack -- --list
```

Run backend contract checks for every purpose scenario:

```bash
pnpm test:purpose:scenario-pack -- --backend
```

Run one mobile sandbox scenario after the app/session is prepared:

```bash
pnpm test:purpose:scenario-pack -- --mobile --scenario=baseline
```

Run both layers when staging credentials and the mobile session are ready:

```bash
pnpm test:purpose:scenario-pack -- --backend --mobile
```

When pointing at a specific staging API or sandbox world:

```bash
pnpm test:purpose:scenario-pack -- --backend --mobile --base-url=https://api.opensocial.so --world-id=design-sandbox-v1
```

## Scenario Coverage

| Scenario | User question it proves | Backend contract | Mobile contract | Current readiness |
| --- | --- | --- | --- | --- |
| `baseline` | What is the system doing for me right now? | `playground:sandbox -- --action=validate --scenario=baseline` checks active/waiting Home tone plus coordination or top suggestion | `test:mobile:sandbox:maestro -- --scenario=baseline --flow=sandbox-surface --app-id=host.exp.Exponent` checks Home status and Activity from sandbox data | `9/10`: wired, needs fresh combined pack run |
| `waiting_replies` | Am I waiting on others, or is something waiting on me? | Validates the `Waiting on replies` coordination card and no premature chat handoff | Same mobile sandbox flow proves the waiting state renders in Home and Activity remains reachable | `9/10`: wired, needs fresh combined pack run |
| `activity_burst` | What changed while I was away? | Validates unread Activity counts | Same mobile sandbox flow proves Activity opens with the expected section and quick links | `9/10`: wired, needs fresh combined pack run |
| `stalled_search` | What should I do when matching stalls? | Validates recovery tone and recovery spotlight | Same mobile sandbox flow proves recovery guidance is visible without relying on transcript noise | `9/10`: wired, needs fresh combined pack run |

## Required Product Capabilities

| Capability | Why it matters | Primary evidence |
| --- | --- | --- |
| State comprehension | Users should understand the app state within seconds of opening Home | `baseline`, `waiting_replies`, `stalled_search` |
| Action-required clarity | The app must distinguish waiting-on-you from waiting-on-others | `waiting_replies`, `activity_burst` |
| Human coordination | Chats remain the real action surface after the agent finds or prepares an intro | `baseline`, `waiting_replies`, chat readiness lanes |
| Recovery | No-match or stalled matching must produce a clear next move | `stalled_search` |
| Protocol visibility | Users can inspect connected apps and grants without leaving product settings | mobile readiness pack plus protocol backend/SDK tests |

## Promotion Rule

A scenario can move to `10/10` only when both are true:

- backend validation passes through `pnpm test:purpose:scenario-pack -- --backend --scenario=<id>`
- mobile sandbox proof passes through `pnpm test:purpose:scenario-pack -- --mobile --scenario=<id>`

Until both layers pass in the same release window, keep the scenario at `9/10`
or lower even if individual unit tests exist.
