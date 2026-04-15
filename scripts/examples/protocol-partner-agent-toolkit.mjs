#!/usr/bin/env node

import {
  createProtocolAgentToolkitFromBaseUrl,
  describeProtocolAgentToolkit,
  invokeProtocolAgentTool,
} from "@opensocial/protocol-agent";
import {
  logSection,
  resolveRequiredStringArg,
  resolveOptionalStringArg,
  resolveProtocolBaseUrl,
} from "./protocol-example-args.mjs";

async function main() {
  const toolkit = createProtocolAgentToolkitFromBaseUrl(
    resolveProtocolBaseUrl(),
    {
      appId: resolveRequiredStringArg({
        flag: "--app-id",
        envName: "PROTOCOL_APP_ID",
        errorMessage: "Missing app id. Set --app-id or PROTOCOL_APP_ID.",
      }),
      appToken: resolveRequiredStringArg({
        flag: "--app-token",
        envName: "PROTOCOL_APP_TOKEN",
        errorMessage:
          "Missing app token. Set --app-token or PROTOCOL_APP_TOKEN.",
      }),
      actorUserId: resolveRequiredStringArg({
        flag: "--actor-user-id",
        envName: "PROTOCOL_ACTOR_USER_ID",
        errorMessage:
          "Missing actor user id. Set --actor-user-id or PROTOCOL_ACTOR_USER_ID.",
      }),
      agentId: resolveOptionalStringArg({
        flag: "--agent-id",
        envName: "PROTOCOL_AGENT_ID",
        fallback: "partner.concierge",
      }),
      metadata: {
        example: true,
        generatedBy: "scripts/examples/protocol-partner-agent-toolkit.mjs",
      },
    },
  );

  logSection(
    "protocol-agent-toolkit",
    "toolkit-summary",
    describeProtocolAgentToolkit(toolkit),
  );

  const readiness = await invokeProtocolAgentTool(
    toolkit,
    "protocol_agent_assert_ready",
    {
      requireActiveGrant: true,
      failOnDeadLetters: true,
      failOnAuthFailures: true,
    },
  );
  logSection("protocol-agent-toolkit", "assert-ready-result", readiness);

  const intent = await invokeProtocolAgentTool(
    toolkit,
    "protocol_agent_create_intent",
    {
      rawText: "Find a thoughtful design conversation this week.",
    },
  );
  logSection("protocol-agent-toolkit", "create-intent-result", intent);
}

main().catch((error) => {
  console.error("[protocol-agent-toolkit] failed");
  console.error(error);
  process.exitCode = 1;
});
