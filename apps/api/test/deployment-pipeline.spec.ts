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

  it("syncs runtime OpenAI secret into remote env file before compose deploy", () => {
    expect(stagingScript).toContain('sync_remote_env_var "OPENAI_API_KEY"');
    expect(productionScript).toContain('sync_remote_env_var "OPENAI_API_KEY"');
    expect(rollbackScript).toContain('sync_remote_env_var "OPENAI_API_KEY"');
  });
});
