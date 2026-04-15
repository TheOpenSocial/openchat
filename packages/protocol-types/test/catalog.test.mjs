import assert from "node:assert/strict";
import test from "node:test";

import {
  actionNameSchema,
  actionNameValues,
  appRegistrationCreateSchema,
  appRegistrationSchema,
  capabilityMatrixSchema,
  capabilityNameSchema,
  capabilityNameValues,
  eventNameSchema,
  eventNameValues,
  identifierSchema,
  manifestSchema,
  protocolAppRegistrationResultSchema,
  protocolIdSchema,
  protocolIdValues,
  protocolIds,
  protocolManifestSchema,
  protocolScopeNameSchema,
  protocolScopeNameValues,
  resourceNameSchema,
  resourceNameValues,
  urlSchema,
  webhookSubscriptionSchema,
} from "../dist/index.js";

const baseCapabilities = {
  scopes: [],
  resources: [],
  actions: [],
  events: [],
  capabilities: [],
  canActAsAgent: false,
  canManageWebhooks: false,
};

test("protocol catalog values parse through their schemas", () => {
  for (const value of protocolIdValues) {
    assert.equal(protocolIdSchema.parse(value), value);
  }
  for (const value of resourceNameValues) {
    assert.equal(resourceNameSchema.parse(value), value);
  }
  for (const value of actionNameValues) {
    assert.equal(actionNameSchema.parse(value), value);
  }
  for (const value of eventNameValues) {
    assert.equal(eventNameSchema.parse(value), value);
  }
  for (const value of capabilityNameValues) {
    assert.equal(capabilityNameSchema.parse(value), value);
  }
  for (const value of protocolScopeNameValues) {
    assert.equal(protocolScopeNameSchema.parse(value), value);
  }
});

test("protocol schemas accept coherent registration and manifest payloads", () => {
  const appId = "protocol-catalog-test";
  const app = appRegistrationSchema.parse({
    protocolId: protocolIds.appRegistration,
    appId,
    name: "Catalog Test App",
    capabilities: baseCapabilities,
    redirectUris: [],
    metadata: {},
  });

  assert.equal(app.appId, appId);
  assert.deepEqual(app.capabilities, baseCapabilities);

  const manifest = protocolManifestSchema.parse({
    protocolId: protocolIds.manifest,
    manifestId: "catalog-manifest",
    appId,
    name: "Catalog Test Manifest",
    version: "1.0.0",
    capabilities: baseCapabilities,
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
  });

  assert.equal(manifest.appId, appId);
  assert.deepEqual(manifest.capabilities, baseCapabilities);

  const registration = protocolAppRegistrationResultSchema.parse({
    registration: app,
    manifest,
    issuedScopes: [],
    issuedCapabilities: [],
    credentials: { appToken: "protocol-test-token" },
  });

  assert.equal(registration.registration.appId, appId);
  assert.equal(registration.credentials.appToken, "protocol-test-token");

  const subscription = webhookSubscriptionSchema.parse({
    protocolId: protocolIds.webhookSubscription,
    subscriptionId: "subscription-test",
    appId,
    targetUrl: "https://example.com/webhooks",
    events: ["app.registered"],
    resources: [],
    metadata: {},
  });

  assert.equal(subscription.targetUrl, "https://example.com/webhooks");
  assert.equal(urlSchema.parse("https://example.com"), "https://example.com");
  assert.equal(identifierSchema.parse("catalog-test"), "catalog-test");
});

test("protocol app create schema keeps default capability shape stable", () => {
  const parsed = appRegistrationCreateSchema.parse({
    name: "Catalog Test App",
    metadata: {},
  });

  assert.deepEqual(parsed.capabilities, baseCapabilities);
  assert.deepEqual(parsed.redirectUris, []);
  assert.equal(parsed.kind, "web");
});

test("protocol manifest schema round-trips empty catalog structures", () => {
  const manifest = manifestSchema.parse({
    protocolId: protocolIds.manifest,
    manifestId: "catalog-manifest",
    appId: "protocol-catalog-test",
    name: "Catalog Test Manifest",
    version: "1.0.0",
    capabilities: capabilityMatrixSchema.parse(baseCapabilities),
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
  });

  assert.equal(manifest.protocolId, protocolIds.manifest);
});
