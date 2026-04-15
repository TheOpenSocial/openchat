#!/usr/bin/env node

import {
  createProtocolAgentClientFromBaseUrl,
  createProtocolAgentToolset,
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
      generatedBy: "scripts/examples/protocol-partner-agent-toolset.mjs",
    },
  });

  const tools = createProtocolAgentToolset(agent);
  logSection(
    "protocol-agent-toolset",
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
  logSection("protocol-agent-toolset", "assert-ready-result", readiness);

  const intent = await createIntentTool.invoke({
    rawText: "Find a thoughtful design conversation this week.",
  });
  logSection("protocol-agent-toolset", "create-intent-result", intent);

  console.log(
    `\n[protocol-agent-toolset] toolset flow complete for appId=${appId} actorUserId=${actorUserId}`,
  );
}

main().catch((error) => {
  console.error("[protocol-agent-toolset] failed");
  console.error(error);
  process.exitCode = 1;
});
