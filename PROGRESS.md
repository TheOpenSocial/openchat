# OpenSocial — Master Implementation Plan

This file is the execution source of truth for coding agents.
It is organized as a production-grade build checklist with:
- epics
- concrete tasks
- dependencies
- acceptance criteria
- implementation notes

## Status Legend
- [ ] not started
- [~] in progress
- [x] complete
- [!] blocked / needs decision

## Verification Checklist
- [x] `pnpm format:check`
- [x] `pnpm lint`
- [x] `pnpm typecheck`
- [x] `pnpm test`
- [x] `pnpm db:drift-check`

Last verified: 2026-03-20

## Implementation Notes
- 2026-03-24: Advanced `TP-04` onboarding quality gate by upgrading benchmark coverage from 4 sample prompts to a 24-transcript EN/ES dataset (`scripts/onboarding-benchmark-dataset.json`) and extending `scripts/benchmark-onboarding.mjs` with quality scoring, generic-persona/generic-summary detection, and threshold enforcement (`ONBOARDING_BENCH_MIN_QUALITY_SCORE`, `ONBOARDING_BENCH_MAX_GENERIC_PERSONA_RATE`) alongside latency/failure gates.
- 2026-03-24: Continued `TP-04` persona/summary quality tuning by updating onboarding prompt instructions to `onboarding_fast_pass.v2` and `onboarding_inference.v2`, with explicit anti-generic guidance and concrete-detail grounding constraints.
- 2026-03-23: Advanced `TP-08` session continuity by fixing client refresh handling in mobile/web API layers: refresh `5xx`/transient failures now remain retryable (no forced sign-out), and `401` request retry paths only emit `auth_expired` on hard refresh failure, reducing false “session expired” interruptions during temporary backend/network instability.
- 2026-03-23: Completed `TP-17` guardrail thresholds by extending `GET /api/admin/ops/alerts` with onboarding activation execution alerts from `client_mutations` (`failure_rate`, `processing_rate`, `avg_completion_latency`) and env-tunable thresholds, plus regression coverage in `admin.controller.spec.ts`.
- 2026-03-23: Continued `TP-17` with backend/admin visibility by adding `GET /api/admin/ops/onboarding-activation` (server-side snapshot from `client_mutations` onboarding carryover executions) plus an Overview panel action in `apps/admin` to refresh/render activation health counters and rates.
- 2026-03-23: Continued `TP-17` mobile guardrails by adding activation-health threshold messaging in Profile telemetry (`healthy|watch|critical|no_data`) so onboarding-first-action regressions surface immediately without inspecting raw counters.
- 2026-03-23: Advanced `TP-17` mobile guardrails by extending local telemetry summaries with onboarding activation funnel counters/rates (`ready|started|succeeded|queued|failed`, success/queue/failure rates, avg completion seconds) and surfacing them in Profile telemetry for real-time activation-health visibility.
- 2026-03-23: Closed `TP-16` by adding backend replay-safety verification for onboarding activation mutations in `apps/api/test/client-mutation.service.spec.ts` (`intent.create_from_agent` scope), asserting same idempotency key replays return cached response and do not execute the handler twice.
- 2026-03-23: Extended `TP-16` mobile carryover UX resilience with persisted activation handoff state (`seed`, `idempotencyKey`, `state`) in local storage, including safe restore on relaunch/background and resume messaging when prior processing was interrupted.
- 2026-03-23: Advanced `TP-16` mobile execution resilience by threading deterministic idempotency keys through onboarding carryover send paths (`agent respond stream`, `intents/from-agent`, and direct `intents`) and offline outbox replay, preventing duplicate first-action activation on transient network failures/retries.
- 2026-03-23: Advanced `TP-17` on mobile by instrumenting onboarding activation funnel telemetry events (`onboarding_activation_ready|started|succeeded|queued|failed`) across onboarding completion (`App.tsx`) and one-tap carryover execution (`HomeScreen.tsx`) including elapsed-time properties for latency/failure monitoring.
- 2026-03-23: Continued `TP-02`/`TP-03` onboarding launch hardening. Polished mobile onboarding processing copy/states (EN/ES) and reduced expression-step layout shift with a fixed signal-card height. Hardened OpenAI onboarding parsing to recover JSON payloads embedded in mixed model output (`output_text`/`text` blocks + first-object extraction), then deployed to production (`93a4566`). Live probe confirms stable success responses (`fast` ~1.7s, `rich` ~22.5s with non-failing fallback path), so reliability improved while rich-latency tuning remains an open launch item.
- 2026-03-23: Advanced `TP-05` model routing/timeout tuning in production by moving rich onboarding inference to `ministral-3:14b` with `ONBOARDING_LLM_RICH_TIMEOUT_MS=8000` (keeping fast on `ministral-3:3b` and `4000ms`). Post-deploy probe verification shows strong latency improvement (`fast` ~1.6s, `rich` ~2.2s) with stable `201` responses.
- 2026-03-22: Logged TP-01 in the mobile onboarding transition queue to address first-to-second onboarding page smoothness on low-end/low-frame-rate devices before continuing subsequent onboarding polish.
- 2026-03-22: Shipped the first real client resilience slice across mobile + web. Added bounded transient retry/backoff and typed offline/transient API errors in both client API layers, mobile persistent offline outbox + replay for composer sends and profile/settings writes, reconnect-triggered agent-thread refresh, pending queued-action UX on mobile, and offline-aware bootstrap/auth restoration on both clients using cached completion state.
- 2026-03-22: Closed the replay-safety gap with a durable backend `client_mutations` ledger, `Idempotency-Key` handling on intent/profile/global-rules/agent respond endpoints, and stable outbox item ids forwarded from mobile replay paths so reconnects and app restarts do not duplicate core mutations.
- 2026-03-22: Audited client connectivity resilience. Web/mobile already detect online/offline state and block intent/chat sends while offline, and auth refresh uses an in-flight guard, but there is not yet a first-class client outbox, transient retry/backoff policy, or resumable SSE/chat sync recovery layer. Added a dedicated pending lane to track offline/retry hardening before broader mobile/web scale-up.
- 2026-03-22: Completed `AH-06` operator replay/debug coverage for agent-issued social actions. Finished the admin debug surface for `GET /api/admin/ops/agent-actions` so blocked or failed tools now reconstruct from audit traces, linked approval checkpoints, latest user turn, and related trace events with concrete replay guidance. Added regression coverage in `apps/api/test/admin.controller.spec.ts`.
- 2026-03-22: Closed a backend matching/trust gap that surfaced during the policy audit. Added unblock support (`DELETE /api/moderation/blocks/:blockedUserId`, `GET /api/moderation/users/:userId/blocks`), introduced explicit `countryPreferences` in global rules, and upgraded `MatchingService` hard filters so explicit language and country preferences now actually gate matches instead of being stored-only metadata.
- 2026-03-22: Completed `AH-05` outcome telemetry + eval coverage for agent-issued social actions. The agent runtime now emits structured `agent_social_action` analytics for visible social tools, analytics now computes bounded admin-facing outcome metrics for intro acceptance, circle-join conversion, and follow-up usefulness, and admin ops gained a dedicated snapshot surface (`GET /api/admin/ops/agent-outcomes`) plus eval coverage for telemetry health in `AgenticEvalsService`.
- 2026-03-21: Advanced moderation command-center lane with persisted reviewer ownership + analytics (`M-04`/`M-05`). Added `moderation_flags` assignment/decision fields (`assigneeUserId`, notes, timestamps, lastDecision`) plus migration `20260321_moderation_command_center`, updated admin moderation actions to persist assignee/triage state, and extended moderation summary with SLA-style analytics (avg assignment/decision minutes, dismissal rate, repeat offenders, top reasons). Upgraded admin moderation cards to surface assignee/decision context directly alongside queue and agent-risk triage.
- 2026-03-21: Started moderation command-center v1 pass across backend + admin. Added filtered moderation queue querying (`status`, `entityType`, `reasonContains`), new admin moderation summary/settings APIs (`GET /api/admin/moderation/summary`, `GET /api/admin/moderation/settings`), and upgraded the admin moderation tab into a more operational dashboard with KPI cards, policy/settings visibility, filtered queue review, and faster triage affordances. Added regression coverage in `apps/api/test/admin.controller.spec.ts`.
- 2026-03-21: Added deployed-environment moderation drill automation via `scripts/moderation-drill.mjs` and root command `pnpm moderation:drill`. The drill supports a non-destructive default (`resolve`) plus optional enforcement verification (`restrict_user`, `escalate_strike`), and validates the operator loop across report creation or existing-flag entry, admin queue visibility, assignment, triage, and downstream audit/enforcement checks. Updated staging smoke and admin runbook docs so the remaining moderation gap is execution in staging/prod, not missing implementation.
- 2026-03-21: Backend audit follow-up: fixed timezone-aware scheduling correctness for recurring intelligence flows. Weekly `scheduled_tasks` and `recurring_circles` now compute their next run/session using the configured IANA timezone instead of silently treating local wall-clock schedules as UTC. Added regression coverage in `scheduled-tasks.service.spec.ts` and `recurring-circles.service.spec.ts` with non-UTC schedules.
- 2026-03-22: Extended backend time-local correctness for user-notification rules. Added first-class global-rules timezone support (`global_rules_timezone`) with default `UTC`, and updated notification quiet-hours routing to evaluate against the user's configured timezone, falling back to availability-window timezone when needed. Added regression coverage in `notifications.service.spec.ts` and `personalization.service.spec.ts`.
- 2026-03-22: Tightened async launch-control enforcement for recurring circles. Background due-session dispatch now re-checks `recurring_circles` launch eligibility against the circle owner's user id before opening a session, preventing invite-only / alpha-cohort bypass via already-created circles. Added regression coverage in `recurring-circles.service.spec.ts`.
- 2026-03-20: Advanced staging hardening lane (`B-10`) with executable incident-readiness automation. Added `scripts/staging-incident-verify.mjs` + root command `pnpm staging:verify:incident` to validate health, `ops/alerts`, `ops/metrics`, launch controls, queue visibility, and runbook file presence with configurable fail gates (`INCIDENT_VERIFY_REQUIRE_HEALTHY`, `INCIDENT_VERIFY_FAIL_ON_WARNING`). Wired manual staging deploy workflow (`deploy-staging.yml`) with optional post-deploy verification input (`run_post_deploy_verification`) and staging secrets (`STAGING_API_BASE_URL`, `STAGING_SMOKE_*`) so go/no-go checks are repeatable.
- 2026-03-20: Re-ran workspace dependency currency sweep with `pnpm deps:outdated` (`pnpm outdated -r`) and confirmed no remaining outdated dependencies across tracked lanes at this checkpoint. Marked `D-01` complete while keeping future cadence as a recurring maintenance practice.
- 2026-03-20: Advanced `D-01` by upgrading mobile `react-native` from `0.83.2` to `0.84.1` and re-verifying `@opensocial/mobile` `typecheck`, `lint`, and `build:ios` (Expo prebuild/export successful; Expo emits advisory that SDK 55 recommends `0.83.2`). Current `pnpm deps:outdated` now shows only one remaining item: mobile `tailwindcss@4.2.2`, blocked by current NativeWind/`react-native-css-interop` peer lane (`tailwindcss ~3`).
- 2026-03-20: Advanced `D-01` again by upgrading mobile `@react-native-async-storage/async-storage` from `2.2.0` to `3.0.1`, then re-verifying `@opensocial/mobile` `typecheck`, `lint`, and `build:ios`. Remaining workspace drift from `pnpm deps:outdated` is now limited to `react-native@0.84.1` and mobile `tailwindcss@4.2.2` compatibility lanes.
- 2026-03-20: Wired admin E2E into CI as a **manual-only** path to preserve GitHub Actions budget: added `@opensocial/admin` Playwright browser install + `test:e2e` steps gated on `workflow_dispatch` in `.github/workflows/ci.yml`.
- 2026-03-20: Completed admin optional E2E baseline by adding Playwright scaffolding in `apps/admin` (`playwright.config.ts`, `e2e/admin-signin.spec.ts`, `test:e2e` scripts) and verifying sign-in gate smoke in Chromium (`1 passed`).
- 2026-03-20: Completed Radix `Select` adoption baseline in admin optional polish lane by adding reusable `ui/select` (Radix Select + shadcn-style styling) and migrating admin shell locale picker from native `<select>` to the shared primitive.
- 2026-03-20: Advanced optional frontend/admin polish lane by adding URL-based tab deep-links for web home tabs and admin workbench tabs (`?tab=` sync with restore-on-refresh) so operator/user flows are shareable and stateful across reloads.
- 2026-03-20: Advanced `D-01` mobile dependency-currency lane by upgrading `@react-native-community/netinfo` to `12.0.1` and `react-native-worklets` to `0.8.1`, then re-verifying `@opensocial/mobile` `typecheck`, `lint`, and `build:ios` (Expo prebuild + export). Refreshed `pnpm deps:outdated`; remaining drift is now limited to known compatibility-coupled blockers: `react-native@0.84.1` (Expo SDK window), `tailwindcss@4` (`react-native-css-interop` peer lane), and `@react-native-async-storage/async-storage@3` (runtime module regression previously observed).
- 2026-03-20: Advanced `D-01` dependency-currency lane by upgrading web/admin `next` from `16.2.0` to `16.2.1` and re-validating app gates (`@opensocial/web` + `@opensocial/admin` typecheck/lint). Refreshed `pnpm deps:outdated`; remaining drift is mobile compatibility lane only (`react-native`, `react-native-worklets`, `@react-native-community/netinfo`, `@react-native-async-storage/async-storage`, `tailwindcss`) and stays intentionally in-progress.
- 2026-03-20: Completed `F-04` shared i18n productionization baseline across web/mobile/admin. Added locale catalogs (`en`, `es`) and runtime locale switching with persistence (`localStorage` for web/admin, `AsyncStorage` for mobile), updated existing translated copy lookups to locale-aware accessors, added user-facing language controls in web/mobile profile surfaces, and added admin-shell locale selector with localized operational chrome labels (`ready`, `busy`, `sign out`, operator-context note). Re-verified `@opensocial/web|mobile|admin` typecheck + lint.
- 2026-03-20: Completed `U-18`/`U-19`/`U-20`/`U-21` client-productization pass for recurring social-assistant behaviors. Added first-class automation surfaces for saved searches + scheduled task briefings in web/mobile profile tabs (quick create, task selection, run-now, run history), and added admin user inspector snapshots for `saved_searches`, `scheduled_tasks`, and first-task run history. Extended web/mobile API clients with scheduled task and saved search contracts (`list/create/delete`, task listing, run-now, run-history). Re-verified `@opensocial/web|mobile|admin` lint + typecheck.
- 2026-03-20: Completed `U-11` user-facing explainable memory controls across web/mobile/admin. Added profile/admin memory-control actions for life-graph retrieval snapshots, explicit memory refresh paths, and learned-memory reset (`POST /api/privacy/:userId/memory/reset`) through client API layers and product UI surfaces. Stabilized notification quiet-hours test determinism by pinning system time in `notifications.service.spec.ts`. Re-verified `@opensocial/web|mobile|admin` lint + typecheck, `@opensocial/types` build, and `@opensocial/api` typecheck + lint + full test suite.
- 2026-03-20: Completed `U-14` first-class search surfaces (backend + clients). Added `search` API module (`GET /api/search/:userId?q=&limit=`) with unified user/topic/activity/group search aggregation from profiles/interests/topics/active intents/recurring circles and launch-control gating via discovery controls. Added search contracts in `@opensocial/types` and regression tests (`search.service.spec.ts`, `search.controller.spec.ts`). Added minimal productized search cards in web/mobile profile tabs and admin user inspector (`Run search` + snapshot panel). Re-verified `@opensocial/types` build/typecheck, `@opensocial/api` typecheck/lint/test, and web/mobile/admin lint + typecheck.
- 2026-03-20: Completed `U-22` agent-managed multi-step social-plan approval checkpoints (backend v1). Added Prisma model/migration `agent_plan_checkpoints`, runtime checkpoint creation when risky tool actions are blocked by `human_approval_required`, and agent-thread checkpoint APIs (`GET /api/agent/threads/:threadId/plan-checkpoints`, `POST .../:checkpointId/approve`, `POST .../:checkpointId/reject`) with ownership + actor validation and workflow updates on decision. Added regression coverage in `agent-conversation.service.spec.ts` and `agent.controller.spec.ts`; re-verified `@opensocial/types` build/typecheck and `@opensocial/api` typecheck/lint/test.
- 2026-03-20: Completed `UQ-01`, `UQ-02`, `UQ-03`, and `UQ-04` frontend/client-productization pass across web/mobile/admin. Added discovery/passive and continuity surfaces (passive snapshot, inbox/reconnect suggestions, publish recommendations to agent thread) plus user-facing routing explanation cards driven by pending-intent summaries in web + mobile profile tabs and admin user inspector snapshots. Added intent-mode decomposition controls in web/mobile composer and routed intent-mode sends through `POST /api/intents/from-agent` with bounded decomposition controls (`allowDecomposition`, `maxIntents`) while preserving fallback `POST /api/intents` path. Re-verified `@opensocial/web|mobile|admin` lint + typecheck.
- 2026-03-20: Completed `UQ-06h` and `UQ-06i` for recurring circles v1. Session opening now auto-generates owner intents and posts agent workflow updates (`recurring_circle_session` metadata), with failure-safe fallback recording on circle/session state. Added minimal user/admin client surfaces: web profile tab circle list/create/open-now/session history, mobile profile tab circle list/create/open-now/session history, and admin user inspector snapshots for circles and first-circle sessions. Re-verified `@opensocial/web|admin|mobile` lint + typecheck and `@opensocial/api` lint + typecheck + tests.
- 2026-03-20: Started `UQ-06` recurring circles/communities v1 backend foundation. Added Prisma models/migration for `recurring_circles`, `recurring_circle_members`, and `recurring_circle_sessions`; shipped `recurring-circles` module with owner/member CRUD, session run-now, due-session dispatch, and admin visibility endpoints; extended launch controls with `recurring_circles` (`launch.enable_recurring_circles` / `FEATURE_ENABLE_RECURRING_CIRCLES`); added contracts and service coverage in `recurring-circles.service.spec.ts`; re-verified `pnpm db:generate`, `pnpm --filter @opensocial/types typecheck`, and `pnpm --filter @opensocial/api typecheck`, `lint`, `test`.
- 2026-03-20: Started `UQ-04` multi-intent decomposition v1 in backend intent ingestion. `POST /api/intents/from-agent` now supports bounded decomposition controls (`allowDecomposition`, `maxIntents`) and `IntentsService.createIntentFromAgentMessage` can split explicit multi-request messages (newlines, semicolons, list/sentence boundaries), create multiple intents with scoped trace IDs, and acknowledge multi-intent handling in-thread. Added regression tests for decomposition and opt-out behavior in `intents.service.spec.ts`; re-verified `pnpm --filter @opensocial/types typecheck` and `pnpm --filter @opensocial/api typecheck`, `lint`, `test`.
- 2026-03-20: Completed `UQ-05` recurring tasks + scheduled searches v1 backend scope end-to-end. Added Prisma models/migration (`scheduled_tasks`, `scheduled_task_runs`, `saved_searches`), shared contracts in `@opensocial/types`, scheduled-tasks module (CRUD/run-now/run-history + admin visibility), BullMQ `scheduled-tasks` queue consumers (dispatch + run execution), task executors (`saved_search`, `discovery_briefing`, `reconnect_briefing`, `social_reminder`), notification/agent-thread delivery, launch controls (`scheduled_tasks`, `saved_searches`, `recurring_briefings`), and regression coverage in `scheduled-tasks.service.spec.ts`. Re-verified `pnpm --filter @opensocial/api typecheck`, `lint`, and `test`.
- 2026-03-20: Added [USE_CASES.md](/Users/cruciblelabs/Documents/openchat/USE_CASES.md) as the product-level source of truth for the full conceptual surface of OpenSocial, including MVP, growth, and ChatGPT-class social-assistant use cases. Extended `PROGRESS.md` with a dedicated use-case coverage board so execution can be mapped directly against that product surface.
- 2026-03-20: Advanced `D-01` dependency-currency tooling lane by upgrading workspace tooling to latest tracked majors (`eslint@10.1.0`, `@eslint/js@10.0.1`, `@types/node@25.5.0`, `globals@17.4.0`, `lint-staged@16.4.0`, `turbo@2.8.20`) and regenerating lockfile. Re-verified `pnpm typecheck`, `pnpm lint`, `pnpm test`, and `pnpm db:drift-check`. Remaining outdated packages are mobile compatibility lane items (`react-native`, `tailwindcss`, `@react-native-community/netinfo`, `@react-native-async-storage/async-storage`) and remain intentionally deferred until Expo compatibility window.
- 2026-03-20: Completed `F-05` client session continuity across web/mobile/admin by adding centralized authenticated-request refresh handling in each client API layer: on `401`, perform a single `POST /api/auth/refresh` attempt, rotate stored access/refresh/session tokens, retry the original request once, and force local sign-out/session reset when refresh fails.
- 2026-03-20: Product decision: deprioritized staging go/no-go validation track (`B-10`, Section `31`/`34.2` staging launch parity checks) into a post-launch hardening lane to unblock immediate delivery focus on client/session work and dependency currency.
- 2026-03-20: Hardened deploy secret handling by wiring staging/production/rollback GitHub workflows to pass `OPENAI_API_KEY` from GitHub Environment Secrets into deploy scripts and syncing that key into remote `.env.production` before Docker Compose build/migrate/up. Added regression checks in `deployment-pipeline.spec.ts` to enforce workflow secret wiring + remote env sync behavior.
- 2026-03-20: Upgraded backend message moderation to a hybrid deterministic + OpenAI assist pipeline. Added `ModerationService.assessContentRiskWithPolicy` (OpenAI assist with deterministic fallback and restrictive-decision merge), switched `POST /api/moderation/assess` to the hybrid path, and wired `ChatsService.createMessage` to OpenAI-assisted moderation decisions (`blocked`/`review`) before persistence while preserving strict-mode escalation, moderation flags, and audit artifacts. Added regression coverage in `moderation.service.spec.ts` and `chats.service.spec.ts`; re-verified `pnpm --filter @opensocial/api lint`, `typecheck`, and `test`.
- 2026-03-20: Ran a focused security audit pass while deployment work progressed in parallel. `pnpm audit --prod --json` surfaced one moderate advisory (`markdown-it` CVE-2022-21670) via mobile transitive dependency `react-native-markdown-display`; patched by adding root override `markdown-it@12.3.2`, then re-verified: `pnpm audit --prod` (0 vulns), `pnpm --filter @opensocial/api test`, and mobile `lint`, `typecheck`, `build`.
- 2026-03-20: Closed backend runtime bootstrap blocker that prevented local/staging smoke execution. Added API health endpoint (`GET /api/health`) and fixed Nest runtime startup path by loading decorator metadata at bootstrap (`import "reflect-metadata"` in API entrypoint), introducing deterministic API build output (`apps/api/tsconfig.build.json`), and aligning workspace runtime package entrypoints (`@opensocial/types`, `@opensocial/openai`) to built JS (`dist`). Updated smoke runner to avoid localhost false negatives from abuse-throttle coupling via per-check forwarded IPs (`SMOKE_USE_UNIQUE_IP`), then re-ran `pnpm staging:smoke:api` with 8/8 checks passing.
- 2026-03-20: Client **agent streaming**: web (`EventSource`) + mobile (XHR SSE parser) on `GET /api/agent/threads/:id/stream?access_token=`, combined with `POST .../respond/stream` and client `traceId` to append `response_token` workflow chunks live; `extractResponseTokenDelta` in `@opensocial/types`. Optional **https image URL** attachments on web/mobile agent chat. Admin **Moderation** tab UI for agent-risk flag list / triage / assign.
- 2026-03-20: Added backend staging-smoke automation for rollout readiness with `scripts/staging-smoke-api.mjs` + root command `pnpm staging:smoke:api`, covering health/admin ops, queue/dead-letter, and moderation agent-risk queue checks with admin headers/auth env wiring. Updated `docs/staging-smoke-checklist.md` to include runnable automation inputs.
- 2026-03-20: Implemented backend moderation operations triage workflow for conversational agent risk flags: new admin endpoints for filtered queue listing (`GET /api/admin/moderation/agent-risk-flags`), assignment (`POST /api/admin/moderation/flags/:flagId/assign`), and triage actions (`POST /api/admin/moderation/flags/:flagId/triage`) supporting resolve/reopen, strike escalation, and direct user restriction. Added admin controller coverage for queue filters, assignment audit writes, and triage/strike behavior.
- 2026-03-20: Strengthened conversational moderation durability by persisting non-clean agent risk checks (`pre_tools`, `pre_send`) into `moderation_flags` (`entityType: agent_thread`) and `audit_logs` (`moderation.agent_risk_assessed`) with trace metadata + reason tokens + content excerpt. Expanded `agent-conversation.service.spec.ts` to assert this write path for blocked turns. Added unified objective/task board section and a visual tracker at `docs/tasks-dashboard.html`.
- 2026-03-20: Completed backend parity track for gap items `1, 3, 4, 5, 6` (skipped `2` frontend lane): true OpenAI response delta streaming wired into agent thread workflow events (`response.output_text.delta`), multimodal turn payload support (`voiceTranscript`, `attachments`) persisted in thread metadata and injected into planning/response tasks, pre-tool and pre-send moderation risk-gates with new `POST /api/moderation/assess`, admin deterministic eval snapshot endpoint (`GET /api/admin/ops/agentic-evals`), and OpenAI response budget/circuit guardrails exposed in ops metrics (`openaiBudget`). Added/expanded regression coverage in `agent-conversation.service.spec.ts`, `agent.controller.spec.ts`, `moderation.service.spec.ts`, `admin.controller.spec.ts`, and `openai-client.spec.ts`.
- 2026-03-20: Completed remaining Section `32` backend agentic-runtime scope by adding runtime human-approval guardrails for risky actions (`actionType` + `riskLevel` gating), orchestration-stage workflow step emission, response token-chunk streaming through thread workflow updates (`response_token` stage) with `POST /api/agent/threads/:threadId/respond/stream`, and additional integration/regression coverage (`agent-conversation.integration.spec.ts`, expanded `agent-conversation.service.spec.ts`, `agent.controller.spec.ts`, `openai-client.spec.ts`). Re-verified `pnpm --filter @opensocial/api lint`, `typecheck`, `test`, and root `pnpm format:check`.
- 2026-03-20: Implemented backend OpenClaw-style agentic turn runtime wiring: added `POST /api/agent/threads/:threadId/respond` with strict payload/ownership validation, registered `AgentConversationService` in module DI, and completed manager-planned orchestration execution with bounded tool registry + per-role allowlist enforcement + explicit denied/failed tool telemetry (`agentic.tool_denied`, `agentic.tool_failed`). Added service/controller regression coverage (`agent-conversation.service.spec.ts`, `agent.controller.spec.ts`) and updated OpenAI routing tests for `conversation_planning` / `conversation_response` tasks. Re-verified `pnpm --filter @opensocial/api lint`, `typecheck`, `test`, and root `pnpm format:check`.
- 2026-03-20: Completed **web/admin dependency lane**: upgraded `apps/web` and `apps/admin` to **Next.js 16.2** (Turbopack default build) and **Tailwind CSS 4.2** with `@tailwindcss/postcss`, migrated global styles to `@import "tailwindcss"` + legacy `@config` for existing `tailwind.config.js` theme extensions.
- 2026-03-20: Locked **Turbopack-first** Next config: documented in `next.config.ts` that webpack is opt-in only; enabled `experimental.turbopackFileSystemCacheForBuild` for faster repeat `next build`; aligned admin `allowedDevOrigins` with web (`127.0.0.1`).
- 2026-03-20: Rebuilt `apps/admin` on a **shadcn/ui-compatible** stack (Tailwind CSS variables, Radix Slot/Label/Separator, `class-variance-authority`, `lucide-react`) with `AdminShell` (sidebar + mobile drawer + sticky header), `Card`-backed `Panel`, and `Alert`-backed `Notice`. Added `components.json` for future `shadcn` CLI alignment. `pnpm --filter @opensocial/admin` `lint`, `typecheck`, and `build` verified.
- 2026-03-20: Completed backend polish/audit pass for communication and reliability edges. `ConnectionSetupService` now reactivates previously-left participants (`leftAt -> null`) instead of creating duplicate membership rows and syncs chat memberships from active participants only (`leftAt: null`). Added regression coverage in `apps/api/test/connection-setup.service.spec.ts`.
- 2026-03-20: Patched backend transitive dependency advisories in Prisma’s dev chain by adding root `pnpm.overrides` for `hono@4.12.7`, `@hono/node-server@1.19.10`, and `lodash@4.17.23`. Post-patch `pnpm audit --prod` reports only non-backend lanes (`apps/mobile` markdown-it, `apps/admin` next). Re-verified backend gates: `pnpm --filter @opensocial/api lint`, `typecheck`, `test`, plus root `format:check` and `db:drift-check`.
- 2026-03-20: Admin dashboard **Google sign-in**: API `AuthService` now accepts admin callback URLs in OAuth `state` via `ADMIN_DASHBOARD_REDIRECT_URIS` (exact match) or, when unset, `http(s)://localhost|127.0.0.1/auth/callback` only. Admin app (`apps/admin`) gates the workbench behind sign-in, adds `/auth/callback` to exchange the code, persists session + optional `x-admin-api-key` in `localStorage`, and documents the flow in `documentation.md` / `.env.example`.
- 2026-03-20: Admin **API + SSE auth**: `AccessTokenGuard` accepts `access_token` query **only** on `GET /api/agent/threads/:uuid/stream` so the admin dashboard can open `EventSource` with a bearer-equivalent token; all other routes still require `Authorization` header. Admin `fetch` calls add `Authorization: Bearer` from the stored session. Shared UI tokens in `apps/admin/app/lib/admin-ui.ts`, `AppLoading`, `apps/admin/README.md`.
- 2026-03-20: Closed realtime contract gap for user communication by implementing websocket handlers for `receipt.read` and `presence.update` in `RealtimeGateway` with strict socket identity checks, chat-membership enforcement, receipt persistence via `ChatsService.markReadReceipt`, and server fanout events (`chat.receipt`, `presence.updated`, `presence.changed`). Added regression coverage in `contracts-and-realtime.spec.ts` and re-verified backend gates (`pnpm --filter @opensocial/api lint`, `typecheck`, `test`).
- 2026-03-20: Added backend E2E-style suites for core priorities: `apps/api/test/agentic-communication.e2e.spec.ts` (agent-thread intent ingestion -> fanout -> async follow-up -> request acceptance -> connection/chat setup) and `apps/api/test/rag-retrieval.e2e.spec.ts` (profile/preference retrieval-doc generation, interaction summaries, safe retrieval ranking with flagged-doc exclusion).
- 2026-03-20: Shipped frontend automation + doc alignment bundle: Playwright design-mock critical path (`apps/web/e2e`), CI steps (`format:check`, Chromium install, `test:e2e`), `data-testid` hooks on `WebDesignMockApp`, `allowedDevOrigins` for `127.0.0.1`, Prettier ignores for Playwright output, `docs/frontend-critical-path.md`, staging checklist §8 rollout gates, and `documentation.md` updated for the **Home / Chats / Profile** shell (discovery/inbox as API-only where applicable).
- 2026-03-20: Re-verified full workspace quality gates after backend hardening updates; `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `pnpm db:drift-check` all pass.
- 2026-03-20: Raised backend hardening baseline with three defense-in-depth changes: `AccessTokenGuard` now allows `OPTIONS` preflight without token while keeping all non-public routes authenticated, realtime insecure user-id fallback is force-disabled in `production` even if env override is present, and `POST /api/inbox/requests/expire-stale` now requires `x-cron-key` when `INBOX_EXPIRE_STALE_CRON_KEY` is configured (and is blocked in production if the key is unset). Also switched profile upload token signature checks to constant-time comparison and added regression tests (`access-token.guard.spec.ts`, `inbox.controller.spec.ts`, realtime contract coverage).
- 2026-03-20: Refreshed workspace dependency drift snapshot via `pnpm deps:outdated`; updated tracked latest values (notably `eslint` latest now `10.1.0`) while preserving backend-first rule that web/admin/tooling major migrations stay in parallel lanes unless backend runtime/security is impacted.
- 2026-03-20: Added Playwright **web design-mock** critical-path coverage (`apps/web/e2e/design-mock-critical-path.spec.ts`, `NEXT_PUBLIC_DESIGN_MOCK=1` dev server) with stable `data-testid` hooks in `WebDesignMockApp`, `test:e2e` / `test:e2e:install` scripts, and CI job step to install Chromium + run the suite. Full-stack web E2E against a live API remains optional for a later lane.
- 2026-03-20: Closed backend decision `30.1 OpenAI model policy by task` by codifying explicit task-level model resolution in `@opensocial/openai` (`override -> task env -> global env -> hard default`), adding policy visibility test coverage (`openai-client.spec.ts`), documenting the matrix in `docs/openai-model-policy.md`, and extending env/config docs (`.env.example`, `docs/env-policy.md`, `docs/release-process.md`, `documentation.md`).
- 2026-03-20: Added backend E2E-style flow coverage for `24.3` in `apps/api/test/agent-followup-chat-flow.spec.ts`, validating end-to-end `agent thread -> AsyncAgentFollowup -> RequestAccepted queue -> chat creation` using real queue consumers/services with shared stateful test harness.
- 2026-03-19: Reorganized `PROGRESS.md` sections `27`–`31` after a full markdown audit to remove stale sprint/MVP checklists and replace them with an authoritative backend-first execution queue. Added a synthesized product description and explicit lane split: backend ownership (`12/13/22/23/24/25/26`) vs frontend parallel lane (`apps/mobile`, `apps/web`, `apps/admin`).
- 2026-03-20: Advanced backend test/resilience coverage for `24.4` by adding explicit tests for websocket concurrency sequencing (`contracts-and-realtime.spec.ts`), retry-storm idempotency behavior on no-candidate reruns (`intents.service.spec.ts`), Redis adapter outage fallback (`realtime-io.adapter.spec.ts`), and OpenAI parse timeout fallback capture (`openai-client.spec.ts`). Re-verified `lint`, `typecheck`, `test`, and `db:drift-check` after updates.
- 2026-03-20: Re-ran full markdown audit across all project specs (`00`-`30`, appendices, and `docs/*`) to validate product description + implementation priorities. Closed release-doc blockers by adding source-derived docs (`docs/queue-contracts.md`, `docs/erd.md`, `docs/sequence-diagrams.md`) and onboarding/ops runbooks (`docs/local-setup-guide.md`, `docs/debugging-guide.md`, `docs/common-failures-guide.md`, `docs/queue-replay-runbook.md`, `docs/admin-runbook.md`, `docs/incident-runbook.md`). Updated `documentation.md` operational index and corrected `25.2`/`26.x` completion state.
- 2026-03-20: Closed backend P0 flow gaps by finishing end-to-end `IntentCreated` and `GroupFormation` workflow closure and fully wiring agent-thread follow-up insertion even when explicit `agentThreadId` is omitted (latest-thread fallback). Standardized `IntentCreated` jobs on validated queue envelopes and added structured completion/skip logs for `intent-processing`, `connection-setup`, and `notification` consumers plus intent/connection flow lifecycle logs. Added regression tests for thread-fallback behavior in intent pipeline + moderation paths.
- 2026-03-20: Advanced observability milestone `22.2 Metrics` by adding a runtime metrics registry (`http`, `websocket`, `queue`, `openai`, `push`) with instrumentation from request middleware, realtime gateway, queue processing/failure paths, notifications dispatch/open events, and OpenAI call sites (intent parsing + embeddings). Added admin metrics endpoint `GET /api/admin/ops/metrics` to expose API latency, websocket counts, queue lag/failure rates, DB ping latency, OpenAI latency/cost rollups, moderation rates, and push delivery/open rates. Added tests for metrics aggregation and endpoint behavior.
- 2026-03-20: Completed observability tracing + alerting baselines by wiring OpenTelemetry SDK bootstrap in API (`OTLP` exporter), adding span propagation across HTTP and all worker consumers, and attaching OpenAI metadata with app-trace + active OTel span linkage (`appTraceId`, `otelTraceId`, `otelSpanId`). Added runtime websocket error metrics and admin alert evaluation endpoint `GET /api/admin/ops/alerts` covering queue stalled/backlog, websocket spikes, DB latency saturation, OpenAI error spikes, and moderation backlog.
- 2026-03-20: Advanced security milestone `23.1` by shipping request-level rate limiting and abuse throttling middleware, stricter admin access middleware (API key, allowlist, optional role bindings), hardened profile upload completion with signed upload tokens + expiry/mismatch checks, and prompt-injection guardrails in `@opensocial/openai` (safe fallback + failure capture). Added middleware/profile/OpenAI/admin alert test coverage and introduced dependency-currency tracking in `PROGRESS.md`.
- 2026-03-20: Completed remaining `23.1` security hardening controls by adding runtime security posture evaluation/enforcement (`SECURITY_STRICT_MODE`), transport-security middleware (secure headers + HTTPS enforcement option), admin security posture visibility endpoint (`GET /api/admin/security/posture`), and JWT access/refresh secret-chain rotation support (`JWT_ACCESS_SECRETS`, `JWT_REFRESH_SECRETS`) with expanded coverage tests.
- 2026-03-20: Added threat-model implementation mapping doc (`docs/security-threat-model-implementation.md`) to make shipped controls and remaining security gaps explicit and actionable for staging/prod hardening.
- 2026-03-20: Added dependency-currency scripts in root (`deps:outdated`, `deps:outdated:latest`, `deps:update:latest`) and ran workspace outdated scan to baseline remaining major upgrades (`openai@6`, `prisma@7`, `zod@4`, `next@16`, `tailwind@4`, `eslint@10`). Kept `23.1` dependency-currency item in progress due required migration work.
- 2026-03-20: Completed backend dependency-currency major migration to latest stable versions (`prisma@7.5.0`, `@prisma/client@7.5.0`, `zod@4.3.6`, `openai@6.32.0`, `vitest@4.1.0`, `class-validator@0.15.1`, `ioredis@5.10.1`). Upgraded Prisma v7 runtime config (`prisma.config.ts`, datasource URL moved from schema), regenerated client, and re-verified backend/workspace quality gates (`format:check`, `lint`, `typecheck`, `test`, `db:drift-check`).
- 2026-03-20: Completed Prisma v7 runtime compatibility follow-up by moving API and seed client initialization to the PostgreSQL driver adapter (`@prisma/adapter-pg` + `pg`) and updating all `apps/api` Prisma CLI scripts to use `--config ../../prisma.config.ts` with explicit `DATABASE_URL` defaults. This removes broken datasource assumptions from the legacy Prisma client constructor path and aligns runtime + migration scripts with Prisma 7 requirements.
- 2026-03-20: Completed backend `23.2 Privacy` controls by adding a dedicated privacy module with APIs for retention policy disclosure (`GET /api/privacy/policy`), user data export (`GET /api/privacy/:userId/export`), bulk sent-message deletion (`POST /api/privacy/:userId/messages/delete`), personalization memory reset (`POST /api/privacy/:userId/memory/reset`), and account deletion/anonymization (`POST /api/privacy/:userId/account/delete`). Expanded log redaction to include PII keys and in-string email/phone token masking, and added privacy service coverage tests.
- 2026-03-20: Completed backend `23.3 Legal/compliance` scaffolding by adding a compliance module with policy input endpoint (`GET /api/compliance/policy`), terms/privacy acceptance recording (`POST /api/compliance/:userId/acceptance`), birth-date capture (`POST /api/compliance/:userId/birth-date`), and eligibility evaluation (`GET /api/compliance/:userId/eligibility`) covering terms acceptance, privacy acceptance, minimum-age checks, and region allow/deny policy. Added compliance env inputs and launch checklist documentation in `docs/compliance-policy.md` with service coverage tests.
- 2026-03-20: Completed backend rollout controls for `25.1` and `25.3` by extending launch-controls with persistent/runtime feature flags (`agent_followups`, `group_formation`, `personalization`, `discovery`, `moderation_strictness`) plus alpha cohort/invite-only and kill switches (`new_intents`, `group_formation`, `push_notifications`, `ai_parsing`, `realtime_chat`). Wired controls into intent creation/follow-up scheduling, discovery APIs, personalization APIs, chat/intents moderation strictness behavior, notification push routing, and realtime gateway enforcement using launch-controls snapshot state (not env-only), with added coverage in `launch-controls`, `intents`, `chats`, and realtime contract tests.
- 2026-03-20: Completed `24.1 Unit tests` coverage set with explicit suites validating policy engine behavior (`personalization.service.spec.ts`), ranking functions (`matching.service.spec.ts`), parser fallback logic (`openai-client.spec.ts`), DTO/request validators (`contracts-and-realtime.spec.ts`), and websocket guard/handshake/payload validation paths (`contracts-and-realtime.spec.ts`, `admin-security.middleware.spec.ts`).
- 2026-03-20: Completed `24.2 Integration tests` flow matrix with backend suite coverage across auth (`auth.service.spec.ts`), intent creation and routing (`intents.service.spec.ts`), matching (`matching.service.spec.ts`), request acceptance and connection setup (`connection-setup.service.spec.ts`, `inbox.service.spec.ts`), 1:1/group connection behavior (`connection-setup.service.spec.ts`, `chats.service.spec.ts`), moderation (`moderation.service.spec.ts`), and admin actions (`admin.controller.spec.ts`).
- 2026-03-20: Advanced mobile realtime UX in `apps/mobile` (frontend-only scope) by adding a Socket.IO client layer (`src/lib/realtime.ts`) and wiring chats to live room subscriptions with polling fallback preserved. Mobile chat now surfaces realtime connection state, cross-device live message fanout via `chat.message.created`, replay ingestion support (`chat.replay`), and typing indicators (`chat.typing`) with automatic stale-typing cleanup.
- 2026-03-20: Started mobile E2E automation lane for milestone `24.3` by adding Maestro critical-path coverage scaffolding in `apps/mobile/.maestro/mobile-critical-path.yaml`, wiring stable `testID` selectors across auth/onboarding/home/chat surfaces, and adding an env-gated auth bypass (`EXPO_PUBLIC_ENABLE_E2E_AUTH_BYPASS=1`) for deterministic non-Google interactive test runs in simulator environments.
- 2026-03-20: Hardened core mobile message composer UX in `apps/mobile/src/screens/HomeScreen.tsx` for both agent intents and human chat by adding send-in-flight guards, empty-input submit prevention, keyboard-safe layout (`KeyboardAvoidingView`), and bounded multiline input with live character counters. This upgrades chat/input behavior from demo-level to production-safe interaction patterns while preserving existing API integrations.
- 2026-03-20: Standardized mobile UI on a shadcn-style reusable component foundation (`ui/button`, `ui/card`, `ui/chip`, `ui/alert`) powered by `class-variance-authority` + `clsx` + `tailwind-merge`, then migrated app-facing primitives (`PrimaryButton`, `SurfaceCard`, `ChoiceChip`, `InlineNotice`, `ChatBubble`) to those shared variants for uniform design behavior across auth/onboarding/home flows.
- 2026-03-20: Shipped ChatGPT-class mobile UI baseline in `apps/mobile`: semantic canvas/surface tokens, `AppTopBar` + pill `ComposerInput` + `HomeTabBar`, refined bubbles and primitives, then advanced parity with Ionicons tab bar, `MessageComposer` circular send, keyboard-dismiss tweaks, `AgentSuggestionChips` for empty agent threads, and reduce-motion-safe `AnimatedScreen`. Tracked scope and backlog under `PROGRESS.md` §20.4.
- 2026-03-20: Closed the §20.4.3 ChatGPT-parity backlog in `apps/mobile`: inverted `FlashList` transcripts (`ChatTranscriptList`), `AppDrawer` + compact agent top bar + hamburger, Stop/Regenerate with abortable `createIntent`, `expo-speech-recognition` voice mic on composers, `expo-haptics` with reduce-motion guard, agent markdown rendering, `app.json` mic/speech strings, and Maestro drawer assertions.
- 2026-03-20: Completed mobile E2E critical-path lane (`24.3`) with a deterministic simulator pass by adding a frontend-only local E2E mode (`EXPO_PUBLIC_ENABLE_E2E_LOCAL_MODE=1`) in auth/chat flows, hardening Maestro selectors for dynamic chat threads, and validating end-to-end steps: auth bypass -> home -> intent submit -> chat create -> message send assertion.
- 2026-03-20: Advanced mobile dependency-currency lane by upgrading Expo SDK to latest stable (`expo@55.0.8`) and refreshing mobile runtime libs to newest verified versions in-app (`react@19.2.4`, `react-native-reanimated@4.2.2`, `react-native-safe-area-context@5.7.0`), while removing deprecated `@types/react-native`. `@react-native-async-storage/async-storage` was intentionally pinned to `2.2.0` after runtime validation because `3.0.1` failed in Expo Go (`Native module is null`). Remaining mobile upgrade blockers are framework-coupled: `react-native@0.84.1` (latest) is not yet aligned with Expo 55 managed baseline, and `tailwindcss@4` is blocked by `react-native-css-interop` peer requirement (`tailwindcss ~3`).
- 2026-03-19: Performed a mobile build audit and fixed production bundling blockers in `apps/mobile`: added NativeWind preset to Tailwind config, corrected Babel config (`nativewind/babel` as preset + reanimated plugin), added missing `react-native-css-interop` dependency, switched Expo entrypoint to local `index.js` root registration for pnpm compatibility, and replaced placeholder mobile build script with real iOS/Android export commands (`pnpm --filter @opensocial/mobile build`).
- 2026-03-19: Advanced milestone `22.1 Logs` with backend observability foundations: added HTTP request correlation middleware (`x-trace-id` propagation/generation), request-scoped trace context, automatic trace attachment in API envelopes, structured JSON request logs, structured queue job processing logs with extracted `traceId`, and shared user-safe log redaction utility for sensitive keys (authorization/cookie/token/secret/password/api-key/session/code). Added observability helper tests.
- 2026-03-19: Completed remaining backend telemetry in milestone `21.1` by instrumenting auth/login flows (`oauth_connected`, `signup_completed`), onboarding completion transitions (`profile_completed` on profile/interest updates when state reaches `complete`), and personalization updates (`personalization_change` for global-rules/life-graph updates). Added analytics-aware DI wiring to `AuthModule`, `ProfilesModule`, and `PersonalizationModule`, plus service tests to verify event emission.
- 2026-03-19: Completed backend analytics milestone `21.2` and `21.3`, and advanced `21.1` with centralized server-side telemetry hooks. Added `analytics` module endpoints for event ingest/list (`POST|GET /api/analytics/events`), core KPI snapshots (`GET /api/analytics/metrics/core`), experiment guardrails (`GET /api/analytics/experiments/guardrails`), and deterministic per-user assignments (`GET /api/analytics/experiments/users/:userId/assignments`) persisted in `user_preferences`. Instrumented backend flows to emit `intent_created`, `request_sent`, `request_accepted`, `request_rejected`, `connection_created`, `chat_started`, `first_message_sent`, `message_replied`, `report_submitted`, `user_blocked`, and `notification_opened` events.
- 2026-03-19: Upgraded mobile auth flow in `apps/mobile` from manual code entry to full in-app Google OAuth launch + deep-link callback handling. Added backend callback relay support (`GET /api/auth/google/callback`) with optional mobile redirect state from `GET /api/auth/google`, and kept `POST /api/auth/google/callback` token exchange path; mobile UI is now Google-only (manual/demo fallback removed).
- 2026-03-19: Extended mobile analytics coverage for milestone `21` in `apps/mobile` by wiring outbound request-fanout telemetry (`request_sent`) via pending-intent summary polling after intent creation, adding in-app moderation actions with live API calls (`POST /api/moderation/reports`, `POST /api/moderation/blocks`) plus `report_submitted`/`user_blocked` events, and expanding local KPI derivation with group-formation completion, notification-to-open, and moderation incident rates. Also added group chat sandbox creation mode (DM/group) to exercise group telemetry paths.
- 2026-03-19: Completed backend discovery milestone `19` (API scope) by introducing a new `discovery` module with passive suggestions and ranked recommendation surfaces. Added endpoints for tonight discovery (`GET /api/discovery/:userId/tonight`), full passive discovery bundle (`GET /api/discovery/:userId/passive`), inbox suggestions (`GET /api/discovery/:userId/inbox-suggestions`), and lightweight agent-thread recommendation delivery (`POST /api/discovery/:userId/agent-recommendations`). Ranking blends semantic fit, life-graph affinity, policy/trust safety, and recency components.
- 2026-03-19: Advanced mobile discovery coverage for milestone `19` by adding a new `Discover` tab in `apps/mobile` wired to live discovery APIs (`/api/discovery/:userId/passive`, `/api/discovery/:userId/inbox-suggestions`, `/api/discovery/:userId/agent-recommendations`). The mobile client now renders tonight suggestions, active intent/user cards, group ideas, reconnect candidates, and inbox suggestion cards with manual refresh + "Send To Agent" action.
- 2026-03-19: Advanced analytics milestone `21.1` (mobile scope) by adding a durable client telemetry layer in `apps/mobile` (`src/lib/telemetry.ts`) with event capture for auth/onboarding/intent/inbox/chat/personalization flows, plus local KPI derivation (intent-to-accept, intent-to-first-message, connection success/repeat rates). Wired telemetry instrumentation into `App.tsx` and `HomeScreen.tsx`, and surfaced a local telemetry summary card in Profile.
- 2026-03-19: Completed backend admin-view coverage for milestone `18.2` by adding RBAC/audited list APIs for core operational entities: users (`GET /api/admin/users`), intents (`GET /api/admin/intents`), requests (`GET /api/admin/requests`), connections (`GET /api/admin/connections`), chats (`GET /api/admin/chats`), and reports (`GET /api/admin/reports`). This closes API-side support visibility without direct DB access.
- 2026-03-19: Completed remaining backend safety/tooling items for milestones `17.4` and `18.4` by enforcing sender-side verified-only matching, modality safety filtering (including offline-only restriction handling), and offline safety gates (minimum account-age threshold + same-country + non-private visibility checks for offline intents) in `MatchingService`. Added admin queue-monitor tooling endpoint `GET /api/admin/jobs/queues` (BullMQ equivalent to bull-board view) with per-queue job counts/paused state under existing RBAC+audit controls.
- 2026-03-19: Extended mobile chat reliability in `apps/mobile` by adding persistent thread storage (`AsyncStorage`) for messages/high-watermark/unread metadata, reconnect-safe incremental sync (`GET /api/chats/:chatId/sync`) with metadata refresh (`GET /api/chats/:chatId/metadata`), manual in-app chat sync controls, unread/status indicators, and idempotent message send support via optional `clientMessageId`.
- 2026-03-19: Updated `apps/api` matching test coverage to align offline reranking expectations with offline safety constraints (same-country requirement) while still validating proximity score ordering.
- 2026-03-19: Completed admin app coverage for additional milestone `18` surfaces by wiring required RBAC headers (`x-admin-user-id`, `x-admin-role`) from the UI and adding controls for newly shipped admin APIs: moderation queue (`GET /api/admin/moderation/queue`), audit logs (`GET /api/admin/audit-logs`), account deactivation (`POST /api/admin/users/:userId/deactivate`), and account restriction (`POST /api/admin/users/:userId/restrict`).
- 2026-03-19: Completed remaining backend superpowers in `18.3` by adding admin APIs for intent workflow replay (`POST /api/admin/intents/:intentId/replay`), routing explanation inspection (`GET /api/admin/intents/:intentId/routing-explanations`), personalization rules inspection (`GET /api/admin/users/:userId/personalization/rules`), notification resend (`POST /api/admin/users/:userId/notifications/resend`), and chat-flow repair (`POST /api/admin/chats/:chatId/repair` with optional sync preview + outbox relay trigger + repair marker system message).
- 2026-03-19: Extended admin tooling milestone `18.4` in `apps/admin` with an internal query helper (`method + path + JSON query/body`) and execution history, plus live agent-thread SSE trace streaming (`/api/agent/threads/:threadId/stream`) for real-time debug visibility. Added a chat-flow repair action that combines metadata refresh, reconnect-sync snapshot, and outbox relay trigger in one admin operation.
- 2026-03-19: Completed realtime scaling milestone `16.2` (backend scope) by adding a Socket.IO Redis adapter (`@socket.io/redis-adapter`) with env-gated activation (`SOCKET_IO_REDIS_ADAPTER_ENABLED`) and fallback to in-memory adapter on failure. API bootstrap now uses a custom realtime adapter with connection-state recovery defaults and sticky-session-friendly cookie settings (`SOCKET_IO_STICKY_SESSIONS_ENABLED`, `SOCKET_IO_STICKY_COOKIE_NAME`) to support multi-node event propagation and deployment affinity.
- 2026-03-19: Completed moderation milestones `17.2 Strikes / enforcement model` and `17.3 Profile moderation` (backend scope) by adding strike persistence in `user_preferences` (`moderation.strikes.v1`), automatic enforcement escalation (`warn`/`flag`/`restrict`/`suspend`) with profile/user state updates, and new moderation APIs (`POST /api/moderation/strikes`, `GET /api/moderation/users/:userId/enforcement`). Also added profile text moderation gates across profile fields/interests/topics with moderation-flag + notice behavior, and impersonation-report escalation that marks target profiles for review.
- 2026-03-19: Completed admin RBAC/audit backend milestones `18.1`, additional `18.2` views, and part of `18.3` superpowers by enforcing role-based headers on admin APIs (`x-admin-role`: admin/support/moderator), adding role-specific authorization (for example moderators denied replay/outbox), and writing every admin action to `admin_actions` + mirrored `audit_logs`. Added admin endpoints for moderation queue (`GET /api/admin/moderation/queue`), audit log stream (`GET /api/admin/audit-logs`), account deactivation (`POST /api/admin/users/:userId/deactivate`), and account restriction/shadow-ban mode (`POST /api/admin/users/:userId/restrict`).
- 2026-03-19: Expanded admin milestone `18 Admin Dashboard and Debugging Tools` with a multi-tab Tailwind operations workbench in `apps/admin` (overview/users/intents/chats/moderation/personalization/agent). Added live app-surface actions on existing APIs: force-cancel/retry/widen/convert intents, chat metadata/sync/leave/hide operations, report/block controls, life-graph and policy explain inspection, agent thread trace inspection/message injection, user session revoke/revoke-all tooling, and pending-intent summarization.
- 2026-03-19: Completed moderation milestone `17.1` and most of `17.2` (backend scope) by adding deterministic intent moderation gates before fanout (`blocked` -> cancel + safety notice, `review` -> manual review hold) with moderation-flag/audit persistence, chat pre-send moderation decisions that block harmful content or auto-hide review-grade messages (`[hidden by moderation]`), and entity-scoped post-send reporting escalation that opens moderation flags (`report:*`) with moderation audit trail records.
- 2026-03-19: Completed chat/realtime milestones `15.2`, `15.3`, `15.4`, `16.1`, and `16.3` (backend scope) by adding group-chat membership lifecycle support (`GET /api/chats/:chatId/metadata`, `POST /api/chats/:chatId/leave`), system/join/leave/archive notices, moderation hide endpoint (`POST /api/chats/:chatId/messages/:messageId/hide`), reconnect sync API (`GET /api/chats/:chatId/sync`) with unread counts and dedupe-safe ordering, and gateway reconnect semantics (`connection.authenticate` + `connection.recovered` + `chat.replay`) with `chat.send` server message IDs, per-room sequencing, and duplicate client-message suppression.
- 2026-03-19: Advanced admin milestone `18 Admin Dashboard and Debugging Tools` to in-progress by replacing the admin shell with a responsive Tailwind control console wired to existing backend APIs. New admin surface includes: health polling, dead-letter listing/replay, outbox relay trigger, user/profile/trust/rules inspection, intent explanation inspection, inbox request visibility, chat message inspection, and digest trigger action for selected user IDs.
- 2026-03-19: Completed client-web milestone `20.2 Web app` by replacing the `apps/web` placeholder with a responsive Next.js + Tailwind user client (desktop/mobile adaptive layout) that provides explicit reduced-surface parity for core product flows: auth callback sign-in + persisted session restore, onboarding profile/rules capture, agent intent submission, inbox polling with accept/reject, chat sandbox creation/message persistence, and profile notification/social-mode settings. Added reusable web UI primitives (`SurfaceCard`, `ChatBubble`, `EmptyState`, `InlineNotice`) and environment override support via `NEXT_PUBLIC_API_BASE_URL`.
- 2026-03-19: Completed mobile-client milestone `20.1 Mobile app` and design-system milestone `20.3` for client primitives by wiring the Expo app to live API flows (Google callback auth + persisted session restore, profile onboarding writes, intent submission, inbox accept/reject polling, chat sandbox creation/messages, and profile/rule saves). Added in-app notification scaffolding with Expo permissions/token registration + local notification triggers, and introduced reusable mobile UI primitives (`SurfaceCard`, `ChatBubble`, `EmptyState`, `LoadingState`, `InlineNotice`) backed by Tailwind/NativeWind styles.
- 2026-03-19: Advanced client-app milestone `20.1 Mobile app` and `20.3 Design system` to in-progress by replacing the Expo shell with a Tailwind/NativeWind-based app foundation (`Auth -> Onboarding -> Home tabs`) including animated screen transitions, inbox/chats/profile surfaces, and rule-aware profile settings scaffolding. Added NativeWind/Tailwind config (`babel`, `metro`, `tailwind.config.js`, global CSS), typed mobile UI components, and updated mobile lint scope to include the new source tree.
- 2026-03-19: Completed chat milestone `15.1 Soft-delete behavior` and `15.1 Block-aware sending restrictions` by extending `ChatsService` with sender-side soft-delete (`POST /api/chats/:chatId/messages/:messageId/soft-delete`, body masked to `[deleted]`) and pre-send block checks across active chat participants. Message creation is now rejected when block relationships exist between sender and any active participant in the chat’s originating connection.
- 2026-03-19: Completed inbox milestone `14.3 UX/API requirements` by enriching pending-request responses with request-card metadata (`cardSummary.who`, `cardSummary.what`, `cardSummary.when`) and internal match hints (`internal.whyMe`) derived from intent-candidate rationale. Inbox listing now supports richer request cards while preserving existing request state fields.
- 2026-03-19: Completed inbox milestone `14.1 Bulk decline / snooze behavior` by adding `POST /api/inbox/requests/bulk` with `decline` and `snooze` actions. Bulk decline now rejects pending requests in batch, records rejection behavior signals, and notifies senders; snooze writes structured `request_responses` actions (`snooze:<minutes>`) and pending-list retrieval now hides actively snoozed requests until their snooze window expires.
- 2026-03-19: Completed notification milestone `13.2 Email digest (optional phased)` by wiring digest-channel notifications into the `notification` queue with `NotificationDispatch` jobs (idempotency keys + retries). Added worker handling that records `notification.email_digest_dispatched` audit events for digest deliveries, enabling a durable email-dispatch handoff path while keeping in-app fallback intact.
- 2026-03-19: Completed routing milestone `11.4 Optional user-facing explanation later` by adding `GET /api/intents/:intentId/explanations/user`, which transforms stored candidate rationale into concise user-facing explanation text (for example timing fit, shared topics, style/vibe compatibility) without exposing sensitive internal scoring details.
- 2026-03-19: Completed notification milestone `13.2 Push notifications` by adding backend push-channel routing in `NotificationsService`. Urgent and immediate-mode notifications now route to `channel: push` when the user has an active non-revoked session with a device ID, while preserving fallback to in-app/digest channels when push reachability is unavailable.
- 2026-03-19: Completed reliability milestones `12.3 Dead-letter handling`, `12.3 Manual replay tooling`, `12.3 Stalled job recovery`, and `12.3 Outbox relay integration` by introducing `DeadLetterService` + `OutboxRelayService` in backend jobs infrastructure. Worker processors now emit terminal-failure dead-letter audit records (`queue.job_dead_lettered`) and stalled-job recovery visibility records (`queue.job_stalled`, BullMQ auto-requeue path). Added admin backend endpoints for dead-letter inspection/replay and on-demand outbox relay (`GET /api/admin/jobs/dead-letters`, `POST /api/admin/jobs/dead-letters/:deadLetterId/replay`, `POST /api/admin/outbox/relay`) and an `admin-maintenance` consumer path (`RelayOutboxEvents`) for relay execution.
- 2026-03-19: Completed reliability milestone `12.3 Exponential backoff` by standardizing exponential retry policy across all active BullMQ producers in backend flows (`intent-processing`, `connection-setup`, `media-processing`, `notification`). Manual intent retries now also include exponential backoff (`delay: 1000`) to align with existing queued workflow retry behavior.
- 2026-03-19: Completed reliability milestone `12.3 Idempotency keys on jobs` by standardizing explicit `idempotencyKey` usage across active backend queue producers. Queue envelope schema now requires `idempotencyKey`; job producers for intent-processing retries/followups, request-accept connection setup, and media processing now set deterministic keys and align `jobId` to those keys for dedupe-safe enqueue behavior. Added consumer-side schema validation for `RequestAccepted` and expanded service tests to verify idempotency key propagation.
- 2026-03-19: Completed routing milestone `11.4 Store why a candidate was selected` and `11.4 Expose safe explanation to admin/debug tools` by enriching persisted `intent_candidates.rationale` with selection metadata (`finalScore`, top `selectedBecause` feature keys, `selectionRecordedAt`, routing escalation level) and adding `GET /api/intents/:intentId/explanations` for safe debug output (ranked candidates + sanitized rationale fields with trust banding and no raw sensitive trust score exposure).
- 2026-03-19: Completed routing milestone `11.3 Escalate/widen filters after timeout` by adding staged timeout escalation in `IntentsService` (level thresholds at 8 and 16 minutes). No-candidate passes now auto-widen parsed intent constraints (`modality -> either`, urgency/timing/skill/vibe relaxation, then topic/activity broadening at higher level), persist escalation audit logs (`routing.filters_widened`), and enqueue immediate retry jobs (`intent-created:<intentId>:timeout_escalated`) with user/thread progress updates.
- 2026-03-19: Completed routing milestone `11.3 Retry delayed candidates` by adding delayed retry scheduling in `IntentsService`. Intent pipeline now re-enqueues `IntentCreated` retries with deduped job IDs for `fanout_followup`, `cap_reached`, and `no_candidates` outcomes, enabling automatic second-wave candidate retrieval without manual user intervention.
- 2026-03-19: Completed routing milestone `11.3 Persist routing attempt history` by adding durable routing-attempt logging in `IntentsService` (`audit_logs`, action `routing.attempt`). Each pipeline pass now stores attempt index, candidate/fanout counts, cap/quota context, selected candidate IDs, and normalized outcome (`fanout_sent`, `cap_reached`, `no_candidates`) for replay/debug and orchestration introspection.
- 2026-03-19: Completed group milestone `11.2 Group conversion rules from active 1:1 intent` by adding automatic conversion from `chat` intents to group flow when multiple recipients accept. `ConnectionSetupService` now detects multi-acceptance on non-group intents, upgrades existing intent-bound DM connections to group connections, computes converted target size (`3..4`), and continues group readiness/backfill logic under the converted group path.
- 2026-03-19: Completed group milestone `11.2 Stop inviting once capacity reached` by adding projected-capacity guards to group backfill logic. Backfill now accounts for current participants plus pending invites and will not create additional request waves when projected occupancy already meets the group cap (`min(4, targetSize)`), preventing over-inviting and keeping invite pressure bounded.
- 2026-03-19: Completed group milestone `11.2 Backfill if someone drops before start` by adding automatic backfill wave generation for partial groups. When participant count is below current readiness threshold, `ConnectionSetupService` now selects the next best uncontacted `intent_candidates`, creates new `intent_requests` in the next wave, notifies those recipients, and posts sender-thread progress updates about backfill invites.
- 2026-03-19: Completed group milestone `11.2 Threshold logic for group creation` by adding quorum/fallback readiness logic in `ConnectionSetupService`: groups open when either full target is met or fallback threshold (`max(2, targetSize-1)`) is met after a wait window (10 minutes since intent creation). Added fallback-aware sender/participant notifications and sender-thread messaging, while preserving `partial` status before threshold is reached.
- 2026-03-19: Completed matching milestone `11.1 Fanout cap logic` by replacing fixed fanout (`top 3`) with dynamic cap computation per intent based on intent mode (`chat` vs `group` + `groupSizeTarget`) and sender outreach quotas (pending outgoing cap + 24h outgoing cap). Added cap-aware pipeline behavior: when candidates exist but cap is exhausted, intent stays in `matching`, user/thread receive progress updates, and delayed follow-up is scheduled for retry conditions.
- 2026-03-19: Completed reranking milestone `10.3` by expanding matching score composition with explicit feature components: availability fit (mode + availability-window overlap + timing signal), trust/reputation (trust score minus moderation/report penalties), recent-interaction suppression, offline proximity scoring, style/vibe compatibility from skill/vibe constraints, and personalization boosts from life-graph preferences (`likes`/`avoids`/`high_success_with`). Candidate rationale now records these feature scores for explainability and debug.
- 2026-03-19: Completed retrieval milestone `10.2` by replacing lexical-only matching with a semantic candidate pipeline backed by pgvector similarity between `intent_text` and `user_profile` embeddings. Added hard-constraint gating before and after semantic retrieval, lexical/topic fallback inclusion when semantic vectors are missing, and retrieval score snapshot logging to `audit_logs` (`matching.candidates_retrieved`) with top-candidate rationale metadata for trace/debug.
- 2026-03-19: Completed embedding milestone `10.1` by implementing deterministic/OpenAI-backed embedding generation and storage into `embeddings` (pgvector) for user profile summaries, interest/topic labels, intents, and interaction summaries. Added embedding upsert hooks in profile updates, intent creation, and connection/interaction summary flow so vectors stay refreshed as user behavior changes.
- 2026-03-19: Completed personalization milestone `9.4 Policy engine` by exposing policy explainability output (`POST /api/personalization/:userId/policy/explain`) with ordered precedence checks (`safety_rules` -> `hard_user_rules` -> `product_policy` -> `intent_specific_overrides` -> `learned_preferences` -> `ranking_heuristics`), first-blocking-rule identification, and global-rule context for debug/admin surfaces.
- 2026-03-19: Completed personalization milestone `9.3 Retrieval / RAG` by adding retrieval-memory APIs (`POST /api/personalization/:userId/retrieval/profile-summary/refresh`, `POST /api/personalization/:userId/retrieval/preference-memory/refresh`, `POST /api/personalization/:userId/retrieval/interactions`, `POST /api/personalization/:userId/retrieval/query`) and service logic to persist profile summary docs, preference memory docs, and interaction summaries into `retrieval_documents` + `retrieval_chunks`. Added personalization-aware retrieval scoring (lexical overlap + freshness), max-age filtering, and unsafe-content/doc-type guards that exclude flagged summaries from retrieval results.
- 2026-03-19: Completed personalization milestone `9.2 Life graph` by adding life-graph APIs (`GET /api/personalization/:userId/life-graph`, `POST /api/personalization/:userId/life-graph/nodes`, `POST /api/personalization/:userId/life-graph/edges/explicit`, `POST /api/personalization/:userId/life-graph/signals`) with typed node/edge validation for activity/topic/game/person/schedule_preference/location_cluster and likes/avoids/prefers/recently_engaged_with/high_success_with edges. Implemented explicit-vs-inferred separation via `explicit_preferences` + `inferred_preferences`, materialized aggregate weights into `life_graph_edges`, and feedback capture in `preference_feedback_events`. Wired behavior updates from intent creation, request outcomes, and connection success flows with added service coverage tests.
- 2026-03-19: Completed personalization milestone `9.1 Explicit user rules` by adding global-rules APIs (`GET|PUT /api/personalization/:userId/rules/global`) and persistence for contact eligibility, reachability, 1:1-vs-group, modality, language, verification requirement, notification mode, agent autonomy, and memory preferences. Matching now enforces candidate hard rules before ranking, and notification channel routing respects explicit global notification mode.
- 2026-03-19: Completed OpenAI evaluation milestone `7.4 Failure capture and replay` by adding a bounded failure store in `@opensocial/openai`, automatic failure capture on request/schema failures (with task/model/promptVersion/trace metadata), and replay helpers that re-run captured failures by task with replay counters.
- 2026-03-19: Completed OpenAI evaluation milestones `7.4 Golden intent parsing dataset` and `7.4 Regression tests for tool usage` by adding a shared golden fallback intent dataset in `@opensocial/openai` and extending OpenAI client tests to validate parser outputs across the dataset plus agent handoff/tool-policy behavior.
- 2026-03-19: Completed OpenAI evaluation milestone `7.4 Prompt versioning` by introducing a centralized prompt registry in `@opensocial/openai` with explicit per-task prompt versions and wiring OpenAI request metadata to include `promptVersion` for traceability.
- 2026-03-19: Completed OpenAI alignment milestone `7.3` by adding explicit manager/specialist agent policy definitions in `@opensocial/openai` (`manager`, `intent_parser`, `ranking_explanation`, `personalization_interpreter`, `notification_copy`, `moderation_assistant`), plus enforceable handoff/tool policy helpers, human-approval gating rules for risky actions, and background-run policy helpers with coverage tests.
- 2026-03-19: Completed auth milestone `4.1 Implement Google OAuth login` by replacing deterministic-only callback behavior with real Google authorization-code exchange (`oauth2.googleapis.com/token`) plus OpenID userinfo resolution (`openidconnect.googleapis.com/v1/userinfo`), while keeping a deterministic fallback path when Google credentials are unset for local/testing. Added auth service test coverage for both real exchange and fallback modes.
- 2026-03-19: Completed notification milestone `13.1 Digest` by adding digest summary generation in `NotificationsService` (`active intents`, `pending requests`, `unread updates`) and exposing `POST /api/notifications/:userId/digest` to create an immediate `digest` notification, with service test coverage.
- 2026-03-19: Completed notification milestone `13.1 Reminder` by extending `AsyncAgentFollowup` payloads with typed `notificationType` and emitting pending-intent follow-ups as `reminder` notifications (while preserving `agent_update` for progress/no-match updates), with queue contract + intents tests updated.
- 2026-03-19: Completed notification milestone `13.1 Moderation/safety notice` for media by wiring profile-photo moderation outcomes (`pending_review`, `rejected`) to emit `moderation_notice` in-app notifications, and updated profile service tests to assert safety notice delivery.
- 2026-03-19: Completed notification milestone `13.1 Group formed` by extending group-connection finalization to notify all participants (not only the sender) with `group_formed` in-app messages once target size is reached, with added connection-setup service tests for the connected-group path.
- 2026-03-19: Completed milestones `6.3`, `8.3`, `12.2` (`AsyncAgentFollowup` flow), and `13.3` by adding delayed async follow-up orchestration on the `notification` queue, natural-language follow-up delivery in both agent thread + in-app notifications, intent management APIs for pending-state summary/cancel/convert mode, and corresponding queue + service + controller test coverage.
- 2026-03-19: Completed milestone `8.2` field extraction by extending structured intent parsing to capture modality (`online`/`offline`), group size target, timing constraints, and skill/vibe constraints with deterministic fallback heuristics and parser tests.
- 2026-03-19: Completed OpenAI integration milestones `7.1` and `7.2` by adding task-based model routing (`intent_parsing`, `suggestion_generation`, `ranking_explanation`, etc.), standardized trace/correlation metadata builders, and typed suggestion + ranking explanation schemas/methods in `@opensocial/openai` with deterministic fallback behavior and test coverage.
- 2026-03-19: Completed agent thread-model milestone `6.1` by formalizing persisted agent message roles (`user`, `agent`, `system`, `workflow`) and wiring intent/matching plus connection follow-up updates through role-specific writes so thread history clearly distinguishes direct user turns, agent responses, and async workflow progress events.
- 2026-03-19: Completed trust profile milestone `5.3` by adding `GET /api/profiles/:userId/trust` with computed verification badges (`trusted`, `verified_identity`, `unverified`), reputation score derivation from trust score + report/block penalties, and safety/account-freshness labels driven by moderation state, report volume, and account age.
- 2026-03-19: Completed profile photos milestone `5.2` by adding direct upload intent + completion APIs, image validation constraints (mime/size), queue-backed media processing (`ProfilePhotoUploaded` on `media-processing`), moderation decisions + moderation flags for risky images, CDN/thumbnail URL derivation for approved photos, and deterministic SVG avatar fallback generation when no approved photo exists.
- 2026-03-19: Completed auth hardening milestone `4.3` by adding auth lifecycle audit logs (`audit_logs`) for Google login/session issue/refresh/revoke paths, implementing suspicious-login hooks via `outbox_events` (`auth.suspicious_login_detected`), adding bulk session revocation support, and revoking compromised sessions on refresh-token mismatch. CSRF remains explicitly not required in current API mode because auth tokens are returned in JSON and not cookie-bound.
- 2026-03-19: Completed milestone `0.1 Configure shared linting and formatting` by replacing placeholder lint scripts with real ESLint runs across apps/packages, adding a shared flat ESLint config (`@eslint/js` + `typescript-eslint`), and normalizing source formatting with Prettier.
- 2026-03-19: Completed migration foundation updates for `1.1 Add migration and seeding scripts` and `3.1 Add migration pipeline` by adding `prisma/migrations/20260319_init/migration.sql`, committing `migration_lock.toml`, and introducing deterministic migrate/status/validation scripts at root and API package levels.
- 2026-03-19: Completed milestones `2.1 Define websocket event payload types` and `2.2 Add zod or valibot schemas for all externally visible payloads` by centralizing HTTP/WebSocket contract schemas in `@opensocial/types`, wiring all API controllers through shared runtime validation with consistent 400 responses, and enforcing typed socket payload validation in `RealtimeGateway` with new contract coverage tests.
- 2026-03-19: Completed milestone `3.1 Add DB lint / drift checks in CI` by adding `pnpm db:drift-check` to `.github/workflows/ci.yml` so schema validation runs on every push/PR.
- 2026-03-19: Completed milestones `3.2`, `3.3`, and `3.4` database gaps by adding new Prisma models/migration tables for `user_topics`, `user_availability_windows`, `inferred_preferences`, `explicit_preferences`, `preference_feedback_events`, archive tables for chat/audit retention, and new ANN + partial hot-path indexes (HNSW with IVFFlat fallback). Added migration contract tests and retention strategy documentation.
- 2026-03-19: Completed infrastructure/deployment milestones `1.2` and `1.3` by defining staging/production topology and durability policies in `docs/infrastructure-topology.md`, adding staging/production deploy workflows, embedding `pnpm db:migrate` in deploy scripts, and adding an explicit rollback workflow/script path.
- 2026-03-19: Completed auth/onboarding milestones for `4.1` and `4.2` by adding persisted `user_sessions` with refresh-token rotation, session listing/revocation endpoints, deterministic bootstrap creation of user/profile/agent-thread on Google callback, onboarding state transitions tied to profile completion, and username + visibility support.
- 2026-03-19: Completed milestone `5.1 Profiles` by extending profile APIs to manage interests/topics, availability windows, social mode settings, and intent-type preference overrides with shared schema validation and service-level tests.
- 2026-03-19: Completed agent intent ingestion milestones `6.2` and `8.1` by adding SSE thread streaming, evented agent message delivery, and a `POST /api/intents/from-agent` path that stores agent-thread user messages, creates intents, and posts a natural acknowledgement update in-thread.

---

## 0. Repo and Governance

### 0.1 Monorepo setup
- [x] Create monorepo structure
  - apps/api
  - apps/web
  - apps/admin
  - packages/ui
  - packages/types
  - packages/config
  - packages/eslint-config
  - packages/tsconfig
  - packages/openai
  - packages/testing
  - docs
- [x] Configure pnpm workspaces
- [x] Configure Turborepo or Nx
- [x] Configure shared TypeScript project references
- [x] Configure shared linting and formatting
- [x] Configure commit hooks (lint-staged, husky)
- [x] Configure CI baseline

**Acceptance criteria**
- `pnpm install` works from root
- `pnpm lint`, `pnpm typecheck`, `pnpm test` work from root
- Shared imports resolve cleanly across apps/packages

### 0.2 Engineering standards
- [x] Add root README with repo commands
- [x] Add CODEOWNERS
- [x] Add branch strategy / release notes process
- [x] Add environment variable policy
- [x] Add error handling conventions
- [x] Add logging conventions
- [x] Add naming conventions for jobs/events/tools

**Acceptance criteria**
- New agents can start work without guessing repo structure or command conventions

---

## 1. Infrastructure and Environments

### 1.1 Local development stack
- [x] Create `docker-compose.yml` for:
  - PostgreSQL
  - Redis
  - MinIO or local S3-compatible storage
  - Mailhog or equivalent
- [x] Seed local development config
- [x] Add migration and seeding scripts
- [x] Add local OpenTelemetry collector optional setup

### 1.2 Cloud environments
- [x] Define staging environment topology
- [x] Define production environment topology
- [x] Define secrets management approach
- [x] Define object storage provider
- [x] Define CDN strategy for media
- [x] Define websocket ingress / sticky session strategy
- [x] Define database backup and restore policy
- [x] Define Redis persistence/failover strategy

### 1.3 Deployment
- [x] Create Dockerfiles for api/web/admin
- [x] Add CI build pipelines
- [x] Add staging deploy pipeline
- [x] Add production deploy pipeline
- [x] Add migration step to deployment flow
- [x] Add rollback strategy

**Acceptance criteria**
- Fresh environment can be provisioned and deployed end-to-end
- Staging deploy is repeatable and rollbackable

---

## 2. Shared Domain Types and Contracts

### 2.1 Shared packages
- [x] Create `packages/types`
- [x] Define core enums:
  - IntentType
  - IntentUrgency
  - RequestStatus
  - ConnectionType
  - ChatType
  - NotificationType
  - ModerationStatus
  - UserAvailabilityMode
- [x] Define shared DTOs and zod schemas
- [x] Define API response envelopes
- [x] Define websocket event payload types
- [x] Define BullMQ job payload types

### 2.2 Schema validation
- [x] Add zod or valibot schemas for all externally visible payloads
- [x] Add runtime validation for queue payloads
- [x] Add versioning field where needed for long-lived contracts

**Acceptance criteria**
- No cross-service payload is untyped or unvalidated

---

## 3. Database Foundation

### 3.1 ORM and migrations
- [x] Choose and configure ORM/query layer (Prisma, Drizzle, or TypeORM)
- [x] Add migration pipeline
- [x] Add seed pipeline
- [x] Add DB lint / drift checks in CI

### 3.2 Core schema
- [x] users
- [x] user_profiles
- [x] user_profile_images
- [x] user_interests
- [x] user_topics
- [x] user_preferences
- [x] user_rules
- [x] user_availability_windows
- [x] agent_threads
- [x] agent_messages
- [x] intents
- [x] intent_candidates
- [x] intent_requests
- [x] request_responses
- [x] connections
- [x] connection_participants
- [x] chats
- [x] chat_memberships
- [x] chat_messages
- [x] message_receipts
- [x] notifications
- [x] moderation_flags
- [x] user_reports
- [x] blocks
- [x] audit_logs
- [x] outbox_events
- [x] admin_actions

### 3.3 Personalization / life graph schema
- [x] life_graph_nodes
- [x] life_graph_edges
- [x] inferred_preferences
- [x] explicit_preferences
- [x] preference_feedback_events
- [x] retrieval_documents
- [x] retrieval_chunks
- [x] embeddings table(s)

### 3.4 Indexing and performance
- [x] Add transactional indexes for hot paths
- [x] Add pgvector extension
- [x] Add HNSW/IVFFlat indexes where appropriate
- [x] Add partial indexes for active intents and pending requests
- [x] Add retention/archive strategy for chat and logs

**Acceptance criteria**
- Schema covers all product surfaces
- All hot-path queries have explicit indexing strategy
- Migrations run cleanly from zero

---

## 4. Auth, Identity, and Sessions

### 4.1 Authentication
- [x] Implement Google OAuth login
- [x] Add email/password fallback decision doc or explicitly exclude
- [x] Add JWT/session strategy
- [x] Add refresh token flow
- [x] Add device/session management

### 4.2 Identity and onboarding
- [x] Create user bootstrap flow
- [x] Create onboarding status state machine
- [x] Add profile completion checks
- [x] Add username/handle strategy if needed
- [x] Add profile visibility settings

### 4.3 Security hardening
- [x] Add CSRF protection if cookie-based
- [x] Add session revocation
- [x] Add suspicious login detection hooks
- [x] Add audit log on auth events

**Acceptance criteria**
- User can sign in with Google, onboard, persist session, and sign out safely

---

## 5. Profile and Media System

### 5.1 Profiles
- [x] Profile CRUD API
- [x] Interests/topics management
- [x] Availability preferences editing
- [x] Social mode settings
- [x] Intent-type-specific preferences

### 5.2 Profile photos
- [x] Direct upload flow
- [x] Image validation
- [x] Resize/thumbnail pipeline
- [x] Moderation pipeline for images
- [x] CDN delivery URLs
- [x] Avatar fallback generation

### 5.3 Trust profile
- [x] Verification badges strategy
- [x] Reputation score display rules
- [x] Safety labels / account freshness rules

**Acceptance criteria**
- User can fully manage profile and photo without breaking moderation or media processing rules

---

## 6. Agent Chat Surface

### 6.1 Agent thread model
- [x] Create agent thread persistence
- [x] Create agent message persistence
- [x] Distinguish user messages, agent messages, system updates, and async workflow updates

### 6.2 Agent UI API
- [x] POST message to agent thread
- [x] GET thread history
- [x] Stream agent response support
- [x] Background update delivery into same thread

### 6.3 Agent behavior baseline
- [x] Agent acknowledges intent naturally
- [x] Agent stores request durably
- [x] Agent can follow up later:
  - “I found 3 people for Apex”
  - “Remember you asked earlier…”
- [x] Agent can summarize pending states
- [x] Agent can cancel outstanding intent flow

**Acceptance criteria**
- User can have an ongoing “social agent” conversation that persists over time
- Async job results appear as natural agent follow-ups

---

## 7. OpenAI Integration Layer

### 7.1 SDK foundation
- [x] Create `packages/openai`
- [x] Add OpenAI client wrapper
- [x] Add model routing config
- [x] Add retry/backoff and timeout policy
- [x] Add tracing correlation IDs

### 7.2 Structured Outputs
- [x] Implement intent parsing schema
- [x] Implement follow-up question schema
- [x] Implement suggestion schema
- [x] Implement ranking explanation schema

### 7.3 Agents SDK / AgentKit alignment
- [x] Define manager agent
- [x] Define specialist sub-agents:
  - intent parser agent
  - ranking explanation agent
  - personalization interpreter agent
  - notification copy agent
  - moderation assistant agent
- [x] Define handoff/tool policy
- [x] Define human-in-the-loop approvals for risky actions
- [x] Define background run policy

### 7.4 Evaluation and prompt lifecycle
- [x] Prompt versioning
- [x] Golden intent parsing dataset
- [x] Regression tests for tool usage
- [x] Failure capture and replay

**Acceptance criteria**
- All AI calls go through a shared typed layer
- Intent parsing is schema-safe
- Prompt/model/tool changes are testable

---

## 8. Intent Ingestion and Understanding

### 8.1 Intent creation
- [x] Create POST /intents from explicit API
- [x] Create “intent via agent message” flow
- [x] Create intent lifecycle states:
  - draft
  - parsed
  - matching
  - fanout
  - partial
  - connected
  - expired
  - cancelled

### 8.2 Intent parsing
- [x] Extract:
  - type
  - topic(s)
  - urgency
  - modality (online/offline)
  - group size target
  - timing constraints
  - skill/vibe constraints
- [x] Add fallback heuristic parser if model fails
- [x] Add parser confidence score
- [x] Add follow-up question path for ambiguous input

### 8.3 Intent management
- [x] Edit intent
- [x] Cancel intent
- [x] Retry intent
- [x] Widen intent filters
- [x] Convert 1:1 to group or vice versa

**Acceptance criteria**
- A freeform user message can reliably become a stored structured intent

---

## 9. Personalization, Rules, and Life Graph

### 9.1 Explicit user rules
- [x] Global rules:
  - who can contact me
  - when I’m reachable
  - 1:1 vs group preference
  - online vs offline
  - language preferences
  - verification requirements
- [x] Intent-type overrides
- [x] Notification rules
- [x] Agent autonomy rules
- [x] Memory preferences

### 9.2 Life graph
- [x] Build node types:
  - activity
  - topic
  - game
  - person
  - schedule preference
  - location cluster
- [x] Build edge types:
  - likes
  - avoids
  - prefers
  - recently engaged with
  - high success with
- [x] Weight update strategy from feedback and behavior
- [x] Explicit vs inferred separation

### 9.3 Retrieval / RAG
- [x] Store retrievable profile summary docs
- [x] Store preference memory docs
- [x] Store interaction summaries
- [x] Build retrieval pipeline for personalization-aware reasoning
- [x] Guard against stale or unsafe retrieved data

### 9.4 Policy engine
- [x] Build rule precedence engine:
  1. safety rules
  2. hard user rules
  3. product policy
  4. intent-specific overrides
  5. learned preferences
  6. ranking heuristics
- [x] Build explainability output for debug/admin

**Acceptance criteria**
- Matching and notifications respect explicit user rules before ranking
- Life graph evolves from usage and feedback

---

## 10. Embeddings and Candidate Retrieval

### 10.1 Embedding generation
- [x] User profile embeddings
- [x] Interest/topic embeddings
- [x] Intent embeddings
- [x] Optional conversation summary embeddings

### 10.2 Retrieval pipeline
- [x] Candidate retrieval by semantic similarity
- [x] Filter by hard constraints before/after ANN retrieval as designed
- [x] Add fallback lexical/topic filters
- [x] Add retrieval score logging

### 10.3 Re-ranking
- [x] Availability score
- [x] Trust/reputation score
- [x] Recent interaction suppression
- [x] Proximity score for offline
- [x] Style/vibe compatibility score
- [x] Personalization boosts

**Acceptance criteria**
- Candidate retrieval is fast, explainable, and policy-compliant

---

## 11. Matching and Routing Engine

### 11.1 1:1 matching
- [x] Top-N candidate selection
- [x] Fanout cap logic
- [x] Duplicate suppression
- [x] Recent rejection suppression

### 11.2 Group formation
- [x] Target group size support
- [x] Hard max participants = 4
- [x] Threshold logic for group creation
- [x] Backfill if someone drops before start
- [x] Stop inviting once capacity reached
- [x] Group conversion rules from active 1:1 intent

### 11.3 Async routing behavior
- [x] Persist routing attempt history
- [x] Retry delayed candidates
- [x] Escalate/widen filters after timeout
- [x] Notify user naturally about progress and outcomes

### 11.4 Explanations
- [x] Store why a candidate was selected
- [x] Expose safe explanation to admin/debug tools
- [x] Optional user-facing explanation later

**Acceptance criteria**
- Routing works for both 1:1 and <=4-person group intents without over-inviting or violating policy

---

## 12. BullMQ Workflow Orchestration

### 12.1 Queue setup
- [x] Create queues:
  - intent-processing
  - embedding
  - matching
  - request-fanout
  - notification
  - connection-setup
  - moderation
  - media-processing
  - cleanup
  - digests
  - admin-maintenance

### 12.2 Flows
- [x] IntentCreated flow
  - parse intent
  - embed intent
  - retrieve candidates
  - rank candidates
  - fanout requests
- [x] RequestAccepted flow
  - update intent state
  - decide 1:1 vs group
  - create connection/chat
  - notify participants
- [x] GroupFormation flow
  - accumulate acceptances
  - enforce capacity
  - create chat when ready
- [x] AsyncAgentFollowup flow
  - write agent update
  - send push/inbox update

### 12.3 Reliability
- [x] Idempotency keys on jobs
- [x] Exponential backoff
- [x] Dead-letter handling
- [x] Manual replay tooling
- [x] Stalled job recovery
- [x] Outbox relay integration

**Acceptance criteria**
- All core product flows are durable and replayable
- Side effects are idempotent

---

## 13. Notifications and Agent Follow-ups

### 13.1 Notification types
- [x] Incoming request
- [x] Request accepted
- [x] Group formed
- [x] Agent update
- [x] Reminder
- [x] Digest
- [x] Moderation/safety notice

### 13.2 Delivery channels
- [x] In-app inbox
- [x] Push notifications
- [x] Email digest (optional phased)
- [x] Agent-thread message insertion

### 13.3 Natural-language updates
- [x] “I found 3 people to play Apex”
- [x] “Remember you asked me earlier…”
- [x] “Nobody matched yet; want me to widen filters?”
- [x] “2 people accepted, one more needed”

### 13.4 Notification policy
- [x] Respect quiet hours
- [x] Respect digest mode
- [x] Priority routing by urgency
- [x] Deduplicate updates

**Acceptance criteria**
- Async outcomes always come back to the user in a natural and coherent way
- Notification behavior respects personalization rules

---

## 14. Inbox and Request Handling

### 14.1 Incoming requests
- [x] List pending requests
- [x] Accept/reject
- [x] Expire automatically
- [x] Bulk decline / snooze behavior if needed later

### 14.2 Request states
- [x] Pending
- [x] Accepted
- [x] Rejected
- [x] Expired
- [x] Cancelled by originator

### 14.3 UX/API requirements
- [x] Request card summary
- [x] Who + what + when
- [x] Maybe why me? internal field for future

**Acceptance criteria**
- Incoming social opportunities are easy to review and act on

---

## 15. Human Chat System

### 15.1 1:1 chat
- [x] Create chat on mutual acceptance
- [x] Membership persistence
- [x] Message persistence
- [x] Read receipts
- [x] Typing indicators
- [x] Soft-delete behavior
- [x] Block-aware sending restrictions

### 15.2 Group chat
- [x] Create group chat when threshold met
- [x] Participant cap = 4
- [x] Membership events
- [x] Group metadata
- [x] Participant leave handling
- [x] Close/archive semantics

### 15.3 Message model
- [x] Text messages
- [x] System messages
- [x] Join/leave notices
- [x] Moderation-hidden messages
- [x] Message status model

### 15.4 Synchronization
- [x] Pagination
- [x] Reconnect sync
- [x] Unread counts
- [x] Ordering guarantees
- [x] Deduplication

**Acceptance criteria**
- 1:1 and small group chat are reliable, real-time, and recoverable after reconnect

---

## 16. Realtime Transport

### 16.1 Socket.IO / NestJS gateways
- [x] Authenticated socket connection
- [x] Namespace strategy
- [x] Room strategy for chats and user channels
- [x] Heartbeat / presence handling
- [x] Reconnection handling

### 16.2 Scaling
- [x] Redis adapter
- [x] Sticky session deployment support
- [x] Multi-node event propagation
- [x] Fallback sync from DB on reconnect

### 16.3 Protocol semantics
- [x] Client-generated temp ids or server ids
- [x] Ack events
- [x] Exactly-once UX via idempotent insert + dedupe
- [x] Ordering guarantees
- [x] Offline event replay window

**Acceptance criteria**
- Realtime messaging works across multiple app nodes without inconsistent chat state

---

## 17. Moderation and Safety

### 17.1 Intent moderation
- [x] Moderate new intents before fanout
- [x] Block harmful/abusive intents
- [x] Human review path for uncertain cases

### 17.2 Chat moderation
- [x] Pre-send moderation policy decision
- [x] Post-send reporting pipeline
- [x] Auto-hide/escalate policy
- [x] Strikes / enforcement model

### 17.3 Profile moderation
- [x] Text fields moderation
- [x] Profile image moderation
- [x] Impersonation reporting

### 17.4 User safety controls
- [x] Block user
- [x] Report user
- [x] Restrict offline-only users
- [x] Verified-only mode
- [x] Age/location/privacy safeguards if applicable

**Acceptance criteria**
- The platform can safely prevent or respond to harmful content and bad actors

---

## 18. Admin Dashboard and Debugging Tools

### 18.1 Admin auth and RBAC
- [x] Admin roles
- [x] Support roles
- [x] Moderation roles
- [x] Audit all admin actions

### 18.2 Admin views
- [x] Users
- [x] Intents
- [x] Requests
- [x] Connections
- [x] Chats
- [x] Reports
- [x] Moderation queue
- [x] Queue/Job monitor
- [x] Agent traces
- [x] Audit logs

### 18.3 Superpowers
- [x] Force-cancel intent
- [x] Deactivate account
- [x] Shadow-ban / restrict account
- [x] Replay workflow
- [x] Inspect routing explanation
- [x] Inspect personalization rules
- [x] Inspect life graph summary
- [x] Resend notification
- [x] Repair stuck connection/chat flow

### 18.4 Tooling integration
- [x] bull-board or equivalent
- [x] Trace viewer integration
- [x] Internal query/debug helpers

### 18.5 Admin UI (parallel lane)
- [x] shadcn-style primitives (Radix + CVA + `tailwind-merge`) under `app/components/ui/*`
- [x] App shell: responsive sidebar navigation, sticky top bar, session/badges, mobile drawer
- [x] Optional upgrades: URL-based tabs (done), token refresh UX (done), Radix `Select` (done), admin E2E (done)

**Acceptance criteria**
- Support/admin teams can debug user issues and stuck workflows without database spelunking

---

## 19. Search, Discovery, and Suggestions

### 19.1 Passive discovery
- [x] “What can I do tonight?”
- [x] Suggested active intents or users
- [x] Suggested groups
- [x] Suggested reconnects

### 19.2 Recommendation surfaces
- [x] Lightweight recommendations in agent thread
- [x] Inbox suggestions
- [x] Optional dedicated discovery tab later

### 19.3 Ranking
- [x] Combine life graph + semantic + policy + recency

**Acceptance criteria**
- Users can get useful discovery without turning the product into a noisy feed

---

## 20. Client Apps

### 20.1 Mobile app
- [x] Auth flow
- [x] Onboarding
- [x] Home/agent
- [x] Inbox
- [x] Chats
- [x] Profile
- [x] Notifications
- [x] Settings and personalization

### 20.2 Web app
- [x] Parity for core flows or explicit reduced surface
- [x] Admin dashboard separate app or route group
- [x] Responsive layouts

### 20.3 Design system
- [x] Tokens
- [x] Typography
- [x] Color roles
- [x] Chat components
- [x] Card components
- [x] Empty/loading/error states

### 20.4 Mobile — ChatGPT-class UI parity (`apps/mobile`)

**Goal:** Match the calm, dense, “single chat surface” feel of the ChatGPT mobile app: semantic dark canvas, pill composer, icon navigation, inverted transcript lists, drawer navigation, and minimal chrome—without changing product invariants (agent vs human chat separation).

#### 20.4.1 Completed (audit: shipped baseline)
- [x] Semantic palette aligned to ChatGPT-like dark grays (`canvas`, `surface`, `hairline`, `ink`, `muted`, `accent`, `accentMuted`) in `tailwind.config.js` + `src/theme.ts`
- [x] Reusable chrome: `AppTopBar`, `ComposerInput` (pill field), `HomeTabBar`, `SectionHeader`, `src/components/index.ts` barrel
- [x] Primitive refresh: `ui/card`, `ui/button`, `ui/chip`, `ui/alert` + `ChatBubble` roles (user / assistant / workflow system line)
- [x] Home agent tab: docked composer, primary flow on `HomeScreen`; Discover sections use `SectionHeader`
- [x] Auth / onboarding / empty / loading surfaces moved to semantic tokens

#### 20.4.2 Completed (parity iterations)
- [x] Bottom tab bar **iconography** (`@expo/vector-icons` / Ionicons) + label stack in `HomeTabBar`
- [x] **Inverted `@shopify/flash-list`** transcripts for agent + human chat (`ChatTranscriptList`, bottom-anchored growth)
- [x] **Circular icon send** composer row (`MessageComposer`: pill input + `arrow-up` send, Maestro `testID`s preserved on input + send control)
- [x] Keyboard UX: `keyboardDismissMode="interactive"` + `keyboardShouldPersistTaps="handled"` on transcript lists
- [x] **Starter suggestions** when the agent thread is near-empty (`AgentSuggestionChips`, aligned with `04_design_system.md` home composer affordances)
- [x] **Reduce motion**: `AnimatedScreen` skips translate/fade when system reduce-motion is enabled
- [x] **Drawer / sidebar**: `AppDrawer` + hamburger (`home-drawer-open-button`), navigate tabs, **New conversation** (local agent thread reset)
- [x] **Minimal agent chrome**: compact `AppTopBar` on agent tab (title `OpenSocial`, subtitle hidden) + menu affordance on all tabs
- [x] **Stop / Regenerate**: `AgentIntentToolbar` + `AbortController` on `api.createIntent` (`agent-stop-button` / `agent-regenerate-button`)
- [x] **Voice input**: `VoiceMicButton` + `expo-speech-recognition` in `MessageComposer` (`composer-voice-button`); iOS/Android usage strings in `app.json`
- [x] **Haptics**: `expo-haptics` via `lib/haptics.ts` (respects reduce motion) on tab change + successful intent/chat send
- [x] **Markdown** for **agent-role** bubbles (`react-native-markdown-display` in `ChatBubble`)
- [x] **Maestro**: drawer open/close assertions on `home-drawer-*` IDs after landing on home

#### 20.4.3 ChatGPT-parity backlog (closed)
All items from the former “exact ChatGPT” delta list are now implemented or explicitly covered above; future polish is normal product iteration (thread history from API, true stop-stream for SSE, visual regression CI).

**Acceptance criteria (20.4)**
- `pnpm --filter @opensocial/mobile lint` and `typecheck` pass
- Maestro critical path passes including drawer steps (`home-drawer-open-button`, `home-drawer-sheet`, `home-drawer-close`)
- Agent and human chat composers use **input + mic + circular send**
- Transcripts use **inverted FlashList** so new messages stay visually anchored at the bottom

---

## 21. Analytics, Experiments, and Product Telemetry

### 21.1 Event tracking
- [x] Auth events
- [x] Onboarding completion
- [x] Intent created
- [x] Request sent
- [x] Request accepted/rejected
- [x] Connection created
- [x] Chat started
- [x] First message sent
- [x] Message replied
- [x] Report/block
- [x] Personalization change

### 21.2 Core metrics
- [x] Time from intent to first acceptance
- [x] Time from intent to first message
- [x] Connection success rate
- [x] Group formation completion rate
- [x] Notification-to-open rate
- [x] Repeat connection rate
- [x] Moderation incident rate

### 21.3 Experimentation
- [x] Ranking experiment hooks
- [x] Copy experiment hooks
- [x] Notification timing experiment hooks
- [x] Safe rollout guardrails

**Acceptance criteria**
- Product decisions can be made from event data, not anecdote

---

## 22. Observability and Ops

### 22.1 Logs
- [x] Structured logs everywhere
- [x] Request correlation ids
- [x] Job correlation ids
- [x] User-safe redaction policy

### 22.2 Metrics
- [x] API latency
- [x] Websocket connection counts
- [x] Queue lag
- [x] Job failure rates
- [x] DB latency
- [x] OpenAI latency/cost
- [x] Moderation rates
- [x] Push delivery success

### 22.3 Tracing
- [x] OpenTelemetry in API/workers
- [x] OpenAI Agents SDK traces linked to app trace ids
- [x] Trace propagation through jobs/events

### 22.4 Alerts
- [x] Queue stalled
- [x] Queue backlog high
- [x] Websocket error spike
- [x] DB connection saturation
- [x] OpenAI error spike
- [x] Moderation backlog high

**Acceptance criteria**
- Ops can detect, trace, and resolve production issues quickly

---

## 23. Security, Privacy, and Compliance

### 23.1 Security
- [x] Threat model doc implementation
- [~] Dependency currency and vulnerability patching (latest stable libs; blockers tracked explicitly)
  - [x] Backend lane: major dependency migration completed (`prisma@7.5.0`, `@prisma/client@7.5.0`, `zod@4.3.6`, `openai@6.32.0`, `vitest@4.1.0`, `class-validator@0.15.1`, `ioredis@5.10.1`, Prisma adapter runtime path with `@prisma/adapter-pg` + `pg`)
  - [x] Backend lane: Prisma dev-chain transitive advisories patched via root `pnpm.overrides` (`hono`, `@hono/node-server`, `lodash`)
  - [x] Mobile lane: Expo SDK 55 upgrade + mobile runtime dependency refresh completed and build-verified (with compatibility pin `@react-native-async-storage/async-storage@2.2.0`)
  - [x] Security audit patch: resolved transitive `markdown-it` advisory (CVE-2022-21670) via root override `markdown-it@12.3.2`; verified with `pnpm audit --prod` (0 vulnerabilities)
  - [x] Web/admin lane (parallel): `apps/web` + `apps/admin` on `next@16.2.x`, `tailwindcss@4.2.x`, `@tailwindcss/postcss`; `postcss.config.mjs`; `globals.css` uses `@import "tailwindcss"` + `@config` for legacy theme; removed `autoprefixer` (handled by Tailwind v4 pipeline); `next build --no-lint` dropped (Next 16). Verified `pnpm --filter @opensocial/web|admin` `lint`, `typecheck`, `build`.
  - [x] Workspace tooling lane (parallel): upgraded (`eslint@10.1.0`, `@eslint/js@10.0.1`, `@types/node@25.5.0`, `globals@17.4.0`, `lint-staged@16.4.0`, `turbo@2.8.20`) with lint/typecheck/test/drift-check verification
  - [x] Drift snapshot refreshed via `pnpm outdated -r` (2026-03-20)
- [x] Rate limiting
- [x] Abuse throttling
- [x] Admin RBAC hardening
- [x] Secrets rotation
- [x] Encryption at rest/in transit
- [x] Secure file upload pipeline
- [x] Prompt/tool injection guardrails

### 23.2 Privacy
- [x] Data retention policy
- [x] User data export
- [x] Account deletion
- [x] Message deletion policy
- [x] Memory reset policy
- [x] PII redaction in logs/traces

### 23.3 Legal/compliance
- [x] Privacy policy requirements inputs
- [x] Terms of service inputs
- [x] Age restrictions decision
- [x] Region compliance checklist as applicable

**Acceptance criteria**
- Core user rights and security controls are implemented, not deferred

---

## 24. Testing Strategy

### 24.1 Unit tests
- [x] Policy engine
- [x] Ranking functions
- [x] Parser fallback logic
- [x] DTO validators
- [x] Websocket guards

### 24.2 Integration tests
- [x] Auth flows
- [x] Intent creation flow
- [x] Matching flow
- [x] Request acceptance flow
- [x] 1:1 connection flow
- [x] Group formation flow
- [x] Moderation flow
- [x] Admin actions

### 24.3 E2E tests
- [x] Mobile/web critical path (Maestro mobile local-mode + Playwright web design mock in CI)
- [x] Maestro mobile critical-path suite (Auth -> Onboarding -> Home intent -> Chat)
- [x] Agent thread -> async follow-up -> chat creation (backend queue/service flow test in `apps/api/test/agent-followup-chat-flow.spec.ts`)
- [x] Agentic communication lifecycle E2E (`apps/api/test/agentic-communication.e2e.spec.ts`)
- [x] RAG retrieval and safe-context filtering E2E (`apps/api/test/rag-retrieval.e2e.spec.ts`)
- [x] Reconnect and message sync
- [x] Blocked-user behavior

### 24.4 Load and resilience tests
- [x] Websocket concurrency test
- [x] Queue backlog test
- [x] Retry storm test
- [x] Redis outage behavior
- [x] OpenAI timeout fallback behavior

**Acceptance criteria**
- Critical product flows are covered by automated tests before prod rollout

---

## 25. Release Readiness

### 25.1 Feature flags
- [x] Agent follow-up flags
- [x] Group chat flags
- [x] Personalization flags
- [x] Discovery flags
- [x] Moderation strictness flags

### 25.2 Staging verification
- [x] Smoke test checklist
- [x] Seeded demo data
- [x] Manual QA script

### 25.3 Launch controls
- [x] Internal alpha cohort
- [x] Invite-only mode if needed
- [x] Kill switches for:
  - new intents
  - group formation
  - push notifications
  - AI parsing
  - realtime chat

**Acceptance criteria**
- Core systems can be selectively disabled without full outage

---

## 26. Documentation Completion

### 26.1 Keep docs in sync
- [x] Update architecture docs to match implementation decisions
- [x] Update API docs from source
- [x] Add queue contract doc from source
- [x] Add ERD
- [x] Add sequence diagrams for:
  - intent flow
  - group formation
  - agent async follow-up
  - moderation pipeline

### 26.2 Developer onboarding
- [x] Local setup guide
- [x] Debugging guide
- [x] Common failure guide
- [x] Queue replay guide
- [x] Admin runbook
- [x] Incident runbook

**Acceptance criteria**
- A new engineer or coding agent can start work without reverse engineering the system

---

## 27. Product Description (From Markdown Specs)

OpenSocial is an intent-first social execution layer:
- users express a social need in one sentence
- the backend parses and structures intent, retrieves/ranks candidates, and sends explicit opt-in requests
- the system opens 1:1 or small-group chat only after acceptance
- AI is bounded to parsing/ranking/summarization/coordination/safety, and does not impersonate users in live chat
- v1 is optimized for fast connection quality, explicit consent, trust/safety, and durable async routing

MVP interaction priority from behavioral spec:
1. Real-time conversation
2. Real-time activity pairing
3. Passive availability mode
4. Group formation
5. Exploration
6. Continuity and re-connection

Primary KPI:
- time from intent creation to successful human connection

---

## 28. Priority Strategy (Backend-First)

Execution rules:
- close all in-progress backend milestones before opening new backend scope
- prioritize production risk reducers (observability, security, privacy, testing) over net-new features
- treat release controls and runbooks as ship blockers, not polish work
- keep frontend (`apps/mobile`, `apps/web`, `apps/admin`) in a parallel lane unless blocked by backend API gaps
- track frontend/tooling dependency majors in parallel; do not block backend milestone closure unless a backend runtime/security dependency is impacted

Backend ownership lane:
- sections `12`, `13`, `22`, `23`, `24`, `25`, `26`

Frontend parallel lane:
- app UX polish, flow consistency, and endpoint integration on already-shipped APIs

---

## 29. Authoritative Backend Execution Queue

### P0 — Finish active in-progress backend work
- [x] Complete `12.2 IntentCreated flow` end-to-end closure
- [x] Complete `12.2 GroupFormation flow` end-to-end closure
- [x] Complete `13.2 Agent-thread message insertion`
- [x] Complete `22.1 Structured logs everywhere`

### P1 — Operability and security baseline (ship blocker)
- [x] Complete `22.2 Metrics` baseline for API/realtime/queue/DB/OpenAI/moderation/push
- [x] Complete `22.3 Tracing` with API + worker + queue propagation
- [x] Complete `22.4 Alerts` for backlog/error/saturation conditions
- [x] Complete backend scope of `23.1 Security` controls (threat-model actions, backend dependency-currency migration, rate limiting, abuse throttling, RBAC hardening, secrets rotation, encryption posture checks, upload hardening, prompt/tool injection guardrails)
- [x] Confirm backend-first scope split for dependency currency: frontend/tooling majors (`next@16`, `tailwindcss@4`, `eslint@10` family) stay in parallel lane tracking and do not block backend P1 closure

### P2 — Privacy rights and compliance baseline (ship blocker)
- [x] Complete `23.2 Privacy` controls (retention/export/deletion/message deletion/memory reset/PII redaction)
- [x] Complete `23.3 Legal/compliance` inputs and policy decisions

### P3 — Automated quality gates (ship blocker)
- [x] Complete `24.1 Unit tests` for policy/ranking/parser/DTO/websocket guards
- [x] Complete `24.2 Integration tests` for auth->intent->matching->request->connection->moderation->admin paths
- [x] Complete `24.3 E2E tests`: backend queue/service journeys (`agent thread -> async follow-up -> chat creation`, reconnect/sync, blocked-user behavior) plus frontend **design-mock** automation (Maestro mobile, Playwright web). Optional later: Playwright against live API + seeded web session.
- [x] Complete `24.4 Load and resilience tests` for websocket/queue/retry/outage/timeout behavior

### P4 — Controlled rollout and operability docs
- [x] Complete `25.1 Feature flags`
- [x] Complete `25.2 Staging verification` pack
- [x] Complete `25.3 Launch controls` (alpha cohort, invite-only mode, kill switches)
- [x] Complete `26.1` and `26.2` docs/runbooks onboarding set

---

## 30. Open Decisions (Still Blocking)

- [x] Confirm exact OpenAI model policy by task (implemented in `@opensocial/openai`, documented in `docs/openai-model-policy.md`, and covered by `openai-client.spec.ts`)
- [x] Confirm age/location policy for trust + compliance controls (implemented as configurable compliance policy + eligibility checks)
- [x] Confirm region compliance checklist scope for launch geographies (implemented as env-driven region policy + checklist endpoint/doc)

---

## 31. Updated Ship Definition

Backend execution lane is complete when:
- [x] all backend `P0` through `P4` queue items above are complete
- [x] critical backend flows have passing unit/integration/e2e coverage
- [x] security/privacy/compliance controls are implemented and tested
- [x] documentation and operational runbooks are current and actionable

Production rollout is approved only when:
- [~] observability + alerting + incident runbook paths are validated in staging (deprioritized; post-launch hardening lane)
- [~] rollout controls (flags, cohorting, kill switches) are exercised in staging (deprioritized; post-launch hardening lane)
- [x] frontend design-mock critical-path automation is in CI (Maestro documented for mobile; Playwright for web). Live-stack browser tests against staging API remain a manual/optional gate until scripted.

---

## 32. OpenClaw-Style Agentic Conversation Runtime (ChatGPT-Class)

### 32.1 Runtime orchestration
- [x] Add manager-led runtime plan generation for agent turns
- [x] Enforce handoff policy at runtime (manager -> specialists only when allowed)
- [x] Add runtime guardrails for risky actions requiring human approval

### 32.2 Tool execution runtime
- [x] Add structured tool-call plan format (role, tool, input)
- [x] Execute tool calls through a bounded registry (no unrestricted environment tools)
- [x] Enforce per-role tool allowlists at runtime with explicit deny telemetry

### 32.3 Conversation loop APIs
- [x] Add API endpoint to run a full agentic turn on an agent thread
- [x] Persist user turn + workflow updates + final agent response in thread history
- [x] Return plan/tool/specialist execution metadata for debug/admin visibility

### 32.4 Model behavior and prompts
- [x] Add dedicated prompts/tasks for conversation planning and final response synthesis
- [x] Add deterministic fallbacks when planning/response generation fails
- [x] Keep trace metadata + prompt version attached to every OpenAI task

### 32.5 Search/RAG/tooling integration for conversations
- [x] Expose personalization retrieval as a callable conversation tool
- [x] Expose intent parsing, moderation assist, and notification-copy tools in runtime
- [x] Ensure tool outputs are composable into the final response safely

### 32.6 Streaming + UX parity (backend scope)
- [x] Add token/step streaming path for agent responses (SSE/WebSocket compatible)
- [x] Emit intermediate orchestration steps as workflow updates while run is active

### 32.7 Test and release gates
- [x] Unit tests for orchestration policy enforcement and tool-allowlist checks
- [x] Integration tests for end-to-end agentic turn (plan -> tools -> specialists -> response)
- [x] Regression tests for fallback behavior and unsafe tool/handoff attempts

**Acceptance criteria**
- Backend supports a real agentic turn loop with runtime-enforced handoff/tool policy (not policy-only helpers)
- Agent conversations can invoke bounded tools (including retrieval context) and produce persisted assistant replies
- Failures degrade safely with deterministic fallbacks and complete traceability

---

## 33. ChatGPT-Social Backend Parity Track (1-6, excluding 2 frontend lane)

### 33.1 True live model streaming
- [x] Replace synthetic chunk streaming with real Responses API delta streaming (`response.output_text.delta`)
- [x] Keep fallback chunk streaming path when true model stream is unavailable

### 33.2 Frontend parity (parallel lane)
- [~] Tracked in `PROGRESS_FRONTEND.md` and Section `34.3` frontend execution board (parallel lane)

### 33.3 Multimodal backend I/O for agent turns
- [x] Extend agent respond payload with `voiceTranscript` and `attachments`
- [x] Persist multimodal context in user-message metadata and include it in plan/response generation context

### 33.4 Eval and quality loop
- [x] Add deterministic backend eval snapshot service for core agentic safeguards
- [x] Expose eval snapshot endpoint `GET /api/admin/ops/agentic-evals`

### 33.5 Abuse/trust maturity on conversational turns
- [x] Add deterministic content-risk assessment (`clean`/`review`/`blocked`) with spam/fraud heuristics
- [x] Expose moderation assessment endpoint `POST /api/moderation/assess`
- [x] Add hybrid OpenAI-assisted moderation for risk assessment and chat message pre-send decisions with deterministic fallback
- [x] Enforce pre-tool and pre-send risk checks in agentic turn runtime
- [x] Persist non-clean conversational risk checks to `moderation_flags` + `audit_logs` for downstream moderation ops

### 33.6 Production scale posture
- [x] Add OpenAI response budget guardrails with estimated-cost precheck
- [x] Add OpenAI circuit-breaker behavior on repeated upstream failures
- [x] Expose OpenAI budget/circuit runtime state in admin ops metrics

---

## 34. Unified Delivery Board (General Objectives + Main Objectives + Task Status)

### 34.1 General objectives
- [~] Deliver ChatGPT-social quality on backend first: reliable agentic conversations + reliable user messaging (1:1 and groups) + durable safety controls.
- [~] Keep frontend (`apps/web`, `apps/mobile`, `apps/admin`) in parallel execution while preserving shared API contracts and test IDs.
- [~] Keep release confidence high with deterministic tests, auditability, and explicit staging rollout gates.

### 34.2 Main objectives (backend critical path)
- [x] Agentic runtime parity: manager plan -> bounded tools -> specialists -> final response with streaming + fallbacks.
- [x] Chat reliability parity: request acceptance -> connection setup -> chat membership sync -> message fanout + receipts + presence.
- [x] Retrieval and memory parity: retrieval docs/chunks + personalized query path + safe exclusion of flagged content.
- [x] Moderation baseline parity: content risk assess endpoint + pre-tool/pre-send runtime gates.
- [x] Moderation durability parity: persist non-clean conversational risk decisions to `moderation_flags` + `audit_logs`.
- [x] Moderation operations parity: dedicated admin triage workflow over `agent_thread` risk flags (queue, assignment, resolve/escalate actions).
- [~] Staging launch parity: validate incident/alerts/runbooks and rollout controls end-to-end in staging (deprioritized; execute in post-launch hardening lane).

### 34.3 Frontend parallel lane (tracked, not blocking backend closure)
- [x] Web app: consume `/api/agent/threads/:threadId/respond/stream` for live token rendering and partial-response UX (SSE `.../stream?access_token=` + `traceId`-correlated `response_token` chunks).
- [x] Mobile app: consume streaming respond path and composer support for `voiceTranscript` + `attachments` (image URL) payloads.
- [x] Admin app: moderation triage panel for agent-thread `moderation_flags` + triage/assign actions (pairs with `moderation.agent_risk_assessed` audits).
- [x] Shared frontend: i18n catalog wiring and locale switching across web/mobile/admin.
- [x] Frontend critical path and capability matrix maintained in `PROGRESS_FRONTEND.md`.

### 34.4 Task queue (one-by-one status)
- [x] `B-01` Wire true OpenAI delta streaming into agent workflow updates.
- [x] `B-02` Add multimodal turn contract (`voiceTranscript`, `attachments`) and persist in thread metadata.
- [x] `B-03` Add `POST /api/moderation/assess` and deterministic risk classifier.
- [x] `B-04` Enforce conversational risk gates before tool execution and before send.
- [x] `B-05` Persist conversational non-clean risk checks to `moderation_flags` and `audit_logs`.
- [x] `B-06` Add admin eval endpoint for deterministic agentic safeguard checks.
- [x] `B-07` Add OpenAI budget + circuit-breaker guardrails with admin metrics exposure.
- [x] `B-08` Keep backend quality gates passing (`@opensocial/api` lint/typecheck/tests).
- [x] `B-09` Build moderation triage workflow for agent-thread flags (resolve/escalate/strike linkage).
- [~] `B-10` Run staging smoke + incident/alerts verification for final go/no-go (automation implemented: `pnpm staging:smoke:api` + `pnpm staging:verify:incident`, plus manual deploy-staging post-deploy gate; execute against staging window for final closure).
- [x] `B-11` Upgrade chat and moderation assess pipelines to hybrid OpenAI-assisted moderation with deterministic fallback and regression tests.
- [x] `F-01` Web streaming UI and token-by-token transcript rendering.
- [x] `F-02` Mobile multimodal composer + streaming UX.
- [x] `F-03` Admin moderation operations UI over risk flags + audit logs.
- [x] `F-04` Shared i18n productionization across all clients.
- [x] `F-05` Client JWT refresh/session continuity: implement automatic `POST /auth/refresh` handling on access-token expiry (401), retry original request once, rotate stored session tokens, and force sign-out on refresh failure across mobile/web/admin clients.
- [~] (TP-01) Smooth the mobile onboarding navigation between page 1 and page 2 with a consistent transition so the screen changes are fluid on low-end devices.
- [ ] `F-06` Add onboarding onboarding voice feedback UI so users see the soundwave/voice-level visual while recording.
- [x] `D-01` Keep dependency currency cadence (`pnpm deps:outdated`) and upgrade latest runtime/security-safe versions by lane.

### 34.4.1 Automated Pipeline Bootstrap Task Queue (Priority)

- [~] `TP-01` Mobile onboarding transition smoothness: remove layout-shift between expression/refinement/result screens, lock CTA/footer positioning, and keep animations under dropped-frame budget on low-end devices.
- [~] `TP-02` Onboarding loading experience polish: finalize premium loading copy/motion states (recording -> processing -> understanding -> ready) with deterministic timing and no confusing/technical wording.
- [~] `TP-03` Onboarding inference reliability hardening: keep `infer-fast` and `infer` paths non-failing under provider latency/format variance (timeouts, malformed JSON, empty output) and return safe structured fallback responses.
- [ ] `TP-04` LLM response quality upgrade (launch profile): tune prompts + schema guarantees so rich inference returns stable persona/summary quality (not generic) for 20+ realistic voice transcripts in EN/ES smoke set.
- [~] `TP-05` Provider strategy and routing: define and validate fast/rich model policy (`ONBOARDING_LLM_FAST_MODEL`, `ONBOARDING_LLM_RICH_MODEL`, timeout budgets) with measurable p95 latency and quality acceptance gates.
- [~] `TP-06` Deploy/env parity for onboarding AI: ensure staging/production/rollback always sync all onboarding env vars (`*_MODEL`, `*_FAST_MODEL`, `*_RICH_MODEL`, `*_TIMEOUT_MS`, `*_RICH_TIMEOUT_MS`, probe token) with regression tests.
- [~] `TP-07` Observability for onboarding inference: add structured logs/metrics dashboard (success rate, timeout rate, fallback rate, model/provider latency histogram) and alert thresholds for degradation.
- [ ] `TP-08` Session continuity bugfix: eliminate `session expired` interruptions by validating refresh-token path across mobile/web (token rotation, retry-on-401 once, forced logout only on hard refresh failure) with E2E coverage.
- [ ] `TP-09` Onboarding end-to-end contract tests: add API + client integration tests for voice-first flow from transcript capture through persona confirmation and profile persistence.
- [ ] `TP-10` Security clean-up before launch: rotate temporary debug/probe secrets, retain protected probe endpoints for ops, and verify no sensitive tokens are present in git history/docs/log output.
- [ ] `TP-11` Launch smoke matrix: run deterministic smoke checks for web/mobile/admin + API on staging and production with explicit pass/fail checklist and rollback criteria.
- [ ] `TP-12` Release readiness package: publish a concise launch runbook including known limits, fallback behavior, monitoring links, kill switches, and first-24h incident response owner map.
- [~] `TP-13` Post-onboarding activation trigger contract: run one deterministic activation handoff immediately after persona confirmation/profile persistence and return typed activation state (`idle|pending|ready|failed`) plus first recommended action.
- [~] `TP-14` Mobile/web activation handoff UX: route users from onboarding completion into actionable activation state (not empty home), with resilient resume after background/relaunch and explicit loading/ready/error states.
- [~] `TP-15` Starter intent bootstrap pipeline: generate/persist a safe first activation recommendation from onboarding outputs (persona/goals/interests/language) with deterministic fallback for weak model output.
- [x] `TP-16` One-tap activation execution path: execute first recommended action directly after onboarding with backend idempotency, optimistic UX, and recoverable failure handling.
- [x] `TP-17` Activation funnel telemetry and guardrails: instrument onboarding-complete -> activation-ready -> first-action-succeeded funnel with alert thresholds for activation failure and cold-start latency regressions.

### 34.4.2 TP closure criteria (explicit)
- `TP-01` closes when onboarding screen transitions hold stable CTA/footer placement across expression/refinement/result with no visible layout jump in low-end device smoke.
- `TP-02` closes when loading copy/motion uses non-technical wording, deterministic state progression, and zero contradictory labels between voice capture and inference stages.
- `TP-03` closes when `infer-fast` and `infer` both return non-failing structured payloads under timeout, malformed model output, and empty-output simulation.
- `TP-04` closes when EN/ES transcript benchmark set (20+) meets persona/summary acceptance rubric and no generic persona fallback appears above threshold.
- `TP-05` closes when fast/rich routing policy is documented and validated with measured p95 latency gates plus quality acceptance for selected models.
- `TP-06` closes when deploy parity checklist verifies onboarding env var sync on staging/prod/rollback and regression checks assert effective runtime config.
- `TP-07` closes when runtime dashboard + alerts track onboarding success, timeout, fallback, and per-model latency without missing buckets.
- `TP-09` closes when API + client integration tests cover transcript capture -> infer -> persona confirmation -> persistence with contract assertions.
- `TP-12` closes when launch runbook includes limits, fallback behavior, links to monitors/alerts, kill switches, and first-24h incident ownership.
- `TP-13` closes when post-onboarding returns typed activation state (`idle|pending|ready|failed`) and deterministic first-action payload on every completion path.
- `TP-14` closes when mobile/web route users directly to actionable activation state with resume-safe handling across relaunch/background transitions.
- `TP-15` closes when starter-intent generation persists with deterministic idempotency and safe fallback for weak/empty LLM outputs.

---

## 35. Comprehensive Use-Case Coverage Board

This section maps the conceptual product surface in [USE_CASES.md](/Users/cruciblelabs/Documents/openchat/USE_CASES.md) to executable work.

### 35.1 Coverage objective

- [x] Support the full OpenSocial surface across real-time intent, same-day planning, passive discovery, continuity, memory, safety, admin operability, and recurring social-assistant behaviors.

### 35.2 Core use-case coverage

- [x] `U-01` Real-time 1:1 conversation routing and chat lifecycle.
- [x] `U-02` Real-time activity matching with ranking, fanout, and acceptance flow.
- [x] `U-03` Same-day and offline coordination with time, modality, trust, and proximity-aware ranking.
- [x] `U-04` Group formation with threshold logic, backfill, and partial-group handling.
- [x] `U-05` Passive availability mode as a first-class user-facing product surface.
- [x] `U-06` Discovery and exploration recommendations (`tonight`, passive, inbox suggestions, agent recommendations).
- [x] `U-07` Relationship continuity and reconnect surfaces across clients.
- [x] `U-08` Multi-intent decomposition and orchestration from a single user turn.
- [x] `U-09` No-match recovery with widening, retry, follow-up messaging, and alternatives.

### 35.3 Agent and memory coverage

- [x] `U-10` Agentic thread runtime with planning, bounded tools, specialists, streaming, and fallbacks.
- [x] `U-11` User-facing explainable memory controls over life graph, retrieval memory, and agent context.
- [x] `U-12` Structured personalization memory (`life_graph`, retrieval docs/chunks, safe retrieval query path).
- [x] `U-13` Rich explanation surfaces for "why this match", "why this recommendation", and "why not shown" across all clients.

### 35.4 Search, notifications, and trust coverage

- [x] `U-14` Search surfaces for topics, activities, and users as first-class product features.
- [x] `U-15` Notifications, digests, and async follow-up orchestration.
- [x] `U-16` Safety, moderation, and trust boundary enforcement.
- [x] `U-17` Admin/support operability for routing, moderation, sessions, chats, and stuck workflow recovery.

### 35.5 ChatGPT-class social assistant gaps

- [x] `U-18` User-defined recurring tasks and scheduled automations.
- [x] `U-19` Saved searches and scheduled discovery runs.
- [x] `U-20` Topic- or goal-specific recurring digests and agent briefings.
- [x] `U-21` Recurring communities, circles, and repeatable social clusters.
- [x] `U-22` Agent-managed multi-step social plans with explicit approval checkpoints for risky actions.

### 35.6 Near-term execution queue

- [x] `UQ-01` Finish passive availability as an obvious client-side product surface, not just a backend capability.
- [x] `UQ-02` Finish continuity/reconnect surfaces across web/mobile/admin using existing backend discovery and analytics signals.
- [x] `UQ-03` Finish user-facing explanation surfaces for routing, recommendations, and safety/policy outcomes.
- [x] `UQ-04` Implement multi-intent decomposition from a single agent/user turn with safe fanout coordination.
- [x] `UQ-05` Design and implement recurring tasks + scheduled searches v1 (schema, API, worker, notifications, admin visibility).
- [x] `UQ-06` Design recurring circles/communities model and rollout path.

### 35.7 `UQ-05` Implementation Breakdown

- [x] `UQ-05a` Write recurring tasks + scheduled searches v1 implementation spec in [docs/recurring-tasks-v1.md](/Users/cruciblelabs/Documents/openchat/docs/recurring-tasks-v1.md).
- [x] `UQ-05b` Add Prisma schema and migration for `scheduled_tasks`, `scheduled_task_runs`, and `saved_searches`.
- [x] `UQ-05c` Add shared contract schemas and DTOs for recurring task CRUD, run-now, and run history.
- [x] `UQ-05d` Add backend module/service/controller for scheduled task CRUD and run history.
- [x] `UQ-05e` Add `scheduled-tasks` queue plus dispatcher/runner consumers.
- [x] `UQ-05f` Implement v1 task executors for `saved_search` and `discovery_briefing`.
- [x] `UQ-05g` Add notification + agent-thread delivery path for scheduled task outputs.
- [x] `UQ-05h` Add admin inspection endpoints and task/run visibility.
- [x] `UQ-05i` Add launch controls for `scheduled_tasks`, `saved_searches`, and `recurring_briefings`.
- [x] `UQ-05j` Add backend tests for CRUD, scheduling, execution, delivery, and safety boundaries.

### 35.8 `UQ-06` Implementation Breakdown

- [x] `UQ-06a` Write recurring circles v1 design + rollout doc in [docs/recurring-circles-v1.md](/Users/cruciblelabs/Documents/openchat/docs/recurring-circles-v1.md).
- [x] `UQ-06b` Add Prisma schema and migration for `recurring_circles`, `recurring_circle_members`, and `recurring_circle_sessions`.
- [x] `UQ-06c` Add shared contract schemas and DTOs for recurring circles CRUD, membership, and sessions.
- [x] `UQ-06d` Add backend module/service/controller for circle CRUD, member management, and session listing.
- [x] `UQ-06e` Add session open paths (`run-now`, due-session dispatch) with notification fanout.
- [x] `UQ-06f` Add launch control for `recurring_circles` and admin visibility endpoints.
- [x] `UQ-06g` Add backend tests for create, run-now session, and due-session dispatch.
- [x] `UQ-06h` Integrate auto-intent generation + agent-thread publishing for opened sessions.
- [x] `UQ-06i` Add frontend surfaces (web/mobile/admin) for circle management and session participation.

### 35.9 Moderation Command Center Follow-Up

- [x] `M-01` Audit current moderation backend/admin implementation and define moderation-command-center lane.
- [x] `M-02` Add moderation summary + settings admin APIs and richer moderation-queue filters.
- [x] `M-03` Upgrade admin moderation tab into a dashboard with KPIs, settings visibility, filtered queue review, and faster triage entry points.
- [x] `M-04` Add moderator notes / assignee state as first-class persisted fields instead of audit-log-only metadata.
- [x] `M-05` Add moderation analytics slices for false positives, repeat offenders, and SLA/triage latency.
- [ ] `M-06` Add staging/prod moderation drill covering report -> flag -> triage -> enforcement -> audit verification.

### 35.10 Agent Outcome Execution Lane

- [x] `AO-01` Add bounded outcome tools for candidate search, intent persistence, memory writes, conversation start, and follow-up scheduling.
- [x] `AO-02` Ground planner/runtime responses in structured onboarding + profile + preference + memory context instead of UI branching.
- [x] `AO-03` Add bounded group execution tools for `circle.search`, `group.plan`, and `intro.send_request`.
- [x] `AO-04` Add request lifecycle tools for `intro.accept`, `intro.reject`, and `intro.retract`.
- [x] `AO-05` Add circle lifecycle tools for `circle.create` and `circle.join`.
- [x] `AO-06` Add richer execution-memory writes for accepted/rejected/joined outcomes so the agent learns from real social outcomes, not just messages.
- [ ] `AO-07` Add planner guidance + tests for choosing between 1:1 intros, group plans, circles, and follow-up scheduling based on user state and result scarcity.
- [x] `AO-08` Add admin/debug visibility for tool-issued social actions (`intent.persist`, `intro.*`, `circle.*`, `group.plan`, `followup.schedule`) in workflow/audit surfaces.

**Acceptance criteria**
- The agent can move from intent understanding to concrete social execution without leaving the bounded tool model.
- 1:1, group, circle, and follow-up outcomes all route through real backend domain services rather than ad hoc writes.
- Execution actions remain explainable, auditable, and policy-gated.

### 35.11 Agent Outcome Hardening Lane

- [x] `AH-01` Add `availability.lookup` / active-now eligibility tooling so intros and group plans respect real-time availability instead of intent text alone.
- [x] `AH-02` Add scarcity-aware widening tools so the agent can progressively relax constraints before giving up on candidate or circle search.
- [x] `AH-03` Add consented `profile.patch` / preference-update tooling so the agent can turn explicit user corrections into durable defaults.
- [x] `AH-04` Add execution reconciliation for tool-created outcomes so cancelled requests, expired follow-ups, and failed group formation feed back into agent memory and UI state.
- [x] `AH-05` Add outcome telemetry + eval coverage for tool-issued social actions, including acceptance rate, circle join conversion, and follow-up usefulness.
- [x] `AH-06` Add operator replay/debug tooling for blocked or failed social actions so admins can inspect why the planner chose a path and where it stopped.
- [ ] `AH-07` Add production smoke coverage for real-user end-to-end social execution: intent -> candidate search -> intro or circle outcome -> audit trace.

**Acceptance criteria**
- The execution layer adapts when good matches are scarce instead of stalling on the first attempt.
- Explicit user feedback can upgrade profile defaults and future agent plans without brittle UI-only logic.
- Operators can inspect, replay, and measure social execution quality in production.

### 35.12 Trust, Fit, and Market Hardening Lane

- [ ] `TF-01` Add first-class user-facing controls for `languagePreferences`, `countryPreferences`, verified-only matching, and contact style across mobile/web/profile settings.
- [ ] `TF-02` Add reputation and reliability signals to matching/ranking (`reply rate`, `acceptance rate`, `follow-through`, moderation incidents) with bounded weighting and admin visibility.
- [ ] `TF-03` Add sparse-market adaptation so the agent can switch between intros, group plans, circles, and scheduled follow-ups based on supply density instead of using one static strategy.
- [ ] `TF-04` Add language-fit nuance beyond hard filtering: bilingual compatibility, translation tolerance, and explicit opt-in translation behavior for mismatched-language markets.
- [ ] `TF-05` Add market-stage strategy controls (`empty`, `seed`, `healthy`) so agent behavior and ranking wideners adapt per launch region.
- [ ] `TF-06` Add real production operator drills with real-user smoke coverage for trust-sensitive flows: block/unblock, language/country fit, intro lifecycle, circle lifecycle, and moderation audit verification.

**Acceptance criteria**
- Users can clearly control who they are matched with and why, especially across language, region, and safety-sensitive preferences.
- Matching quality improves with real behavioral reliability signals instead of relying only on declared interests.
- The agent adapts honestly in sparse markets and operators can validate trust-sensitive flows before scaling a region.

### 35.13 Client Resilience and Offline Lane

- [x] `CR-01` Add a shared client retry policy for transient network failures with bounded exponential backoff, cancellation, and typed transient/offline request errors in mobile/web API layers.
- [x] `CR-02` Add a persistent offline outbox for high-value user mutations (`intent send`, `agent chat send`, `profile/settings updates`) on mobile, with replay on reconnect and profile-photo carry-through where possible.
- [x] `CR-03` Add reconnect/resume logic for agent SSE and chat sync so clients can recover after internet loss without losing streamed output or unread state.
- [x] `CR-04` Add optimistic pending-state UX for offline or retrying actions so users can see what is queued and when replay will happen automatically.
- [x] `CR-05` Add conflict-resolution and dedupe rules for replayed client mutations, including server-backed `Idempotency-Key` handling for replay-safe intent/profile/global-rules/agent mutations across reconnects and app restarts.
- [x] `CR-06` Add offline-aware bootstrap/auth handling so stored sessions, onboarding completion, and profile restoration degrade gracefully when startup happens without internet.

**Acceptance criteria**
- Losing connectivity does not silently drop core user actions or force the user to rewrite intent/chat messages.
- Reconnect flows resume streaming and chat synchronization predictably with clear user feedback.
- Client retries stay bounded, observable, and safe against duplicate mutation side effects.
