#!/usr/bin/env node

import { spawn } from "node:child_process";

const DIST = {
  types: "packages/protocol-types/dist/index.js",
  events: "packages/protocol-events/dist/index.js",
  client: "packages/protocol-client/dist/index.js",
  server: "packages/protocol-server/dist/index.js",
  agent: "packages/protocol-agent/dist/index.js",
};

const CLIENT_EXAMPLE_DIST = [DIST.types, DIST.client];
const AGENT_EXAMPLE_DIST = [...CLIENT_EXAMPLE_DIST, DIST.agent];
const LOADER_COMMAND =
  "node --loader ./scripts/examples/protocol-example-loader.mjs";

const CLIENT_RUNTIME_PREREQUISITES = [
  "protocol API base URL (`--base-url` or PROTOCOL_BASE_URL)",
];
const BOUND_APP_PREREQUISITES = [
  ...CLIENT_RUNTIME_PREREQUISITES,
  "registered app credentials (`--app-id`/PROTOCOL_APP_ID and `--app-token`/PROTOCOL_APP_TOKEN)",
];
const ACTOR_PREREQUISITES = [
  ...BOUND_APP_PREREQUISITES,
  "actor user (`--actor-user-id` or PROTOCOL_ACTOR_USER_ID)",
];
const AGENT_PREREQUISITES = [
  ...ACTOR_PREREQUISITES,
  "agent grant/readiness state for autonomous work",
];

const PARTNER_EXAMPLES = [
  {
    id: "partner-onboarding",
    lane: "protocol-client",
    sdkLayer: "client",
    path: "scripts/examples/protocol-partner-onboarding.mjs",
    dist: CLIENT_EXAMPLE_DIST,
    prerequisites: CLIENT_RUNTIME_PREREQUISITES,
    proves:
      "Discovery, registration, token issuance, and optional webhook setup flow.",
  },
  {
    id: "partner-actions",
    lane: "protocol-client",
    sdkLayer: "client",
    path: "scripts/examples/protocol-partner-actions.mjs",
    dist: CLIENT_EXAMPLE_DIST,
    prerequisites: ACTOR_PREREQUISITES,
    proves:
      "Bound app client can invoke documented intent, request, chat, connection, and circle actions.",
  },
  {
    id: "webhook-consumer",
    lane: "protocol-client",
    sdkLayer: "client",
    path: "scripts/examples/protocol-webhook-consumer.mjs",
    dist: CLIENT_EXAMPLE_DIST,
    prerequisites: [
      ...CLIENT_RUNTIME_PREREQUISITES,
      "local webhook port/path when serving or registering callbacks",
      "registered app credentials for inspect/register actions",
    ],
    proves:
      "Webhook registration, local consumer handling, delivery inspection, and replay ergonomics.",
  },
  {
    id: "partner-operations",
    lane: "protocol-client",
    sdkLayer: "client",
    path: "scripts/examples/protocol-partner-operations.mjs",
    dist: CLIENT_EXAMPLE_DIST,
    prerequisites: BOUND_APP_PREREQUISITES,
    proves:
      "Operational snapshot, webhook queue visibility, delivery replay, and dead-letter recovery commands.",
  },
  {
    id: "partner-agent",
    lane: "protocol-agent",
    sdkLayer: "agent",
    path: "scripts/examples/protocol-partner-agent.mjs",
    dist: AGENT_EXAMPLE_DIST,
    prerequisites: AGENT_PREREQUISITES,
    proves:
      "Agent client checks readiness before delegated intent/request work.",
  },
  {
    id: "partner-agent-toolset",
    lane: "protocol-agent",
    sdkLayer: "agent",
    path: "scripts/examples/protocol-partner-agent-toolset.mjs",
    dist: AGENT_EXAMPLE_DIST,
    prerequisites: AGENT_PREREQUISITES,
    proves:
      "Agent tool catalog exposes readiness and action tools through the SDK wrapper.",
  },
  {
    id: "partner-agent-toolkit",
    lane: "protocol-agent",
    sdkLayer: "agent",
    path: "scripts/examples/protocol-partner-agent-toolkit.mjs",
    dist: AGENT_EXAMPLE_DIST,
    prerequisites: AGENT_PREREQUISITES,
    proves:
      "Agent toolkit description and tool invocation helpers remain partner-usable.",
  },
].map((example) => ({
  ...example,
  command: `${LOADER_COMMAND} ${example.path}`,
}));

