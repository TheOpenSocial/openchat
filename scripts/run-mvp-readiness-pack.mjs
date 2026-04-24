#!/usr/bin/env node

import { spawn } from "node:child_process";

const LANES = [
  {
    id: "backend",
    command: ["pnpm", ["test:backend:ops-pack"]],
    description:
      "Operational backend launch pack: release gate, smoke, moderation, protocol recovery, and runbooks.",
    evidence:
      ".artifacts/backend-ops-pack/<run-id>.json plus nested drill artifacts",
    promotes:
      "Backend operational launch pack, protocol recovery, moderation operator loop",
    runsTests: true,
  },
  {
    id: "sdk",
    command: ["pnpm", ["test:sdk:readiness-pack", "--", "--run"]],
    description:
      "Protocol SDK package contracts for types, events, client, server, and agent.",
    evidence: "SDK package test output for each protocol package lane",
    promotes:
      "Protocol client, protocol agent, protocol server/events/types partner surface",
    runsTests: true,
  },
  {
    id: "mobile",
    command: ["pnpm", ["test:mobile:readiness-pack"]],
    description:
      "Focused mobile MVP Maestro lanes for onboarding, settings/protocol, chat, peer profile, and notifications.",
    evidence: "Maestro output for focused mobile promotion lanes",
    promotes:
      "Mobile onboarding, Home shell, Settings/protocol, Chats, Profile, notifications",
    runsTests: true,
  },
  {
    id: "purpose-backend",
    command: ["pnpm", ["test:purpose:scenario-pack", "--", "--backend"]],
    description:
      "Backend sandbox validation for baseline, waiting replies, activity burst, and stalled search.",
    evidence: "Sandbox validation output for each purpose scenario",
    promotes:
      "Backend daily-loop read models and scenario-specific Home/Activity contracts",
    runsTests: true,
  },
  {
    id: "purpose-mobile",
    command: ["pnpm", ["test:purpose:scenario-pack", "--", "--mobile"]],
    description:
      "Mobile sandbox proof for baseline, waiting replies, activity burst, and stalled search.",
    evidence: "Mobile sandbox Maestro output for each purpose scenario",
    promotes: "Mobile daily-loop Home and Activity scenario rendering",
    runsTests: true,
  },
];

