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
| Mobile | Profile | `9/10` | Bio, interests, preferences, reopen persistence, avatar updates, peer profile, and chat provenance are covered, but still need same-window promotion evidence | `pnpm test:mobile:readiness-pack -- --lane=profile-promotion` |
| Mobile | Settings/protocol visibility | `9/10` | Identity persistence plus linked apps, grants/consent counts, delivery queue summary | `pnpm test:mobile:readiness-pack -- --lane=settings-protocol-promotion` |
| Backend | Daily-loop read models | `9/10` | Home and Activity summaries have deterministic assertions for baseline, waiting replies, activity burst, and stalled search, but need a fresh purpose-pack pass before promotion | `test:purpose:scenario-pack -- --backend` |
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

Use the promotion plan to see the exact `9/10` -> `10/10` checklist without
executing any lane:

```bash
pnpm test:mvp:readiness-pack -- --promotion-plan
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

For the focused mobile release-window proof that covers both Profile and
Settings/protocol visibility, run:

```bash
pnpm test:mobile:readiness-pack -- --lane=profile-promotion,settings-protocol-promotion
```

For full Settings/protocol promotion beyond mobile visibility, keep the mobile
group paired with the backend/SDK protocol evidence in the same release window.

## Purpose Scenario Pack

List the daily-loop scenarios and the exact read-model proof each one provides:

```bash
pnpm test:purpose:scenario-pack -- --list
```

Backend promotion evidence comes from a fresh same-window run:

```bash
pnpm test:purpose:scenario-pack -- --backend
```

The backend lane applies each sandbox scenario, inspects the backend experience
read models, and must show all four scenarios completing with
`Purpose scenario pack completed.` Keep the row at `9/10` until that run passes
for the release window being promoted.

Scenario proof expected from list output:

| Scenario | What it proves | Backend evidence to inspect |
| --- | --- | --- |
| `baseline` | Daily-loop Home can explain the normal sandbox state from backend read models | `validated=true` with Home tone `active` or `waiting` and a coordination or top-suggestion spotlight |
| `waiting_replies` | Home can distinguish waiting-on-others from an action the user should take | `validated=true` with coordination title `Waiting on replies` and no `targetChatId` handoff |
| `activity_burst` | Activity read models surface a meaningful change summary after a notification burst | `validated=true` with `activityCounts.unreadNotifications` greater than `0` |
| `stalled_search` | Home can switch into explicit recovery guidance when matching stalls | `validated=true` with Home tone `recovery` and a recovery spotlight |

## 10/10 Promotion Board

| Area | Current blocker | Promotion evidence needed | Owner lane |
| --- | --- | --- | --- |
| Mobile signed-out landing | Selectors and lane exist, but no fresh signed-out run evidence is recorded | `pnpm test:mobile:readiness-pack -- --lane=auth-landing-current` or equivalent signed-out Maestro proof | mobile |
| Mobile onboarding | The first-run lane still uses the dev-only completion shortcut | Fresh `mobile-onboarding-completion.yaml` pass plus a follow-up non-dev auth/onboarding proof plan | mobile |
| Mobile Home scenarios | Purpose pack exists, but backend+mobile scenario runs have not passed in the same release window | `pnpm test:purpose:scenario-pack -- --backend --mobile` | purpose |
| Mobile Chats | Reply/thread lane and mutation lane are now both in the readiness pack, but need a fresh run together | `pnpm test:mobile:readiness-pack -- --lane=chats-thread-current,chats-mutations-current` | mobile |
| Mobile Profile | Profile is broad but matrix evidence is split across overview, bio, interests, preferences, media, peer profile, and chat provenance lanes | `pnpm test:mobile:readiness-pack -- --lane=profile-promotion` passing in the current release window | mobile |
| Settings/protocol | Current mobile proof is visibility-focused, not action/operation management | `pnpm test:mobile:readiness-pack -- --lane=settings-protocol-promotion` plus protocol backend/SDK packs for grants, webhooks, queue, and replay in the current release window | mobile + sdk |
| Backend daily-loop scenarios | Scenario validation is wired, but no fresh all-scenario purpose-pack pass is recorded in this matrix | `pnpm test:purpose:scenario-pack -- --backend` output showing `baseline`, `waiting_replies`, `activity_burst`, and `stalled_search` all pass, with the scenario proof table above used as the evidence checklist | backend |
| SDK partner examples | Preflight metadata now lists client vs agent prerequisites, but no fresh package/example evidence has passed in this release window | SDK readiness pack run plus intentional partner example evidence after dist prerequisites are prepared | sdk |

The same checklist is available in dry form from:

```bash
pnpm test:mvp:readiness-pack -- --promotion-plan
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
