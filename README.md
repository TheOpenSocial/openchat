# OpenSocial / Working-name — Production Spec Pack

This folder is the agent handoff pack for building the product from zero to production.

## Reading order
1. `00_overview.md`
2. `01_product_prd.md`
3. `02_core_concepts.md`
4. `03_user_flows.md`
5. `DESIGN.md`
6. `05_system_architecture.md`
7. `06_ai_agent_architecture.md`
8. `07_matching_and_routing.md`
9. `08_data_model_and_schema.md`
10. `09_jobs_queues_and_workflows.md`
11. `10_api_contracts.md`
12. `11_auth_profiles_and_media.md`
13. `12_realtime_chat_presence.md`
14. `13_safety_trust_and_moderation.md`
15. `14_infrastructure_environments_and_delivery.md`
16. `15_observability_slos_and_incident_response.md`
17. `16_security_threat_model.md`
18. `17_ai_policy_prompts_evals_and_costs.md`
19. `18_testing_quality_and_release_gates.md`
20. `19_privacy_compliance_and_data_lifecycle.md`
21. `20_admin_ops_support_and_feature_flags.md`
22. `21_implementation_plan.md`
23. `22_repo_structure_and_coding_standards.md`
24. `99_references.md`

## Frontend design source of truth
- `DESIGN.md` is the canonical implementation-facing design reference for web and admin
- `04_design.md` and `04_design_system.md` remain as legacy spec context

## Product one-liner
Users express what they want to do or talk about in natural language, and the system routes them to relevant people in real time through explicit, opt-in human connection.

## Primary constraint
AI never impersonates the user in live chat. AI interprets, routes, ranks, safeguards, and coordinates. Humans talk to humans.

## Target stack
- TypeScript
- NestJS
- PostgreSQL + pgvector
- Redis + BullMQ
- WebSocket gateway layer
- OpenAI Responses API + Agents SDK
- Google OAuth / OIDC for sign-in
- Object storage + CDN for profile media
- OpenTelemetry-based observability

## Delivery principle
Build a safe, durable, event-driven system first. Add agent sophistication on top of deterministic rails, not instead of them.


## Added in v2
- 23_personalization_and_user_rules.md
- 24_notifications_delivery_and_digests.md
- 25_search_discovery_and_recommendations.md
- 26_media_profile_image_pipeline.md
- 27_client_apps_web_mobile.md
- 28_analytics_experimentation_and_growth.md
- 29_prod_readiness_checklist.md

## Monorepo Commands
- `pnpm install`
- `pnpm dev`
- `pnpm build`
- `pnpm lint`
- `pnpm typecheck`
- `pnpm test`

## Workspace Layout
- `apps/api` NestJS API + workers entrypoint
- `apps/mobile` Expo React Native app (set `EXPO_PUBLIC_DESIGN_MOCK=1` to run the full UI on local mock data without the API)
- `apps/admin` Next.js admin app
- `apps/web` Next.js web shell (`NEXT_PUBLIC_DESIGN_MOCK=1` for full mock UI without the API)
- `packages/types` shared enums, DTOs, zod schemas
- `packages/openai` typed OpenAI integration layer
- `packages/ui` shared UI tokens/components primitives
- `packages/config` shared app configuration
- `packages/testing` shared testing helpers
- `prisma` database schema and migrations
