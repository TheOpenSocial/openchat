#!/usr/bin/env node

import {
  assertProtocolAgentReady,
  createProtocolAgentClientFromBaseUrl,
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

function optionalArg(flag, envName) {
  return getArg(flag) || process.env[envName];
}

function logSection(title, value) {
  console.log(`\n[protocol-agent-example] ${title}`);
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
  const recipientUserId = optionalArg(
    "--recipient-user-id",
    "PROTOCOL_RECIPIENT_USER_ID",
  );
  const agentId =
    optionalArg("--agent-id", "PROTOCOL_AGENT_ID") || "partner.concierge";

  const agent = createProtocolAgentClientFromBaseUrl(baseUrl, {
    appId,
    appToken,
    actorUserId,
    agentId,
    metadata: {
      example: true,
      generatedBy: "scripts/examples/protocol-partner-agent.mjs",
    },
  });

  const readiness = await agent.checkReadiness({
    requireActiveGrant: true,
    failOnDeadLetters: true,
    failOnAuthFailures: true,
  });
  logSection("readiness", readiness);
  assertProtocolAgentReady(readiness);

  const intent = await agent.createIntent({
    rawText: "Find a thoughtful design conversation this week.",
  });
  logSection("intent-created", intent);

  const updatedIntent = await agent.updateIntent(intent.intentId, {
    rawText: "Find a thoughtful design or product conversation this week.",
  });
  logSection("intent-updated", updatedIntent);

  if (recipientUserId) {
    const request = await agent.sendRequest({
      intentId: intent.intentId,
      recipientUserId,
    });
    logSection("request-sent", request);
  }

  console.log(
    `\n[protocol-agent-example] agent flow complete for appId=${appId} actorUserId=${actorUserId}`,
  );
}

main().catch((error) => {
  console.error("[protocol-agent-example] failed");
  console.error(error);
  process.exitCode = 1;
});
