# Release Process

Required GitHub environment secrets:

- `staging` environment: `STAGING_SSH_KEY`, `STAGING_HOST`, `STAGING_USER`, `STAGING_DEPLOY_PATH`, `OPENAI_API_KEY`, `DATABASE_URL`
- `production` environment: `PRODUCTION_SSH_KEY`, `PRODUCTION_HOST`, `PRODUCTION_USER`, `PRODUCTION_DEPLOY_PATH`, `OPENAI_API_KEY`, `DATABASE_URL`
- Optional for image-based deploys and rollbacks: `GHCR_USERNAME`, `GHCR_TOKEN`

1. Merge to `main` with CI green.
2. For faster deploys, manually trigger `.github/workflows/build-images.yml` with an `image_tag` and publish:
   - `ghcr.io/<owner>/opensocial-api:<image_tag>`
   - `ghcr.io/<owner>/opensocial-admin:<image_tag>`
   - `ghcr.io/<owner>/opensocial-web:<image_tag>`
3. Manually trigger staging deploy from GitHub Actions using `.github/workflows/deploy-staging.yml`:
   - `deploy_mode=images` and the three GHCR image references for the fastest path
   - or `deploy_mode=build` to build on the target host
4. Apply DB migrations and seed demo records in staging:
   - `pnpm db:migrate`
   - `pnpm db:seed`
5. Run smoke checklist from `docs/staging-smoke-checklist.md`.
6. Execute manual QA from `docs/manual-qa-script.md`.
7. Verify OpenAI routing/model policy changes (if any) against `docs/openai-model-policy.md` and `apps/api/test/openai-client.spec.ts`.
8. Manually trigger production deploy from GitHub Actions using `.github/workflows/deploy-production.yml`:
   - `deploy_mode=images` and the same three image references is the recommended path
   - `deploy_mode=build` remains available as a fallback
9. Monitor dashboards and alert channels for 30 minutes.

Rollback path:

- Trigger `.github/workflows/rollback-production.yml` with either:
  - `deploy_mode=images` and a known good set of image refs
  - or `deploy_mode=build` and a known good `rollback_ref`