const PROMOTION_CHECKS = [
  {
    area: "Mobile signed-out landing",
    readiness: "9/10",
    command: "pnpm test:mobile:readiness-pack -- --lane=auth-landing-current",
    evidence: "Maestro output for the signed-out auth landing lane",
    promotes: "Signed-out landing",
    notes: "Protects the designed video backdrop and cycling title sequence.",
  },
  {
    area: "Mobile onboarding and Home recovery",
    readiness: "8-9/10",
    command:
      "pnpm test:mobile:readiness-pack -- --lane=onboarding-completion,auth-onboarding-home-recovery",
    evidence:
      "Maestro output for first-run onboarding plus auth/onboarding/Home recovery",
    promotes: "Onboarding to Home and Home shell",
    notes:
      "Still requires a non-dev auth/onboarding proof plan before full release confidence.",
  },
  {
    area: "Mobile chats",
    readiness: "9/10",
    command:
      "pnpm test:mobile:readiness-pack -- --lane=chats-thread-current,chats-mutations-current",
    evidence: "Maestro output for thread, modal, reply, edit, reaction, delete",
    promotes: "Chats list, thread core, and thread modal",
    notes: "Use same-window evidence because chat proof is split across lanes.",
  },
  {
    area: "Mobile Profile",
    readiness: "9/10",
    command: "pnpm test:mobile:readiness-pack -- --lane=profile-promotion",
    evidence:
      "Maestro output for profile persistence, preferences, reopen, avatar, peer profile, and chat provenance",
    promotes: "Profile overview, bio, interests, peer profile",
    notes: "Does not change scores until the grouped lane passes.",
  },
  {
    area: "Settings/protocol visibility",
    readiness: "9/10",
    command:
      "pnpm test:mobile:readiness-pack -- --lane=settings-protocol-promotion && pnpm test:sdk:readiness-pack -- --run --lane=protocol-client,protocol-agent && pnpm test:backend:ops-pack",
    evidence:
      "Mobile Settings/protocol Maestro output plus SDK protocol package output plus backend ops artifact",
    promotes:
      "Settings identity, protocol visibility, grants/webhooks/queue/replay confidence",
    notes: "Mobile proves visibility; SDK/backend prove protocol operations.",
  },
  {
    area: "Backend daily-loop read models",
    readiness: "9/10",
    command: "pnpm test:purpose:scenario-pack -- --backend",
    evidence:
      "Sandbox validation output for baseline, waiting_replies, activity_burst, stalled_search",
    promotes: "Backend Daily-loop read models",
    notes: "Requires all four scenario sections plus completion output.",
  },
  {
    area: "Mobile daily-loop scenarios",
    readiness: "9/10",
    command: "pnpm test:purpose:scenario-pack -- --mobile",
    evidence:
      "Mobile sandbox Maestro output for baseline, waiting_replies, activity_burst, stalled_search",
    promotes: "Mobile Daily-loop Home and Activity scenario rendering",
    notes: "Pair with backend scenario evidence for full product confidence.",
  },
  {
    area: "SDK partner examples",
    readiness: "9/10",
    command:
      "pnpm test:sdk:readiness-pack -- --preflight && pnpm test:sdk:readiness-pack -- --run",
    evidence:
      "SDK preflight output plus package test output for protocol types/events/client/server/agent",
    promotes: "SDK Protocol client, agent, server/events/types",
    notes:
      "Manual example execution remains intentional after dist and runtime prerequisites are ready.",
  },
];

function hasFlag(flag) {
  return process.argv.includes(flag);
}

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

function printPromotionPlan() {
  if (hasFlag("--json")) {
    console.log(
      JSON.stringify(
        {
          kind: "mvp-promotion-plan",
          generatedAt: new Date().toISOString(),
          dryRunOnly: true,
          promotionRule:
            "Rows only move to 10/10 after the referenced automation passes in the same release window.",
          checks: PROMOTION_CHECKS,
        },
        null,
        2,
      ),
    );
    return;
  }

  console.log("MVP 10/10 promotion plan:");
  for (const check of PROMOTION_CHECKS) {
    console.log(`- ${check.area} (${check.readiness})`);
    console.log(`  command: ${check.command}`);
    console.log(`  evidence: ${check.evidence}`);
    console.log(`  promotes: ${check.promotes}`);
    console.log(`  note: ${check.notes}`);
  }
  console.log(
    "\nThis is list-only. Run the commands intentionally when credentials, mobile session state, and SDK build prerequisites are ready.",
  );
  console.log(
    "Promotion rule: rows only move to 10/10 after the referenced automation passes in the same release window.",
  );
}

function printLanes(lanes) {
  console.log("MVP readiness pack lanes:");
  for (const lane of lanes) {
    const [command, args] = lane.command;
    console.log(`- ${lane.id}: ${lane.description}`);
    console.log(`  command: ${command} ${args.join(" ")}`);
    console.log(`  evidence: ${lane.evidence}`);
    console.log(`  promotes: ${lane.promotes}`);
  }
  console.log("\nDefault behavior is list-only.");
  console.log("Run with --run when you intentionally want to execute lanes.");
  console.log(
    "Promotion rule: rows only move to 10/10 after the referenced automation passes in the same release window.",
  );
  console.log(
    "Use --promotion-plan to print the exact 9/10-to-10/10 checklist.",
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
  const shouldRun = hasFlag("--run");

  if (hasFlag("--promotion-plan")) {
    printPromotionPlan();
    return;
  }

  if (hasFlag("--list") || !shouldRun) {
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
