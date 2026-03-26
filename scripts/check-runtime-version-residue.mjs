#!/usr/bin/env node
import { spawnSync } from "node:child_process";

const residuePattern = [
  "v2/runtime",
  "RuntimeV2",
  "createIntentV2BodySchema",
  "intentV2ResponseSchema",
  "workflowRunV2ResponseSchema",
  "intent_v2",
  "runtime_v2\\.",
].join("|");

const targets = [
  "apps/api/src/runtime",
  "apps/api/src/app.module.ts",
  "apps/api/test/runtime.service.spec.ts",
  "packages/types/src/index.ts",
  "scripts",
];

function hasRipgrep() {
  const probe = spawnSync("rg", ["--version"], {
    cwd: process.cwd(),
    encoding: "utf8",
    shell: process.platform === "win32",
  });
  return probe.status === 0;
}

function runSearch() {
  if (hasRipgrep()) {
    return spawnSync(
      "rg",
      [
        "-n",
        residuePattern,
        "--glob",
        "!scripts/check-runtime-version-residue.mjs",
        ...targets,
      ],
      {
        cwd: process.cwd(),
        encoding: "utf8",
        shell: process.platform === "win32",
      },
    );
  }

  return spawnSync(
    "grep",
    [
      "-R",
      "-n",
      "-E",
      residuePattern,
      "--exclude=check-runtime-version-residue.mjs",
      ...targets,
    ],
    {
      cwd: process.cwd(),
      encoding: "utf8",
      shell: process.platform === "win32",
    },
  );
}

const result = runSearch();

if (result.status === 0) {
  if (result.stdout) {
    process.stdout.write(result.stdout);
  }
  console.error(
    "\nLegacy runtime v2 residue detected. Remove old runtime naming before release.",
  );
  process.exit(1);
}

if (result.status === 1) {
  console.log("Runtime residue check passed.");
  process.exit(0);
}

if (result.stderr) {
  process.stderr.write(result.stderr);
}
console.error("Runtime residue check failed to execute.");
process.exit(result.status ?? 2);
