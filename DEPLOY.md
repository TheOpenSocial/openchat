# Deploy

OpenSocial deploys through GitHub Actions, not directly from a local shell by default.

## Workflows

- Staging: [`.github/workflows/deploy-staging.yml`](/Users/cruciblelabs/Documents/openchat/.github/workflows/deploy-staging.yml)
- Production: [`.github/workflows/deploy-production.yml`](/Users/cruciblelabs/Documents/openchat/.github/workflows/deploy-production.yml)
- Optional image build/push: [`.github/workflows/build-images.yml`](/Users/cruciblelabs/Documents/openchat/.github/workflows/build-images.yml)

## Environments

GitHub environment secrets are expected to be configured:

- `staging`
  - `STAGING_SSH_KEY`
  - `STAGING_HOST`
  - `STAGING_USER`
  - `STAGING_DEPLOY_PATH`
  - `OPENAI_API_KEY`
  - `DATABASE_URL`
  - optional smoke/verification secrets used by staging verification

- `production`
  - `OPENAI_API_KEY`
  - `DATABASE_URL`
  - `GHCR_USERNAME`
  - `GHCR_TOKEN`

Production runs on a self-hosted runner labeled:

- `self-hosted`
- `linux`
- `x64`
- `opensocial-prod`

The production workflow performs a local deploy on that runner into `/opt/opensocial`.

## Normal release path

1. Commit the changes you want to deploy.
2. Push the branch/ref to GitHub.
3. If using image-based deploys, trigger `Build Images` first with an `image_tag`.
4. Trigger `Deploy Staging`.
5. Verify staging.
6. Trigger `Deploy Production`.

## Important constraint

GitHub Actions cannot deploy uncommitted local changes. The code must exist on a pushed Git ref before the workflow can deploy it.

## GitHub CLI examples

Build images:

```bash
gh workflow run "Build Images" --ref <branch-or-main> -f image_tag=<tag>
```

Deploy staging from source build:

```bash
gh workflow run "Deploy Staging" --ref <branch-or-main> -f deploy_mode=build
```

Deploy production from source build:

```bash
gh workflow run "Deploy Production" --ref <branch-or-main> -f deploy_mode=build
```

Deploy using prebuilt images:

```bash
gh workflow run "Deploy Production" --ref <branch-or-main> \
  -f deploy_mode=images \
  -f api_image=ghcr.io/theopensocial/opensocial-api:<tag> \
  -f admin_image=ghcr.io/theopensocial/opensocial-admin:<tag> \
  -f web_image=ghcr.io/theopensocial/opensocial-web:<tag> \
  -f docs_image=ghcr.io/theopensocial/opensocial-docs:<tag>
```

The production deploy now also:

- verifies local ingress for `api.opensocial.so` and `docs.opensocial.so`
- fails the rollout if the API health route is unavailable
- fails the rollout if docs redirects leak `http://` or the internal `:3003` port
- retries health probes across the brief TLS warm-up window after restart so transient Caddy handshakes do not produce false negatives
- emits API/docs/nginx logs automatically when that verification fails
- routes public hosts through explicit Compose network aliases so reverse proxies do not depend on ambiguous short service names

## Repo-specific note for this session

The onboarding inference/backend/mobile changes discussed in this thread have been implemented locally, but they are not deployable through GitHub Actions until they are committed and pushed to a remote ref.
