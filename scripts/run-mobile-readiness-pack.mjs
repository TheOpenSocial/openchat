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
    name: "auth-onboarding-home-recovery",
    description:
      "Fresh incomplete-session onboarding, Home shell handoff, Activity hop, and Home recovery",
    flow: "apps/mobile/.maestro/mobile-auth-onboarding-home-recovery.yaml",
  },
  {
    name: "profile-persistence-current",
    description: "Profile overview, bio, location, and interests persistence",
    script: "test:e2e:maestro:profile-persistence:current",
  },
  {
    name: "profile-preferences-current",
    description: "Profile match preferences save and shell return",
    script: "test:e2e:maestro:profile-preferences:current",
  },
  {
    name: "profile-preferences-reopen-current",
    description: "Profile match preferences close and reopen persistence",
    script: "test:e2e:maestro:profile-preferences-reopen:current",
  },
  {
    name: "profile-photo-current",
    description: "Profile avatar update path and visible update marker",
    script: "test:e2e:maestro:profile-photo:current",
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
    name: "settings-photo-current",
    description: "Settings avatar update path and visible update marker",
    script: "test:e2e:maestro:settings-photo:current",
  },
  {
    name: "chats-thread-current",
    description: "Seeded chat, reply banner, thread modal, and peer profile",
    script: "test:e2e:maestro:chats-thread:current",
  },
  {
    name: "chats-mutations-current",
    description: "Seeded chat edit, reaction, and delete mutation coverage",
    script: "test:e2e:maestro:chats-mutations:current",
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

const GROUPS = [
  {
    name: "profile-promotion",
    description:
      "Same-window promotion group for Profile overview, bio, interests, preferences, avatar, and peer-profile traversal",
    lanes: [
      "profile-persistence-current",
      "profile-preferences-current",
      "profile-preferences-reopen-current",
      "profile-photo-current",
      "other-profile-current",
      "chats-thread-current",
    ],
  },
  {
    name: "settings-protocol-promotion",
    description:
      "Same-window promotion group for Settings identity, reopen persistence, avatar, and protocol visibility summaries",
    lanes: [
      "settings-current",
      "settings-reopen-current",
      "settings-photo-current",
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
    return LANES.filter((lane) => !lane.optional);
  }

  const knownNames = new Set(LANES.map((lane) => lane.name));
  const knownGroups = new Map(GROUPS.map((group) => [group.name, group]));
  const unknown = requested.filter(
    (name) => !knownNames.has(name) && !knownGroups.has(name),
  );

  if (unknown.length > 0) {
    throw new Error(
      `Unknown mobile readiness lane/group: ${unknown.join(", ")}. Use --list to see available lanes and groups.`,
    );
  }

  const requestedSet = new Set();
  for (const name of requested) {
    const group = knownGroups.get(name);
    if (group) {
      group.lanes.forEach((laneName) => requestedSet.add(laneName));
      continue;
    }
    requestedSet.add(name);
  }

  return LANES.filter((lane) => requestedSet.has(lane.name));
}

function printLanes(lanes = LANES) {
  console.log("Mobile readiness pack lanes:");
  for (const lane of lanes) {
    const optionalLabel = lane.optional ? " (optional)" : "";
    console.log(`- ${lane.name}${optionalLabel}: ${lane.description}`);
    if (lane.script) {
      console.log(`  pnpm --filter @opensocial/mobile ${lane.script}`);
      continue;
    }
    console.log(`  maestro test ${lane.flow}`);
  }

  if (lanes === LANES) {
    console.log("\nMobile readiness promotion groups:");
    for (const group of GROUPS) {
      console.log(`- ${group.name}: ${group.description}`);
      console.log(`  expands to: ${group.lanes.join(", ")}`);
    }
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
    const hasLaneFilter = getFlagValues("--lane").length > 0;
    printLanes(hasLaneFilter ? lanes : LANES);
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
    if (lane.script) {
      await run("pnpm", ["--filter", "@opensocial/mobile", lane.script], {
        env,
      });
      continue;
    }
    await run("maestro", ["test", lane.flow], { env });
  }

  console.log("\nMobile readiness pack completed.");
}

main().catch((error) => {
  console.error(error?.message ?? error);
  process.exitCode = 1;
});
