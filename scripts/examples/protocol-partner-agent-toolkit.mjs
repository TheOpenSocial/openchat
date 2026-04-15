#!/usr/bin/env node

import {
  createProtocolAgentToolkitFromBaseUrl,
  invokeProtocolAgentTool,
  listProtocolAgentTools,
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
  console.log(`\n[protocol-agent-toolkit] ${title}`);
  console.log(JSON.stringify(value, null, 2));
}

async function main() {
  const toolkit = createProtocolAgentToolkitFromBaseUrl(resolveBaseUrl(), {
    appId: requireEnvOrArg("--app-id", "PROTOCOL_APP_ID", "app id"),
    appToken: requireEnvOrArg("--app-token", "PROTOCOL_APP_TOKEN", "app token"),
    actorUserId: requireEnvOrArg(
      "--actor-user-id",
      "PROTOCOL_ACTOR_USER_ID",
      "actor user id",
    ),
    agentId:
      getArg("--agent-id") || process.env.PROTOCOL_AGENT_ID || "partner.concierge",
    metadata: {
      example: true,
      generatedBy: "scripts/examples/protocol-partner-agent-toolkit.mjs",
    },
  });

  logSection("tool-catalog", listProtocolAgentTools(toolkit));

  const readiness = await invokeProtocolAgentTool(
    toolkit,
    "protocol_agent_assert_ready",
    {
      requireActiveGrant: true,
      failOnDeadLetters: true,
      failOnAuthFailures: true,
    },
  );
  logSection("assert-ready-result", readiness);

  const intent = await invokeProtocolAgentTool(
    toolkit,
    "protocol_agent_create_intent",
    {
      rawText: "Find a thoughtful design conversation this week.",
    },
  );
  logSection("create-intent-result", intent);
}

main().catch((error) => {
  console.error("[protocol-agent-toolkit] failed");
  console.error(error);
  process.exitCode = 1;
});
