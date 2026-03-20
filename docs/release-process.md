# Release Process

1. Merge to `main` with CI green.
2. Deploy to staging with `.github/workflows/deploy-staging.yml`.
3. Apply DB migrations and seed demo records in staging:
   - `pnpm db:migrate`
   - `pnpm db:seed`
4. Run smoke checklist from `docs/staging-smoke-checklist.md`.
5. Execute manual QA from `docs/manual-qa-script.md`.
6. Verify OpenAI routing/model policy changes (if any) against `docs/openai-model-policy.md` and `apps/api/test/openai-client.spec.ts`.
7. Promote to production with `.github/workflows/deploy-production.yml`.
8. Monitor dashboards and alert channels for 30 minutes.

Rollback path:
- Trigger `.github/workflows/rollback-production.yml` with a known good `rollback_image_tag`.
