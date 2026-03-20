# Release Process

Required GitHub environment secrets:
- `staging` environment: `STAGING_SSH_KEY`, `STAGING_HOST`, `STAGING_USER`, `STAGING_DEPLOY_PATH`, `OPENAI_API_KEY`
- `production` environment: `PRODUCTION_SSH_KEY`, `PRODUCTION_HOST`, `PRODUCTION_USER`, `PRODUCTION_DEPLOY_PATH`, `OPENAI_API_KEY`

1. Merge to `main` with CI green.
2. Manually trigger staging deploy from GitHub Actions using `.github/workflows/deploy-staging.yml` (`Run workflow`).
3. Apply DB migrations and seed demo records in staging:
   - `pnpm db:migrate`
   - `pnpm db:seed`
4. Run smoke checklist from `docs/staging-smoke-checklist.md`.
5. Execute manual QA from `docs/manual-qa-script.md`.
6. Verify OpenAI routing/model policy changes (if any) against `docs/openai-model-policy.md` and `apps/api/test/openai-client.spec.ts`.
7. Manually trigger production deploy from GitHub Actions using `.github/workflows/deploy-production.yml` (`Run workflow`).
8. Monitor dashboards and alert channels for 30 minutes.

Rollback path:
- Trigger `.github/workflows/rollback-production.yml` with a known good `rollback_image_tag`.
