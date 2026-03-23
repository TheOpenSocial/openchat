import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("Deployment pipeline artifacts", () => {
  const root = resolve(process.cwd(), "../..");

  const stagingWorkflow = readFileSync(
    resolve(root, ".github/workflows/deploy-staging.yml"),
    "utf8",
  );
  const productionWorkflow = readFileSync(
    resolve(root, ".github/workflows/deploy-production.yml"),
    "utf8",
  );
  const rollbackWorkflow = readFileSync(
    resolve(root, ".github/workflows/rollback-production.yml"),
    "utf8",
  );
  const buildImagesWorkflow = readFileSync(
    resolve(root, ".github/workflows/build-images.yml"),
    "utf8",
  );

  const stagingScript = readFileSync(
    resolve(root, "scripts/deploy-staging.sh"),
    "utf8",
  );
  const productionScript = readFileSync(
    resolve(root, "scripts/deploy-production.sh"),
    "utf8",
  );
  const rollbackScript = readFileSync(
    resolve(root, "scripts/deploy-rollback.sh"),
    "utf8",
  );

  const hasAny = (value: string, candidates: string[]) =>
    candidates.some((candidate) => value.includes(candidate));

  it("defines staging and production deploy workflows", () => {
    expect(stagingWorkflow).toContain("name: Deploy Staging");
    expect(productionWorkflow).toContain("name: Deploy Production");
    expect(buildImagesWorkflow).toContain("name: Build Images");
  });

  it("passes OpenAI secret from GitHub Actions into deploy/rollback jobs", () => {
    expect(stagingWorkflow).toContain(
      "OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}",
    );
    expect(productionWorkflow).toContain(
      "OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}",
    );
    expect(rollbackWorkflow).toContain(
      "OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}",
    );
  });

  it("passes onboarding LLM provider env into deploy/rollback jobs", () => {
    expect(stagingWorkflow).toContain(
      "ONBOARDING_LLM_PROVIDER: ${{ secrets.ONBOARDING_LLM_PROVIDER }}",
    );
    expect(stagingWorkflow).toContain(
      "ONBOARDING_LLM_BASE_URL: ${{ secrets.ONBOARDING_LLM_BASE_URL }}",
    );
    expect(stagingWorkflow).toContain(
      "ONBOARDING_LLM_API_KEY: ${{ secrets.ONBOARDING_LLM_API_KEY }}",
    );
    expect(stagingWorkflow).toContain(
      "ONBOARDING_LLM_MODEL: ${{ secrets.ONBOARDING_LLM_MODEL }}",
    );
    expect(stagingWorkflow).toContain(
      "ONBOARDING_LLM_FAST_MODEL: ${{ secrets.ONBOARDING_LLM_FAST_MODEL }}",
    );
    expect(stagingWorkflow).toContain(
      "ONBOARDING_LLM_RICH_MODEL: ${{ secrets.ONBOARDING_LLM_RICH_MODEL }}",
    );
    expect(stagingWorkflow).toContain(
      "ONBOARDING_LLM_TIMEOUT_MS: ${{ secrets.ONBOARDING_LLM_TIMEOUT_MS }}",
    );
    expect(stagingWorkflow).toContain(
      "ONBOARDING_LLM_RICH_TIMEOUT_MS: ${{ secrets.ONBOARDING_LLM_RICH_TIMEOUT_MS }}",
    );
    expect(stagingWorkflow).toContain(
      "ONBOARDING_PROBE_TOKEN: ${{ secrets.ONBOARDING_PROBE_TOKEN }}",
    );
    expect(productionWorkflow).toContain(
      "ONBOARDING_LLM_PROVIDER: ${{ secrets.ONBOARDING_LLM_PROVIDER }}",
    );
    expect(productionWorkflow).toContain(
      "ONBOARDING_LLM_BASE_URL: ${{ secrets.ONBOARDING_LLM_BASE_URL }}",
    );
    expect(productionWorkflow).toContain(
      "ONBOARDING_LLM_API_KEY: ${{ secrets.ONBOARDING_LLM_API_KEY }}",
    );
    expect(productionWorkflow).toContain(
      "ONBOARDING_LLM_MODEL: ${{ secrets.ONBOARDING_LLM_MODEL }}",
    );
    expect(productionWorkflow).toContain(
      "ONBOARDING_LLM_FAST_MODEL: ${{ secrets.ONBOARDING_LLM_FAST_MODEL }}",
    );
    expect(productionWorkflow).toContain(
      "ONBOARDING_LLM_RICH_MODEL: ${{ secrets.ONBOARDING_LLM_RICH_MODEL }}",
    );
    expect(productionWorkflow).toContain(
      "ONBOARDING_LLM_TIMEOUT_MS: ${{ secrets.ONBOARDING_LLM_TIMEOUT_MS }}",
    );
    expect(productionWorkflow).toContain(
      "ONBOARDING_LLM_RICH_TIMEOUT_MS: ${{ secrets.ONBOARDING_LLM_RICH_TIMEOUT_MS }}",
    );
    expect(productionWorkflow).toContain(
      "ONBOARDING_PROBE_TOKEN: ${{ secrets.ONBOARDING_PROBE_TOKEN }}",
    );
    expect(rollbackWorkflow).toContain(
      "ONBOARDING_LLM_PROVIDER: ${{ secrets.ONBOARDING_LLM_PROVIDER }}",
    );
    expect(rollbackWorkflow).toContain(
      "ONBOARDING_LLM_BASE_URL: ${{ secrets.ONBOARDING_LLM_BASE_URL }}",
    );
    expect(rollbackWorkflow).toContain(
      "ONBOARDING_LLM_API_KEY: ${{ secrets.ONBOARDING_LLM_API_KEY }}",
    );
    expect(rollbackWorkflow).toContain(
      "ONBOARDING_LLM_MODEL: ${{ secrets.ONBOARDING_LLM_MODEL }}",
    );
    expect(rollbackWorkflow).toContain(
      "ONBOARDING_LLM_FAST_MODEL: ${{ secrets.ONBOARDING_LLM_FAST_MODEL }}",
    );
    expect(rollbackWorkflow).toContain(
      "ONBOARDING_LLM_RICH_MODEL: ${{ secrets.ONBOARDING_LLM_RICH_MODEL }}",
    );
    expect(rollbackWorkflow).toContain(
      "ONBOARDING_LLM_TIMEOUT_MS: ${{ secrets.ONBOARDING_LLM_TIMEOUT_MS }}",
    );
    expect(rollbackWorkflow).toContain(
      "ONBOARDING_LLM_RICH_TIMEOUT_MS: ${{ secrets.ONBOARDING_LLM_RICH_TIMEOUT_MS }}",
    );
    expect(rollbackWorkflow).toContain(
      "ONBOARDING_PROBE_TOKEN: ${{ secrets.ONBOARDING_PROBE_TOKEN }}",
    );
  });

  it("passes DATABASE_URL secret from GitHub Actions into deploy/rollback jobs", () => {
    expect(stagingWorkflow).toContain(
      "DATABASE_URL: ${{ secrets.DATABASE_URL }}",
    );
    expect(productionWorkflow).toContain(
      "DATABASE_URL: ${{ secrets.DATABASE_URL }}",
    );
    expect(rollbackWorkflow).toContain(
      "DATABASE_URL: ${{ secrets.DATABASE_URL }}",
    );
  });

  it("passes Google OAuth secrets into deploy/rollback jobs", () => {
    expect(stagingWorkflow).toContain(
      "GOOGLE_CLIENT_ID: ${{ secrets.GOOGLE_CLIENT_ID }}",
    );
    expect(stagingWorkflow).toContain(
      "GOOGLE_CLIENT_SECRET: ${{ secrets.GOOGLE_CLIENT_SECRET }}",
    );
    expect(productionWorkflow).toContain(
      "GOOGLE_CLIENT_ID: ${{ secrets.GOOGLE_CLIENT_ID }}",
    );
    expect(productionWorkflow).toContain(
      "GOOGLE_CLIENT_SECRET: ${{ secrets.GOOGLE_CLIENT_SECRET }}",
    );
    expect(rollbackWorkflow).toContain(
      "GOOGLE_CLIENT_ID: ${{ secrets.GOOGLE_CLIENT_ID }}",
    );
    expect(rollbackWorkflow).toContain(
      "GOOGLE_CLIENT_SECRET: ${{ secrets.GOOGLE_CLIENT_SECRET }}",
    );
    expect(stagingWorkflow).toContain(
      "GOOGLE_REDIRECT_URI: https://api.opensocial.so/api/auth/google/callback",
    );
    expect(productionWorkflow).toContain(
      "GOOGLE_REDIRECT_URI: https://api.opensocial.so/api/auth/google/callback",
    );
    expect(rollbackWorkflow).toContain(
      "GOOGLE_REDIRECT_URI: https://api.opensocial.so/api/auth/google/callback",
    );
  });

  it("runs database migrations during deploy", () => {
    expect(
      hasAny(stagingScript, ["pnpm db:migrate", "prisma:migrate:deploy"]),
    ).toBe(true);
    expect(
      hasAny(productionScript, ["pnpm db:migrate", "prisma:migrate:deploy"]),
    ).toBe(true);
  });

  it("provides explicit rollback workflow and script", () => {
    expect(rollbackWorkflow).toContain("name: Rollback Production");
    expect(hasAny(rollbackScript, ["ROLLBACK_IMAGE_TAG", "ROLLBACK_REF"])).toBe(
      true,
    );
  });

  it("supports registry-backed image deploys", () => {
    expect(buildImagesWorkflow).toContain("ghcr.io");
    expect(stagingWorkflow).toContain("DEPLOY_MODE");
    expect(productionWorkflow).toContain("DEPLOY_MODE");
    expect(rollbackWorkflow).toContain("DEPLOY_MODE");
    expect(stagingWorkflow).toContain("GHCR_TOKEN");
    expect(productionWorkflow).toContain("GHCR_TOKEN");
    expect(rollbackWorkflow).toContain("GHCR_TOKEN");
  });

  it("syncs runtime OpenAI secret into remote env file before compose deploy", () => {
    expect(stagingScript).toContain('sync_remote_env_var "OPENAI_API_KEY"');
    expect(productionScript).toContain('sync_remote_env_var "OPENAI_API_KEY"');
    expect(rollbackScript).toContain('sync_remote_env_var "OPENAI_API_KEY"');
  });

  it("syncs onboarding LLM env into runtime env file before compose deploy", () => {
    expect(stagingScript).toContain(
      'sync_remote_env_var "ONBOARDING_LLM_PROVIDER"',
    );
    expect(stagingScript).toContain(
      'sync_remote_env_var "ONBOARDING_LLM_BASE_URL"',
    );
    expect(stagingScript).toContain(
      'sync_remote_env_var "ONBOARDING_LLM_API_KEY"',
    );
    expect(stagingScript).toContain(
      'sync_remote_env_var "ONBOARDING_LLM_MODEL"',
    );
    expect(stagingScript).toContain(
      'sync_remote_env_var "ONBOARDING_LLM_FAST_MODEL"',
    );
    expect(stagingScript).toContain(
      'sync_remote_env_var "ONBOARDING_LLM_RICH_MODEL"',
    );
    expect(stagingScript).toContain(
      'sync_remote_env_var "ONBOARDING_LLM_TIMEOUT_MS"',
    );
    expect(stagingScript).toContain(
      'sync_remote_env_var "ONBOARDING_LLM_RICH_TIMEOUT_MS"',
    );
    expect(stagingScript).toContain(
      'sync_remote_env_var "ONBOARDING_PROBE_TOKEN"',
    );
    expect(productionScript).toContain(
      'sync_remote_env_var "ONBOARDING_LLM_PROVIDER"',
    );
    expect(productionScript).toContain(
      'sync_remote_env_var "ONBOARDING_LLM_BASE_URL"',
    );
    expect(productionScript).toContain(
      'sync_remote_env_var "ONBOARDING_LLM_API_KEY"',
    );
    expect(productionScript).toContain(
      'sync_remote_env_var "ONBOARDING_LLM_MODEL"',
    );
    expect(productionScript).toContain(
      'sync_remote_env_var "ONBOARDING_LLM_FAST_MODEL"',
    );
    expect(productionScript).toContain(
      'sync_remote_env_var "ONBOARDING_LLM_RICH_MODEL"',
    );
    expect(productionScript).toContain(
      'sync_remote_env_var "ONBOARDING_LLM_TIMEOUT_MS"',
    );
    expect(productionScript).toContain(
      'sync_remote_env_var "ONBOARDING_LLM_RICH_TIMEOUT_MS"',
    );
    expect(productionScript).toContain(
      'sync_remote_env_var "ONBOARDING_PROBE_TOKEN"',
    );
    expect(rollbackScript).toContain(
      'sync_remote_env_var "ONBOARDING_LLM_PROVIDER"',
    );
    expect(rollbackScript).toContain(
      'sync_remote_env_var "ONBOARDING_LLM_BASE_URL"',
    );
    expect(rollbackScript).toContain(
      'sync_remote_env_var "ONBOARDING_LLM_API_KEY"',
    );
    expect(rollbackScript).toContain(
      'sync_remote_env_var "ONBOARDING_LLM_MODEL"',
    );
    expect(rollbackScript).toContain(
      'sync_remote_env_var "ONBOARDING_LLM_FAST_MODEL"',
    );
    expect(rollbackScript).toContain(
      'sync_remote_env_var "ONBOARDING_LLM_RICH_MODEL"',
    );
    expect(rollbackScript).toContain(
      'sync_remote_env_var "ONBOARDING_LLM_TIMEOUT_MS"',
    );
    expect(rollbackScript).toContain(
      'sync_remote_env_var "ONBOARDING_LLM_RICH_TIMEOUT_MS"',
    );
    expect(rollbackScript).toContain(
      'sync_remote_env_var "ONBOARDING_PROBE_TOKEN"',
    );
  });

  it("syncs DATABASE_URL into runtime env file before compose deploy", () => {
    expect(stagingScript).toContain('sync_remote_env_var "DATABASE_URL"');
    expect(productionScript).toContain('sync_remote_env_var "DATABASE_URL"');
    expect(rollbackScript).toContain('sync_remote_env_var "DATABASE_URL"');
  });

  it("syncs Google OAuth env into runtime env file before compose deploy", () => {
    expect(stagingScript).toContain('sync_remote_env_var "GOOGLE_CLIENT_ID"');
    expect(stagingScript).toContain(
      'sync_remote_env_var "GOOGLE_CLIENT_SECRET"',
    );
    expect(stagingScript).toContain(
      'sync_remote_env_var "GOOGLE_REDIRECT_URI"',
    );
    expect(productionScript).toContain(
      'sync_remote_env_var "GOOGLE_CLIENT_ID"',
    );
    expect(productionScript).toContain(
      'sync_remote_env_var "GOOGLE_CLIENT_SECRET"',
    );
    expect(productionScript).toContain(
      'sync_remote_env_var "GOOGLE_REDIRECT_URI"',
    );
    expect(rollbackScript).toContain('sync_remote_env_var "GOOGLE_CLIENT_ID"');
    expect(rollbackScript).toContain(
      'sync_remote_env_var "GOOGLE_CLIENT_SECRET"',
    );
    expect(rollbackScript).toContain(
      'sync_remote_env_var "GOOGLE_REDIRECT_URI"',
    );
  });
});
