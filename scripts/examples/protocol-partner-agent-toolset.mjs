#!/usr/bin/env node

import {
  createProtocolAgentClientFromBaseUrl,
  createProtocolAgentToolset,
} from "@opensocial/protocol-agent";

function getArg(flag, fallback = undefined) {
  const exact = `${flag}=`;
  for (const value of process.argv.slice(2)) {
    if (value.startsWith(exact)) {
      return value.slice(exact.length);
    }
  }
  return fallback;
}

function resolveBaseUrl() {
  const value =
    getArg("--base-url") ||
    process.env.PROTOCOL_BASE_URL ||
    process.env.PLAYGROUND_BASE_URL ||
    process.env.SMOKE_BASE_URL ||
    process.env.STAGING_API_BASE_URL ||
    process.env.API_BASE_URL;
  if (!value) {
    throw new Error(
      "Missing base URL. Set --base-url or PROTOCOL_BASE_URL / PLAYGROUND_BASE_URL / SMOKE_BASE_URL / STAGING_API_BASE_URL / API_BASE_URL.",
    );
  }
  return value.replace(/\/+$/, "");
}

function requireEnvOrArg(flag, envName, label) {
  const provided = getArg(flag) || process.env[envName];
  if (!provided) {
    throw new Error(`Missing ${label}. Set ${flag} or ${envName}.`);
  }
  return provided;
}

function logSection(title, value) {
  console.log(`\n[protocol-agent-toolset] ${title}`);
  console.log(JSON.stringify(value, null, 2));
}

async function main() {
  const baseUrl = resolveBaseUrl();
  const appId = requireEnvOrArg("--app-id", "PROTOCOL_APP_ID", "app id");
  const appToken = requireEnvOrArg(
    "--app-token",
    "PROTOCOL_APP_TOKEN",
    "app token",
  );
  const actorUserId = requireEnvOrArg(
    "--actor-user-id",
    "PROTOCOL_ACTOR_USER_ID",
    "actor user id",
  );
  const agentId =
    getArg("--agent-id") || process.env.PROTOCOL_AGENT_ID || "partner.concierge";

  const agent = createProtocolAgentClientFromBaseUrl(baseUrl, {
    appId,
    appToken,
    actorUserId,
    agentId,
    metadata: {
      example: true,
      generatedBy: "scripts/examples/protocol-partner-agent-toolset.mjs",
    },
  });

  const tools = createProtocolAgentToolset(agent);
  logSection(
    "tool-catalog",
    tools.map((tool) => ({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema,
    })),
  );

  const assertReadyTool = tools.find(
    (tool) => tool.name === "protocol_agent_assert_ready",
  );
  const createIntentTool = tools.find(
    (tool) => tool.name === "protocol_agent_create_intent",
  );

  if (!assertReadyTool || !createIntentTool) {
    throw new Error("Missing expected protocol agent tools.");
  }

  const readiness = await assertReadyTool.invoke({
    requireActiveGrant: true,
    failOnDeadLetters: true,
    failOnAuthFailures: true,
  });
  logSection("assert-ready-result", readiness);

  const intent = await createIntentTool.invoke({
    rawText: "Find a thoughtful design conversation this week.",
  });
  logSection("create-intent-result", intent);

  console.log(
    `\n[protocol-agent-toolset] toolset flow complete for appId=${appId} actorUserId=${actorUserId}`,
  );
}

main().catch((error) => {
  console.error("[protocol-agent-toolset] failed");
  console.error(error);
  process.exitCode = 1;
});
