#!/usr/bin/env node

import {
  bindProtocolAppClient,
  createProtocolClientFromBaseUrl,
} from "@opensocial/protocol-client";
import {
  logSection,
  resolveOptionalStringArg,
  resolveRequiredStringArg,
  resolveProtocolBaseUrl,
} from "./protocol-example-args.mjs";

function createClient(baseUrl) {
  return createProtocolClientFromBaseUrl(baseUrl);
}

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
  const connectionType = resolveOptionalStringArg({
    flag: "--connection-type",
    envName: "PROTOCOL_CONNECTION_TYPE",
  });
  const originIntentId = resolveOptionalStringArg({
    flag: "--origin-intent-id",
    envName: "PROTOCOL_ORIGIN_INTENT_ID",
  });
  const chatId = resolveOptionalStringArg({
    flag: "--chat-id",
    envName: "PROTOCOL_CHAT_ID",
  });
  const chatConnectionId = resolveOptionalStringArg({
    flag: "--chat-connection-id",
    envName: "PROTOCOL_CHAT_CONNECTION_ID",
  });
  const circleTitle = resolveOptionalStringArg({
    flag: "--circle-title",
    envName: "PROTOCOL_CIRCLE_TITLE",
  });
  const circleId = resolveOptionalStringArg({
    flag: "--circle-id",
    envName: "PROTOCOL_CIRCLE_ID",
  });
  const cancelIntent = ["1", "true", "yes"].includes(
    String(
      resolveOptionalStringArg({
        flag: "--cancel-intent",
        envName: "PROTOCOL_CANCEL_INTENT",
        fallback: "0",
      }),
    ).toLowerCase(),
  );
  const client = createClient(baseUrl);
  const app = bindProtocolAppClient(client, {
    appId,
    appToken,
  });

  const exampleMetadata = {
    example: true,
    generatedBy: "scripts/examples/protocol-partner-actions.mjs",
  };

  const intent = await app.createIntent({
    actorUserId,
    rawText: "Meet thoughtful product and design people this week.",
    metadata: exampleMetadata,
  });
  logSection("protocol-example", "intent-created", intent);

  const updatedIntent = await app.updateIntent(intent.intentId, {
    actorUserId,
    rawText:
      "Meet thoughtful product, design, and engineering people this week.",
    metadata: exampleMetadata,
  });
  logSection("protocol-example", "intent-updated", updatedIntent);

  if (recipientUserId) {
    const request = await app.sendRequest({
      actorUserId,
      intentId: intent.intentId,
      recipientUserId,
      metadata: exampleMetadata,
    });
    logSection("protocol-example", "request-sent", request);
  }

  if (connectionType === "dm" || connectionType === "group") {
    const connection = await app.createConnection({
      actorUserId,
      type: connectionType,
      originIntentId: originIntentId ?? intent.intentId,
      metadata: exampleMetadata,
    });
    logSection("protocol-example", "connection-created", connection);
  }

  if (chatConnectionId) {
    const chat = await app.createChat({
      actorUserId,
      connectionId: chatConnectionId,
      type: "dm",
      metadata: exampleMetadata,
    });
    logSection("protocol-example", "chat-created", chat);
  }

  if (chatId) {
    const chatMessage = await app.sendChatMessage(chatId, {
      actorUserId,
      body: "Partner onboarding example message from the protocol client.",
      metadata: exampleMetadata,
    });
    logSection("protocol-example", "chat-message", chatMessage);
  }

  if (circleTitle) {
    const circle = await app.createCircle({
      actorUserId,
      title: circleTitle,
      description:
        "A sample circle created through the shipped protocol-client action surface.",
      cadence: {
        kind: "weekly",
        days: ["thu"],
        hour: 18,
        minute: 0,
        timezone: "America/Argentina/Buenos_Aires",
      },
      metadata: exampleMetadata,
    });
    logSection("protocol-example", "circle-created", circle);

    const joined = await app.joinCircle(circle.circleId, {
      actorUserId,
      memberUserId: actorUserId,
      role: "member",
      metadata: exampleMetadata,
    });
    logSection("protocol-example", "circle-joined", joined);
  }

  if (circleId) {
    const left = await app.leaveCircle(circleId, {
      actorUserId,
      memberUserId: actorUserId,
      metadata: exampleMetadata,
    });
    logSection("protocol-example", "circle-left", left);
  }

  if (cancelIntent) {
    const cancelledIntent = await app.cancelIntent(intent.intentId, {
      actorUserId,
      metadata: exampleMetadata,
    });
    logSection("protocol-example", "intent-cancelled", cancelledIntent);
  }

  const usage = await app.getAppUsageSummary();
  logSection("protocol-example", "usage-summary", usage);

  console.log(
    `\n[protocol-example] partner actions complete for appId=${appId}`,
  );
}

main().catch((error) => {
  console.error("[protocol-example] partner actions failed");
  console.error(error);
  process.exitCode = 1;
});
