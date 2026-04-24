#!/usr/bin/env node

import { spawn } from "node:child_process";

const SCENARIOS = [
  {
    id: "baseline",
    purpose: "Open the app and understand the normal active/waiting state.",
    backendExpectation:
      "Home has an active or waiting tone plus coordination or a top suggestion.",
    mobileExpectation:
      "Home status and Activity sections render from the sandbox read model.",
  },
  {
    id: "waiting_replies",
    purpose: "See that requests are waiting on other people, not on you.",
    backendExpectation:
      'Home coordination card says "Waiting on replies" and does not jump to chat.',
    mobileExpectation:
      "Home communicates waiting state and Activity remains reachable.",
  },
  {
    id: "activity_burst",
    purpose: "Open Activity and understand what changed while away.",
    backendExpectation: "Activity summary contains unread notifications.",
    mobileExpectation:
      "Activity opens with the expected high-signal section and quick links.",
  },
  {
    id: "stalled_search",
    purpose:
      "Recover when matching stalls instead of getting vague agent noise.",
    backendExpectation:
      "Home has recovery tone and exposes a structured recovery spotlight.",
    mobileExpectation:
      "Home shows recovery guidance and Activity navigation still works.",
  },
];

function getArg(flag, fallback = undefined) {
  const exact = `${flag}=`;
  for (const value of process.argv.slice(2)) {
    if (value.startsWith(exact)) {
      return value.slice(exact.length);
    }
  }
  return fallback;
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

function hasFlag(flag) {
  return process.argv.includes(flag);
}

function selectedScenarios() {
  const requested = getFlagValues("--scenario")
    .flatMap((value) => value.split(","))
    .map((value) => value.trim())
    .filter(Boolean);

  if (requested.length === 0) {
    return SCENARIOS;
  }

  const knownIds = new Set(SCENARIOS.map((scenario) => scenario.id));
  const unknown = requested.filter((id) => !knownIds.has(id));
  if (unknown.length > 0) {
    throw new Error(
      `Unknown purpose scenario: ${unknown.join(", ")}. Use --list to see supported scenarios.`,
    );
  }

  const requestedSet = new Set(requested);
  return SCENARIOS.filter((scenario) => requestedSet.has(scenario.id));
}

function printScenarios(scenarios) {
  console.log("Purpose scenario pack:");
  for (const scenario of scenarios) {
    console.log(`- ${scenario.id}: ${scenario.purpose}`);
    console.log(`  backend: ${scenario.backendExpectation}`);
    console.log(`  mobile: ${scenario.mobileExpectation}`);
  }
  console.log("\nCommands:");
  console.log("  pnpm test:purpose:scenario-pack -- --backend");
  console.log(
    "  pnpm test:purpose:scenario-pack -- --mobile --scenario=baseline",
  );
  console.log("  pnpm test:purpose:scenario-pack -- --backend --mobile");
  console.log(
    "  pnpm test:purpose:scenario-pack -- --backend --world-id=design-sandbox-v1 --base-url=https://api.opensocial.so",
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

async function runBackendScenario(scenario, config) {
  console.log(`\n==> backend:${scenario.id}`);
  const args = [
    "playground:sandbox",
    "--",
    "--action=validate",
    `--world-id=${config.worldId}`,
    `--scenario=${scenario.id}`,
  ];
  if (config.baseUrl) {
    args.push(`--base-url=${config.baseUrl}`);
  }
  await run("pnpm", args);
}

async function runMobileScenario(scenario, config) {
  console.log(`\n==> mobile:${scenario.id}`);
  const args = [
    "test:mobile:sandbox:maestro",
    "--",
    `--scenario=${scenario.id}`,
    `--flow=${config.flow}`,
    `--app-id=${config.appId}`,
    `--world-id=${config.worldId}`,
  ];
  if (config.baseUrl) {
    args.push(`--base-url=${config.baseUrl}`);
  }
  await run("pnpm", args);
}

async function main() {
  const scenarios = selectedScenarios();
  const runBackend = hasFlag("--backend");
  const runMobile = hasFlag("--mobile");
  const config = {
    appId: getArg("--app-id", "host.exp.Exponent"),
    baseUrl: getArg("--base-url", ""),
    flow: getArg("--flow", "sandbox-surface"),
    worldId: getArg("--world-id", "design-sandbox-v1"),
  };

  if (hasFlag("--list") || (!runBackend && !runMobile)) {
    printScenarios(scenarios);
    return;
  }

  for (const scenario of scenarios) {
    if (runBackend) {
      await runBackendScenario(scenario, config);
    }
    if (runMobile) {
      await runMobileScenario(scenario, config);
    }
  }

  console.log("\nPurpose scenario pack completed.");
}

main().catch((error) => {
  console.error(error?.message ?? error);
  process.exitCode = 1;
});
