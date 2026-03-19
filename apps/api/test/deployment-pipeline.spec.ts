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

  it("defines staging and production deploy workflows", () => {
    expect(stagingWorkflow).toContain("name: Deploy Staging");
    expect(productionWorkflow).toContain("name: Deploy Production");
  });

  it("runs database migrations during deploy", () => {
    expect(stagingScript).toContain("pnpm db:migrate");
    expect(productionScript).toContain("pnpm db:migrate");
  });

  it("provides explicit rollback workflow and script", () => {
    expect(rollbackWorkflow).toContain("name: Rollback Production");
    expect(rollbackScript).toContain("ROLLBACK_IMAGE_TAG");
  });
});
