#!/usr/bin/env node

import {
  assertProtocolAgentReady,
  createProtocolAgentClientFromBaseUrl,
} from "@opensocial/protocol-agent";
import {
  logSection,
  resolveRequiredStringArg,
  resolveOptionalStringArg,
  resolveProtocolBaseUrl,
} from "./protocol-example-args.mjs";

async function main() {
  const baseUrl = resolveProtocolBaseUrl();
  const appId = resolveRequiredStringArg({
    flag: "--app-id",
    envName: "PROTOCOL_APP_ID",
    errorMessage: "Missing app id. Set --app-id or PROTOCOL_APP_ID.",
  });
  const appToken = resolveRequiredStringArg({
    flag: "--app-token",
    envName: "PROTOCOL_APP_TOKEN",
    errorMessage: "Missing app token. Set --app-token or PROTOCOL_APP_TOKEN.",
  });
  const actorUserId = resolveRequiredStringArg({
    flag: "--actor-user-id",
    envName: "PROTOCOL_ACTOR_USER_ID",
    errorMessage:
      "Missing actor user id. Set --actor-user-id or PROTOCOL_ACTOR_USER_ID.",
  });
  const recipientUserId = resolveOptionalStringArg({
    flag: "--recipient-user-id",
    envName: "PROTOCOL_RECIPIENT_USER_ID",
  });
  const agentId =
    resolveOptionalStringArg({
      flag: "--agent-id",
      envName: "PROTOCOL_AGENT_ID",
      fallback: "partner.concierge",
    }) || "partner.concierge";

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
  logSection("protocol-agent-example", "readiness", readiness);
  assertProtocolAgentReady(readiness);

  const intent = await agent.createIntent({
    rawText: "Find a thoughtful design conversation this week.",
  });
  logSection("protocol-agent-example", "intent-created", intent);

  const updatedIntent = await agent.updateIntent(intent.intentId, {
    rawText: "Find a thoughtful design or product conversation this week.",
  });
  logSection("protocol-agent-example", "intent-updated", updatedIntent);

  if (recipientUserId) {
    const request = await agent.sendRequest({
      intentId: intent.intentId,
      recipientUserId,
    });
    logSection("protocol-agent-example", "request-sent", request);
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
