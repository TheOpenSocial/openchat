# Mobile Readiness Matrix

This is the standalone mobile scoring sheet. It complements
[/Users/cruciblelabs/Documents/openchat/docs/mobile-app-audit.md](/Users/cruciblelabs/Documents/openchat/docs/mobile-app-audit.md)
and is meant to answer one question quickly: how close is each mobile surface
or automation lane to release-grade confidence?

## Scale

- `1-3`: concept or partial wiring only
- `4-6`: real implementation exists, but important automation or recovery gaps remain
- `7-8`: strong working shape with limited known edge instability
- `9`: release-candidate quality for the current scope
- `10`: fully dependable, polished, and strongly automated

## Product Surfaces

| Surface | Readiness | Current state | Next move to raise score |
| --- | --- | --- | --- |
| Auth entry | `8/10` | Strong and stable | Add notification-entry coverage and broader shell recovery proof |
| Onboarding landing | `8/10` | Preserved authored motion and copy | Finish the minimalist polish pass without flattening the design |
| Onboarding completion | `7/10` | Works, but not deeply audited | Add broader completion + return coverage |
| Home | `8/10` | Real API-backed and coherent | Add stronger persistence and route-return coverage |
| Activity | `9/10` | Best instrumented surface | Finish the late-loop recovery in the broad sweep |
| Inbox | `8/10` | Proven in local broad sweep | Extend from route proof into action proof |
| Connections | `8/10` | Proven in local broad sweep | Complete late-loop return coverage |
| Discovery | `7/10` | Reached in the broad sweep | Prove close-and-return cleanly |
| Recurring circles | `7/10` | Wired and reachable | Add broad-sweep proof and action coverage |
| Saved searches | `7/10` | Wired and reachable | Add broad-sweep proof and persistence checks |
| Scheduled tasks | `7/10` | Wired and reachable | Add broad-sweep proof and state-change checks |
| Intent detail | `7/10` | Real data path | Add direct traversal and lifecycle automation |
| Chats | `6/10` | Under-audited, not under-built | Run the new chat core/resilience/safety lanes |
| Profile | `7/10` | Strong route wiring, selectors now present | Prove edit + persistence paths |
| Settings | `7/10` | Strong route wiring, selectors now present | Prove rename + protocol-panel paths |
| Other user profile | `6/10` | Reachable but under-audited | Add traversal from Inbox/Discovery/Chats |

## Automation Lanes

| Lane | Readiness | Current state | Next move to raise score |
| --- | --- | --- | --- |
| `mobile-critical-path.yaml` | `8/10` | Good baseline shell proof | Add more post-auth surface assertions |
| `mobile-daily-loop.yaml` | `7/10` | Useful baseline | Expand beyond home/activity |
| `mobile-route-graph.yaml` | `7/10` | Better now that profile/settings are explicit | Re-run and keep widening surface coverage |
| `mobile-surface-smoke.yaml` | `6/10` | Broader than before | Still limited by native dev-client boot issues |
| `mobile-sandbox-home-activity-expo-go-attached.yaml` | `9/10` | Strongest local proof lane | Keep as the control lane |
| `mobile-sandbox-activity-target-expo-go-attached.yaml` | `8/10` | Strong decomposition lane | Continue target-by-target proof |
| `mobile-sandbox-surface-smoke-expo-go-current.yaml` | `7/10` | Now clears boot, Inbox, Connections and reaches Discovery | Finish late-loop Expo recovery |
| `mobile-profile-persistence.yaml` | `7/10` | New lane, selectors now exist | Run and stabilize save + revisit proof |
| `mobile-settings-persistence.yaml` | `7/10` | New lane, selectors now exist | Run and stabilize save + protocol panel proof |
| `mobile-chats-core.yaml` | `6/10` | New lane, core selectors now exist | Add thread modal, send, and reply proof |

## Foundation

| Area | Readiness | Current state | Next move to raise score |
| --- | --- | --- | --- |
| App shell + tabs | `8/10` | Strong | More notification-entry proof |
| Local UI state layer | `8/10` | Strong | More persistence and cold-start proof |
| Server state layer | `9/10` | Very strong | Keep widening automation usage of it |
| Offline/session lifecycle | `8/10` | Strong | Add explicit resume/reconnect proof |
| Transient route graph | `9/10` | Very strong | Finish remaining route-return proofs |

## Current Headline

- strongest today: `Activity`, `server state`, `transient route graph`
- next biggest gains: `Chats`, `Profile`, `Settings`
- main blocker to `10/10` across the board: dependable late-loop local Maestro recovery plus deeper persistence and chat-behavior coverage