const LANES = [
  {
    id: "protocol-types",
    packageName: "@opensocial/protocol-types",
    dist: DIST.types,
    proves: "Shared schemas and protocol catalog remain parseable.",
  },
  {
    id: "protocol-events",
    packageName: "@opensocial/protocol-events",
    dist: DIST.events,
    proves: "Event catalog stays aligned to the shared protocol schemas.",
  },
  {
    id: "protocol-client",
    packageName: "@opensocial/protocol-client",
    dist: DIST.client,
    proves:
      "Partner transport client covers discovery, registration, grants, webhooks, visibility, replay, and coordination actions.",
    examples: PARTNER_EXAMPLES.filter(
      (example) => example.lane === "protocol-client",
    ),
  },
  {
    id: "protocol-server",
    packageName: "@opensocial/protocol-server",
    dist: DIST.server,
    proves:
      "Server-side protocol helpers and webhook verification stay stable.",
  },
  {
    id: "protocol-agent",
    packageName: "@opensocial/protocol-agent",
    dist: DIST.agent,
    proves:
      "Agent wrapper readiness, toolset, toolkit, grant checks, and token freshness semantics remain stable.",
    examples: PARTNER_EXAMPLES.filter(
      (example) => example.lane === "protocol-agent",
    ),
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
  const selectedExamples = PARTNER_EXAMPLES.filter((example) =>
    lanes.some((lane) => lane.id === example.lane),
  );
  const selectedClientExamples = selectedExamples.filter(
    (example) => example.sdkLayer === "client",
  );
  const selectedAgentExamples = selectedExamples.filter(
    (example) => example.sdkLayer === "agent",
  );

  console.log("SDK readiness pack lanes:");
  for (const lane of lanes) {
    console.log(`- ${lane.id}: ${lane.packageName}`);
    console.log(`  proves: ${lane.proves}`);
    console.log(`  dist: ${lane.dist}`);
    console.log(`  --run command: pnpm --filter ${lane.packageName} test`);
    if (lane.examples) {
      console.log("  partner examples:");
      for (const example of lane.examples) {
        console.log(`    - ${example.id} (${example.sdkLayer})`);
        console.log(`      path: ${example.path}`);
        console.log(`      proves: ${example.proves}`);
        console.log(`      command: ${example.command}`);
      }
    }
  }

  console.log(
    "\nPartner example preflight (dry/list-only; does not execute examples):",
  );

  printExampleGroup("Client examples", selectedClientExamples);
  printExampleGroup("Agent examples", selectedAgentExamples);

  console.log("\nDist prerequisites:");
  if (selectedClientExamples.length > 0) {
    console.log("- Client examples need:");
    for (const dist of CLIENT_EXAMPLE_DIST) {
      console.log(`  - ${dist}`);
    }
  }
  if (selectedAgentExamples.length > 0) {
    console.log("- Agent examples need:");
    for (const dist of AGENT_EXAMPLE_DIST) {
      console.log(`  - ${dist}`);
    }
  }
  console.log(
    "- If a required dist file is missing, the example loader reports the exact missing entry.",
  );

  console.log("\nRuntime prerequisites:");
  if (selectedExamples.length > 0) {
    const clientRuntimePrerequisites =
      selectedClientExamples.length > 0
        ? [
            ...new Set(
              selectedClientExamples.flatMap(
                (example) => example.prerequisites,
              ),
            ),
          ]
        : ACTOR_PREREQUISITES;

    console.log("- Client/runtime base may need:");
    for (const prerequisite of clientRuntimePrerequisites) {
      console.log(`  - ${prerequisite}`);
    }
  }
  if (selectedAgentExamples.length > 0) {
    const agentOnlyPrerequisites = [
      ...new Set(
        selectedAgentExamples
          .flatMap((example) => example.prerequisites)
          .filter(
            (prerequisite) => !ACTOR_PREREQUISITES.includes(prerequisite),
          ),
      ),
    ];

    console.log("- Agent examples also need:");
    for (const prerequisite of agentOnlyPrerequisites) {
      console.log(`  - ${prerequisite}`);
    }
  }

  console.log("\nManual follow-up:");
  console.log("- Keep this command dry by default; it does not run examples.");
  console.log("- Confirm required dist files exist before running an example.");
  console.log(
    "- Set the runtime inputs shown above for the example you choose.",
  );
  console.log(
    "- Run the exact example command manually only when you are ready.",
  );
  console.log(
    "- Run with --run only when you intentionally want to execute package tests.",
  );
  console.log(
    "\nRepository examples import package dist files through scripts/examples/protocol-example-loader.mjs.",
  );
  console.log(
    "Use this output to check client vs agent prerequisites before running an example manually.",
  );
}

function printExampleGroup(label, examples) {
  if (examples.length === 0) {
    return;
  }

  console.log(`\n${label}:`);
  for (const example of examples) {
    console.log(`- ${example.id}: ${example.sdkLayer} example`);
    console.log(`  path: ${example.path}`);
    console.log(`  proves: ${example.proves}`);
    console.log(`  command: ${example.command}`);
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
  const shouldRun = process.argv.includes("--run");

  if (
    process.argv.includes("--list") ||
    process.argv.includes("--preflight") ||
    !shouldRun
  ) {
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
