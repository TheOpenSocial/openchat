#!/usr/bin/env node
import { spawnSync } from "node:child_process";

const checks = [
  {
    name: "Runtime naming residue guard",
    cmd: "node",
    args: ["scripts/check-runtime-version-residue.mjs"],
  },
  {
    name: "API typecheck",
    cmd: "pnpm",
    args: ["--filter", "@opensocial/api", "typecheck"],
  },
  {
    name: "API lint",
    cmd: "pnpm",
    args: ["--filter", "@opensocial/api", "lint"],
  },
  {
    name: "OpenAI package contracts",
    cmd: "pnpm",
    args: ["--filter", "@opensocial/openai", "exec", "vitest", "run"],
  },
  {
    name: "API endpoint contracts",
    cmd: "pnpm",
    args: [
      "--filter",
      "@opensocial/api",
      "exec",
      "vitest",
      "run",
      "test/onboarding-agent.contract.spec.ts",
      "test/runtime.controller.spec.ts",
      "test/runtime.service.spec.ts",
    ],
  },
  {
    name: "Agent/OpenAI regressions",
    cmd: "pnpm",
    args: [
      "--filter",
      "@opensocial/api",
      "exec",
      "vitest",
      "run",
      "test/openai-client.spec.ts",
      "test/agent-conversation.service.spec.ts",
    ],
  },
];

for (const check of checks) {
  console.log(`\n==> ${check.name}`);
  const result = spawnSync(check.cmd, check.args, {
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  if (result.status !== 0) {
    console.error(`\nRelease check failed at: ${check.name}`);
    process.exit(result.status ?? 1);
  }
}

console.log("\nRelease check passed.");
