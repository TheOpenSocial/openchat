import assert from "node:assert/strict";
import test from "node:test";

import { createProtocolClient } from "../dist/index.js";

const MANIFEST_PROTOCOL_ID = "opensocial.manifest.v1";
const APP_REGISTRATION_PROTOCOL_ID = "opensocial.app-registration.v1";

function buildTransport(responseBody) {
  const requests = [];
  const transport = {
    async request(path, init) {
      requests.push({ path, init });
      return new Response(JSON.stringify(responseBody), {
        headers: {
          "content-type": "application/json",
        },
      });
    },
  };

  return { requests, transport };
}

function baseCapabilities() {
  return {
    scopes: [],
    resources: [],
    actions: [],
    events: [],
    capabilities: [],
    canActAsAgent: false,
    canManageWebhooks: false,
  };
}

function baseManifest() {
  return {
    protocolId: MANIFEST_PROTOCOL_ID,
    manifestId: "manifest-01",
    appId: "app-01",
    name: "Protocol Bridge",
    version: "1.0.0",
    categories: [],
    capabilities: baseCapabilities(),
    resources: [],
    actions: [],
    events: [],
    webhooks: [],
    agent: {
      enabled: false,
      modes: [],
      requiresHumanApproval: true,
    },
    metadata: {},
  };
}

function baseRegistration() {
  return {
    protocolId: APP_REGISTRATION_PROTOCOL_ID,
    appId: "app-01",
    name: "Protocol Bridge",
  };
}

function normalizedRegistration() {
  return {
    ...baseRegistration(),
    kind: "web",
    status: "draft",
    redirectUris: [],
    capabilities: baseCapabilities(),
    metadata: {},
  };
}

test("getManifest requests the manifest endpoint and unwraps the envelope", async () => {
  const manifest = baseManifest();
  const { requests, transport } = buildTransport({ data: manifest });
  const client = createProtocolClient(transport);

  const result = await client.getManifest();

  assert.deepStrictEqual(result, manifest);
  assert.deepStrictEqual(requests, [
    {
      path: "/protocol/manifest",
      init: undefined,
    },
  ]);
});

test("registerApp posts the full registration request payload", async () => {
  const registration = baseRegistration();
  const manifest = baseManifest();
  const expectedRegistration = normalizedRegistration();
  const response = {
    registration: expectedRegistration,
    manifest,
    issuedScopes: ["actions.invoke"],
    issuedCapabilities: ["app.write"],
    credentials: {
      appToken: "app-token-1234567890",
    },
  };
  const { requests, transport } = buildTransport({ data: response });
  const client = createProtocolClient(transport);

  const result = await client.registerApp({
    registration,
    manifest,
  });

  assert.deepStrictEqual(result, response);
  assert.equal(requests.length, 1);
  assert.equal(requests[0].path, "/protocol/apps/register");
  assert.deepStrictEqual(requests[0].init?.method, "POST");
  assert.deepStrictEqual(requests[0].init?.headers, {
    "content-type": "application/json",
  });
  assert.deepStrictEqual(JSON.parse(requests[0].init?.body ?? "{}"), {
    registration: expectedRegistration,
    manifest,
    requestedScopes: [],
    requestedCapabilities: [],
  });
});

test("sendChatMessage forwards the app token header and parses the result", async () => {
  const response = {
    data: {
      action: "chat.send_message",
      actorUserId: "11111111-1111-4111-8111-111111111111",
      chatId: "22222222-2222-4222-8222-222222222222",
      messageId: "33333333-3333-4333-8333-333333333333",
      replyToMessageId: null,
      createdAt: "2026-04-15T12:00:00.000Z",
      metadata: {},
    },
  };
  const { requests, transport } = buildTransport(response);
  const client = createProtocolClient(transport);

  const result = await client.sendChatMessage(
    "app-01",
    "app-token-1234567890",
    "22222222-2222-4222-8222-222222222222",
    {
      actorUserId: "11111111-1111-4111-8111-111111111111",
      body: "Hello from the protocol client",
    },
  );

  assert.deepStrictEqual(result, response.data);
  assert.equal(requests.length, 1);
  assert.equal(
    requests[0].path,
    "/protocol/apps/app-01/actions/chats/22222222-2222-4222-8222-222222222222/messages",
  );
  assert.deepStrictEqual(requests[0].init?.method, "POST");
  assert.deepStrictEqual(requests[0].init?.headers, {
    "content-type": "application/json",
    "x-protocol-app-token": "app-token-1234567890",
  });
  assert.deepStrictEqual(JSON.parse(requests[0].init?.body ?? "{}"), {
    actorUserId: "11111111-1111-4111-8111-111111111111",
    body: "Hello from the protocol client",
    metadata: {},
  });
});
