# Release Process

1. Merge to `main` with CI green.
2. Deploy to staging with `.github/workflows/deploy-staging.yml`.
3. Run smoke checklist from `docs/staging-smoke-checklist.md`.
4. Promote to production with `.github/workflows/deploy-production.yml`.
5. Monitor dashboards and alert channels for 30 minutes.

Rollback path:
- Trigger `.github/workflows/rollback-production.yml` with a known good `rollback_image_tag`.
