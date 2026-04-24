#!/usr/bin/env node

import { spawn } from "node:child_process";

const LANES = [
  {
    id: "protocol-types",
    packageName: "@opensocial/protocol-types",
    dist: "packages/protocol-types/dist/index.js",
    proves: "Shared schemas and protocol catalog remain parseable.",
  },
  {
    id: "protocol-events",
    packageName: "@opensocial/protocol-events",
    dist: "packages/protocol-events/dist/index.js",
    proves: "Event catalog stays aligned to the shared protocol schemas.",
  },
  {
    id: "protocol-client",
    packageName: "@opensocial/protocol-client",
    dist: "packages/protocol-client/dist/index.js",
    proves:
      "Partner transport client covers discovery, registration, grants, webhooks, visibility, replay, and coordination actions.",
  },
  {
    id: "protocol-server",
    packageName: "@opensocial/protocol-server",
    dist: "packages/protocol-server/dist/index.js",
    proves:
      "Server-side protocol helpers and webhook verification stay stable.",
  },
  {
    id: "protocol-agent",
    packageName: "@opensocial/protocol-agent",
    dist: "packages/protocol-agent/dist/index.js",
    proves:
      "Agent wrapper readiness, toolset, toolkit, grant checks, and token freshness semantics remain stable.",
    examples: [
      "node --loader ./scripts/examples/protocol-example-loader.mjs scripts/examples/protocol-partner-agent.mjs",
      "node --loader ./scripts/examples/protocol-example-loader.mjs scripts/examples/protocol-partner-agent-toolset.mjs",
      "node --loader ./scripts/examples/protocol-example-loader.mjs scripts/examples/protocol-partner-agent-toolkit.mjs",
    ],
  },
];

function getFlagValues(flag) {
  const values = [];
  const args = process.argv.slice(2);

  for (let index = 0; index < args.length; index += 1) {
    const value = args[index];
    if (value === flag && args[index + 1]) {
      values.push(args[index + 1]);
      index += 1;
      continue;
    }
    if (value.startsWith(`${flag}=`)) {
      values.push(value.slice(flag.length + 1));
    }
  }

  return values;
}

function selectedLanes() {
  const requested = getFlagValues("--lane")
    .flatMap((value) => value.split(","))
    .map((value) => value.trim())
    .filter(Boolean);

  if (requested.length === 0) {
    return LANES;
  }

  const knownIds = new Set(LANES.map((lane) => lane.id));
  const unknown = requested.filter((id) => !knownIds.has(id));
  if (unknown.length > 0) {
    throw new Error(
      `Unknown SDK lane: ${unknown.join(", ")}. Use --list to see available lanes.`,
    );
  }

  const requestedSet = new Set(requested);
  return LANES.filter((lane) => requestedSet.has(lane.id));
}

function printLanes(lanes) {
  console.log("SDK readiness pack lanes:");
  for (const lane of lanes) {
    console.log(`- ${lane.id}: ${lane.packageName}`);
    console.log(`  proves: ${lane.proves}`);
    console.log(`  dist: ${lane.dist}`);
    console.log(`  command: pnpm --filter ${lane.packageName} test`);
    if (lane.examples) {
      console.log("  runnable examples:");
      for (const example of lane.examples) {
        console.log(`    ${example}`);
      }
    }
  }
  console.log("\nDefault behavior is list-only.");
  console.log("Run with --run when you intentionally want to execute tests.");
  console.log(
    "Repository examples import package dist files through scripts/examples/protocol-example-loader.mjs.",
  );
}

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd ?? process.cwd(),
      env: options.env ?? process.env,
      stdio: "inherit",
    });

    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(
        new Error(`${command} ${args.join(" ")} failed with code ${code}`),
      );
    });
    child.on("error", reject);
  });
}

async function main() {
  const lanes = selectedLanes();
  const shouldRun = process.argv.includes("--run");

  if (process.argv.includes("--list") || !shouldRun) {
    printLanes(lanes);
    return;
  }

  for (const lane of lanes) {
    console.log(`\n==> ${lane.id}`);
    await run("pnpm", ["--filter", lane.packageName, "test"]);
  }

  console.log("\nSDK readiness pack completed.");
}

main().catch((error) => {
  console.error(error?.message ?? error);
  process.exitCode = 1;
});
