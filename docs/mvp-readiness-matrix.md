# MVP Readiness Matrix

This matrix answers the practical launch question: if we boot the backend,
mobile app, and SDK surface today, what can users and partners actually do?

Scale:
- `10/10`: proven by recent automation and ready for MVP use
- `9/10`: wired and covered, but needs a fresh pack run before promotion
- `8/10`: functional but still missing a release-grade proof lane
- `1-7/10`: not MVP-ready without more work

## Capability Matrix

| Area | Capability | Readiness | What works now | Primary proof |
| --- | --- | --- | --- | --- |
| Mobile | Signed-out landing | `9/10` | Preserved video backdrop, cycling title sequence, and Google CTA selectors | `mobile-auth-landing-current.yaml` |
| Mobile | Onboarding to Home | `8/10` | Incomplete E2E session can complete onboarding into Home | `mobile-onboarding-completion.yaml` |
| Mobile | Daily-loop Home | `9/10` | Home explains state, next move, recovery, and coordination cards from backend read models | `test:purpose:scenario-pack` |
| Mobile | Activity | `10/10` | Activity shows changes, quick links, notifications, and route recovery | `mobile-route-graph.yaml`, notification lanes |
| Mobile | Chats | `9/10` | Seeded chat, reply banner, edits/reactions/deletes, thread modal, and peer profile traversal are covered | chat current-state Maestro lanes |
| Mobile | Profile | `9/10` | Bio, interests, preferences, reopen persistence, and avatar updates are covered, but the mobile matrix still requires broader overview/bio/interests promotion evidence | profile current-state Maestro lanes |
| Mobile | Settings/protocol visibility | `9/10` | Identity persistence plus linked apps, grants/consent counts, delivery queue summary | settings current-state lanes |
| Backend | Daily-loop read models | `9/10` | Home and Activity summaries cover baseline, waiting replies, activity burst, and stalled search | `playground:sandbox -- --action=validate` |
| Backend | Operational launch pack | `10/10` | Release gate, smoke lane, moderation drill, protocol recovery drill, and runbook checks are packed | `test:backend:ops-pack` |
| Backend | Protocol recovery | `10/10` | Queue/auth health is inspectable, replay blockers are surfaced, recovery artifact is written | `protocol:recovery:drill` |
| SDK | Protocol client | `9/10` | Partner client exposes discovery, registration, tokens, grants, webhooks, visibility, replay, and actions | `test:sdk:readiness-pack -- --run --lane=protocol-client` |
| SDK | Protocol agent | `9/10` | Agent binding, readiness checks, token freshness, toolset, and toolkit helpers are available | `test:sdk:readiness-pack -- --run --lane=protocol-agent` |
| SDK | Protocol server/events/types | `9/10` | Shared schemas, event catalog, server helpers, and webhook verification are package-scoped | `test:sdk:readiness-pack -- --run` |

## Pack Runner

Use the all-up runner to see the launch evidence lanes without executing them:

```bash
pnpm test:mvp:readiness-pack -- --list
```

Run intentionally when backend credentials, SDK build prerequisites, and mobile
automation state are ready:

```bash
pnpm test:mvp:readiness-pack -- --run
```

Run one lane at a time:

```bash
pnpm test:mvp:readiness-pack -- --run --lane=sdk
pnpm test:mvp:readiness-pack -- --run --lane=purpose-backend
```

## User-Visible MVP

If all packs pass, the MVP can support:

- A user signs in, completes onboarding, and lands in a stateful Home surface.
- Home tells the user whether matching is active, waiting on others, or stalled.
- Activity shows important changes and routes to supporting surfaces.
- Chats let users coordinate with real people, reply in context, and inspect peer profiles.
- Profile and Settings let users manage identity, preferences, media, and protocol visibility.

## Partner / SDK MVP

If all SDK and backend protocol packs pass, partners can:

- Discover the protocol surface and register an app.
- Manage app tokens, scopes, grants, and consent requests.
- Register webhooks, inspect delivery state, and replay failures.
- Invoke scoped coordination actions for intents, requests, chats, connections, and circles.
- Use the agent wrapper to assert readiness before invoking delegated actions.

## Promotion Rule

No row moves to `10/10` unless its referenced automation has passed in the same
release window. Docs may describe capability, but scores should only reflect
current automated evidence.
