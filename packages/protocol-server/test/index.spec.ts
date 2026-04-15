import assert from "node:assert/strict";
import test from "node:test";

import { protocolEventCatalog } from "@opensocial/protocol-events";
import { protocolIds } from "@opensocial/protocol-types";

import {
  buildProtocolDiscoveryDocument,
  buildProtocolManifest,
} from "../src/index.ts";

test("buildProtocolManifest applies the OpenSocial defaults", () => {
  const manifest = buildProtocolManifest();

  assert.equal(manifest.protocolId, protocolIds.manifest);
  assert.equal(manifest.manifestId, "opensocial-protocol-manifest");
  assert.equal(manifest.appId, "opensocial-first-party");
  assert.equal(manifest.name, "OpenSocial Protocol");
  assert.equal(manifest.version, "0.1.0");
  assert.equal(
    manifest.summary,
    "Protocol discovery surface for identity, intents, requests, chats, circles, notifications, and agent threads.",
  );
  assert.equal(
    manifest.description,
    "OpenSocial protocol discovery manifest. Posts and feed primitives are intentionally omitted from the core protocol surface.",
  );
  assert.deepEqual(manifest.categories, [
    "identity",
    "coordination",
    "messaging",
    "agentic-social",
  ]);
  assert.deepEqual(manifest.capabilities.scopes, [
    "protocol.read",
    "resources.read",
    "actions.invoke",
    "events.subscribe",
  ]);
  assert.deepEqual(manifest.capabilities.resources, [
    "user",
    "profile",
    "intent",
    "intent_request",
    "connection",
    "chat",
    "chat_message",
    "circle",
    "notification",
    "agent_thread",
    "app_registration",
    "webhook_subscription",
    "manifest",
  ]);
  assert.deepEqual(manifest.capabilities.actions, [
    "profile.read",
    "intent.create",
    "intent.read",
    "intent.update",
    "request.read",
    "request.accept",
    "request.reject",
    "connection.read",
    "chat.read",
    "chat.send_message",
    "circle.read",
    "notification.read",
    "agent_thread.read",
    "webhook.subscribe",
    "event.replay",
  ]);
  assert.deepEqual(
    manifest.capabilities.events,
    protocolEventCatalog.map((event) => event.name),
  );
  assert.deepEqual(manifest.capabilities.capabilities, [
    "identity.read",
    "profile.read",
    "intent.read",
    "intent.write",
    "request.read",
    "request.write",
    "connection.read",
    "chat.read",
    "chat.write",
    "circle.read",
    "notification.read",
    "agent.read",
    "webhook.write",
    "event.read",
  ]);
  assert.equal(manifest.capabilities.canActAsAgent, false);
  assert.equal(manifest.capabilities.canManageWebhooks, true);
  assert.deepEqual(manifest.webhooks, []);
  assert.deepEqual(manifest.metadata, {});
  assert.equal(manifest.agent.enabled, true);
  assert.deepEqual(manifest.agent.modes, ["observe", "suggest"]);
  assert.equal(manifest.agent.requiresHumanApproval, true);
});

test("buildProtocolManifest merges custom overrides without losing defaults", () => {
  const manifest = buildProtocolManifest({
    appId: "partner-app",
    version: "2.1.0",
    name: "Partner Protocol",
    summary: "Custom summary",
    description: "Custom description",
    homepageUrl: "https://partner.example.com",
    iconUrl: "https://partner.example.com/icon.png",
    categories: ["integration"],
    metadata: { source: "partner" },
    capabilities: {
      scopes: ["protocol.read"],
      resources: ["chat"],
      actions: ["chat.read"],
      events: ["chat.created"],
      capabilities: ["chat.read"],
      canActAsAgent: true,
      canManageWebhooks: false,
    },
  });

  assert.equal(manifest.appId, "partner-app");
  assert.equal(manifest.version, "2.1.0");
  assert.equal(manifest.name, "Partner Protocol");
  assert.equal(manifest.summary, "Custom summary");
  assert.equal(manifest.description, "Custom description");
  assert.equal(manifest.homepageUrl, "https://partner.example.com");
  assert.equal(manifest.iconUrl, "https://partner.example.com/icon.png");
  assert.deepEqual(manifest.categories, ["integration"]);
  assert.deepEqual(manifest.metadata, { source: "partner" });
  assert.deepEqual(manifest.capabilities.scopes, ["protocol.read"]);
  assert.deepEqual(manifest.capabilities.resources, ["chat"]);
  assert.deepEqual(manifest.capabilities.actions, ["chat.read"]);
  assert.deepEqual(manifest.capabilities.events, ["chat.created"]);
  assert.deepEqual(manifest.capabilities.capabilities, ["chat.read"]);
  assert.equal(manifest.capabilities.canActAsAgent, true);
  assert.equal(manifest.capabilities.canManageWebhooks, false);
});

test("buildProtocolDiscoveryDocument mirrors the manifest and event catalog", () => {
  const discovery = buildProtocolDiscoveryDocument();

  assert.equal(discovery.manifest.manifestId, "opensocial-protocol-manifest");
  assert.equal(discovery.manifest.appId, "opensocial-first-party");
  assert.deepEqual(
    discovery.manifest.events,
    protocolEventCatalog.map((event) => event.name),
  );
  assert.deepEqual(discovery.events, protocolEventCatalog);
});
