#!/usr/bin/env node

import { spawn } from "node:child_process";

const DEFAULT_APP_ID = "host.exp.Exponent";
const DEFAULT_EXPO_URL = "exp://localhost:8090";

const LANES = [
  {
    name: "auth-landing-current",
    description:
      "Designed landing video, cycling title sequence, and sign-in CTA",
    optional: true,
    script: "test:e2e:maestro:auth-landing:current",
  },
  {
    name: "onboarding-completion",
    description: "Fresh incomplete-session onboarding into Home and shell",
    script: "test:e2e:maestro:onboarding-completion",
  },
  {
    name: "settings-current",
    description: "Settings save plus protocol visibility summaries",
    script: "test:e2e:maestro:settings-persistence:current",
  },
  {
    name: "settings-reopen-current",
    description: "Settings save, close, reopen, and protocol reassertion",
    script: "test:e2e:maestro:settings-reopen:current",
  },
  {
    name: "chats-thread-current",
    description: "Seeded chat, reply banner, thread modal, and peer profile",
    script: "test:e2e:maestro:chats-thread:current",
  },
  {
    name: "other-profile-current",
    description: "Peer profile open, provenance copy, actions, and close",
    script: "test:e2e:maestro:other-profile:current",
  },
  {
    name: "notifications-entry-current",
    description: "Notification bell entry into Activity",
    script: "test:e2e:maestro:notifications-entry:current",
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
    return LANES.filter((lane) => !lane.optional);
  }

  const knownNames = new Set(LANES.map((lane) => lane.name));
  const unknown = requested.filter((name) => !knownNames.has(name));

  if (unknown.length > 0) {
    throw new Error(
      `Unknown mobile readiness lane: ${unknown.join(", ")}. Use --list to see available lanes.`,
    );
  }

  const requestedSet = new Set(requested);
  return LANES.filter((lane) => requestedSet.has(lane.name));
}

function printLanes(lanes = LANES) {
  console.log("Mobile readiness pack lanes:");
  for (const lane of lanes) {
    const optionalLabel = lane.optional ? " (optional)" : "";
    console.log(`- ${lane.name}${optionalLabel}: ${lane.description}`);
    console.log(`  pnpm --filter @opensocial/mobile ${lane.script}`);
  }
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

  if (process.argv.includes("--list")) {
    printLanes(lanes);
    return;
  }

  const env = {
    ...process.env,
    MAESTRO_APP_ID: process.env.MAESTRO_APP_ID || DEFAULT_APP_ID,
    MAESTRO_EXPO_URL: process.env.MAESTRO_EXPO_URL || DEFAULT_EXPO_URL,
  };

  console.log(
    `Running ${lanes.length} mobile readiness lane(s) with MAESTRO_APP_ID=${env.MAESTRO_APP_ID}`,
  );
  console.log(
    "This runner expects the mobile app/session to already be booted correctly for the selected lanes.",
  );

  for (const lane of lanes) {
    console.log(`\n==> ${lane.name}`);
    console.log(lane.description);
    await run("pnpm", ["--filter", "@opensocial/mobile", lane.script], {
      env,
    });
  }

  console.log("\nMobile readiness pack completed.");
}

main().catch((error) => {
  console.error(error?.message ?? error);
  process.exitCode = 1;
});
