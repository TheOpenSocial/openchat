#!/usr/bin/env node

import { createProtocolClient } from "@opensocial/protocol-client";

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

function resolveAppId() {
  const provided = getArg("--app-id") || process.env.PROTOCOL_APP_ID;
  if (!provided) {
    throw new Error("Missing app id. Set --app-id or PROTOCOL_APP_ID.");
  }
  return provided;
}

function resolveAppToken() {
  const provided = getArg("--app-token") || process.env.PROTOCOL_APP_TOKEN;
  if (!provided) {
    throw new Error("Missing app token. Set --app-token or PROTOCOL_APP_TOKEN.");
  }
  return provided;
}

function resolveActorUserId() {
  const provided =
    getArg("--actor-user-id") || process.env.PROTOCOL_ACTOR_USER_ID;
  if (!provided) {
    throw new Error(
      "Missing actor user id. Set --actor-user-id or PROTOCOL_ACTOR_USER_ID.",
    );
  }
  return provided;
}

function resolveRecipientUserId() {
  return getArg("--recipient-user-id") || process.env.PROTOCOL_RECIPIENT_USER_ID;
}

function resolveChatId() {
  return getArg("--chat-id") || process.env.PROTOCOL_CHAT_ID;
}

function resolveCircleTitle() {
  return getArg("--circle-title") || process.env.PROTOCOL_CIRCLE_TITLE;
}

function resolveCircleId() {
  return getArg("--circle-id") || process.env.PROTOCOL_CIRCLE_ID;
}

function createTransport(baseUrl) {
  return {
    request: (path, init) => fetch(`${baseUrl}${path}`, init),
  };
}

function createClient(baseUrl) {
  return createProtocolClient(createTransport(baseUrl));
}

function logSection(title, value) {
  console.log(`\n[protocol-example] ${title}`);
  console.log(JSON.stringify(value, null, 2));
}

async function main() {
  const baseUrl = resolveBaseUrl();
  const appId = resolveAppId();
  const appToken = resolveAppToken();
  const actorUserId = resolveActorUserId();
  const recipientUserId = resolveRecipientUserId();
  const chatId = resolveChatId();
  const circleTitle = resolveCircleTitle();
  const circleId = resolveCircleId();
  const client = createClient(baseUrl);

  const intent = await client.createIntent(appId, appToken, {
    actorUserId,
    title: "Partner onboarding intent",
    summary:
      "Demonstrates the shipped protocol-client surface for creating a core coordination intent.",
    metadata: {
      example: true,
      generatedBy: "scripts/examples/protocol-partner-actions.mjs",
    },
  });
  logSection("intent-created", intent);

  if (recipientUserId) {
    const request = await client.sendRequest(appId, appToken, {
      actorUserId,
      intentId: intent.intentId,
      recipientUserId,
      metadata: {
        example: true,
        generatedBy: "scripts/examples/protocol-partner-actions.mjs",
      },
    });
    logSection("request-sent", request);
  }

  if (chatId) {
    const chatMessage = await client.sendChatMessage(
      appId,
      appToken,
      chatId,
      {
        actorUserId,
        body: "Partner onboarding example message from the protocol client.",
        metadata: {
          example: true,
          generatedBy: "scripts/examples/protocol-partner-actions.mjs",
        },
      },
    );
    logSection("chat-message", chatMessage);
  }

  if (circleTitle) {
    const circle = await client.createCircle(appId, appToken, {
      actorUserId,
      title: circleTitle,
      description:
        "A sample circle created through the shipped protocol-client action surface.",
      metadata: {
        example: true,
        generatedBy: "scripts/examples/protocol-partner-actions.mjs",
      },
    });
    logSection("circle-created", circle);

    const joined = await client.joinCircle(appId, appToken, circle.circleId, {
      actorUserId,
      memberUserId: actorUserId,
      role: "member",
      metadata: {
        example: true,
        generatedBy: "scripts/examples/protocol-partner-actions.mjs",
      },
    });
    logSection("circle-joined", joined);
  }

  if (circleId) {
    const left = await client.leaveCircle(appId, appToken, circleId, {
      actorUserId,
      memberUserId: actorUserId,
      metadata: {
        example: true,
        generatedBy: "scripts/examples/protocol-partner-actions.mjs",
      },
    });
    logSection("circle-left", left);
  }

  const usage = await client.getAppUsageSummary(appId, appToken);
  logSection("usage-summary", usage);

  console.log(`\n[protocol-example] partner actions complete for appId=${appId}`);
}

main().catch((error) => {
  console.error("[protocol-example] partner actions failed");
  console.error(error);
  process.exitCode = 1;
});
