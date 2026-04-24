#!/usr/bin/env node

import { spawn } from "node:child_process";

const LANES = [
  {
    id: "backend",
    command: ["pnpm", ["test:backend:ops-pack"]],
    description:
      "Operational backend launch pack: release gate, smoke, moderation, protocol recovery, and runbooks.",
    runsTests: true,
  },
  {
    id: "sdk",
    command: ["pnpm", ["test:sdk:readiness-pack", "--", "--run"]],
    description:
      "Protocol SDK package contracts for types, events, client, server, and agent.",
    runsTests: true,
  },
  {
    id: "mobile",
    command: ["pnpm", ["test:mobile:readiness-pack"]],
    description:
      "Focused mobile MVP Maestro lanes for onboarding, settings/protocol, chat, peer profile, and notifications.",
    runsTests: true,
  },
  {
    id: "purpose-backend",
    command: ["pnpm", ["test:purpose:scenario-pack", "--", "--backend"]],
    description:
      "Backend sandbox validation for baseline, waiting replies, activity burst, and stalled search.",
    runsTests: true,
  },
  {
    id: "purpose-mobile",
    command: ["pnpm", ["test:purpose:scenario-pack", "--", "--mobile"]],
    description:
      "Mobile sandbox proof for baseline, waiting replies, activity burst, and stalled search.",
    runsTests: true,
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
      `Unknown MVP readiness lane: ${unknown.join(", ")}. Use --list to see available lanes.`,
    );
  }

  const requestedSet = new Set(requested);
  return LANES.filter((lane) => requestedSet.has(lane.id));
}

function printLanes(lanes) {
  console.log("MVP readiness pack lanes:");
  for (const lane of lanes) {
    const [command, args] = lane.command;
    console.log(`- ${lane.id}: ${lane.description}`);
    console.log(`  command: ${command} ${args.join(" ")}`);
  }
  console.log("\nDefault behavior is list-only.");
  console.log("Run with --run when you intentionally want to execute lanes.");
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

  console.warn(
    "Running MVP readiness lanes. This can execute tests, Maestro, and deployed-environment checks.",
  );

  for (const lane of lanes) {
    const [command, args] = lane.command;
    console.log(`\n==> ${lane.id}`);
    await run(command, args);
  }

  console.log("\nMVP readiness pack completed.");
}

main().catch((error) => {
  console.error(error?.message ?? error);
  process.exitCode = 1;
});
