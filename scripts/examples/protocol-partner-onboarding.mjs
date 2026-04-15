#!/usr/bin/env node

import {
  bindProtocolAppClient,
  createProtocolClientFromBaseUrl,
} from "@opensocial/protocol-client";
import {
  getArg,
  logSection,
  resolveProtocolBaseUrl,
} from "./protocol-example-args.mjs";

const DEFAULT_SCOPES = [
  "protocol.read",
  "protocol.write",
  "actions.invoke",
  "events.subscribe",
  "webhooks.manage",
];

const DEFAULT_CAPABILITIES = [
  "app.read",
  "app.write",
  "webhook.read",
  "webhook.write",
  "event.read",
  "intent.write",
  "request.write",
  "chat.write",
  "circle.write",
];

const DEFAULT_WEBHOOK_EVENTS = [
  "app.registered",
  "webhook.delivered",
  "webhook.failed",
];

const DEFAULT_WEBHOOK_RESOURCES = [
  "app_registration",
  "webhook_subscription",
  "manifest",
];

function resolveAppId() {
  const provided = getArg("--app-id") || process.env.PROTOCOL_APP_ID;
  if (provided) {
    return provided;
  }
  const stamp = new Date().toISOString().replace(/[-:TZ.]/g, "");
  return `partner.onboarding.${stamp}`;
}

function resolveAppName() {
  return getArg("--app-name", "Partner Onboarding Example");
}

function resolveOwnerUserId() {
  return getArg("--owner-user-id") || process.env.PROTOCOL_OWNER_USER_ID;
}

function resolveWebhookUrl() {
  return getArg("--webhook-url") || process.env.PROTOCOL_WEBHOOK_URL;
}

function createClient(baseUrl) {
  return createProtocolClientFromBaseUrl(baseUrl);
}

function buildCapabilities() {
  return {
    scopes: DEFAULT_SCOPES,
    resources: DEFAULT_WEBHOOK_RESOURCES,
    actions: ["app.read", "app.update", "webhook.subscribe", "event.replay"],
    events: DEFAULT_WEBHOOK_EVENTS,
    capabilities: DEFAULT_CAPABILITIES,
    canActAsAgent: false,
    canManageWebhooks: true,
  };
}

function buildRegistrationRequest({ appId, appName, ownerUserId, webhookUrl }) {
  const metadata = {
    example: true,
    generatedBy: "scripts/examples/protocol-partner-onboarding.mjs",
  };

  return {
    registration: {
      protocolId: "opensocial.app-registration.v1",
      appId,
      name: appName,
      summary: "Partner onboarding example for the OpenSocial protocol",
      description:
        "Registers a partner app, requests delegated access, and optionally attaches a webhook subscription.",
      kind: "server",
      status: "draft",
      ownerUserId,
      webhookUrl,
      redirectUris: [],
      capabilities: buildCapabilities(),
      metadata,
    },
    manifest: {
      protocolId: "opensocial.manifest.v1",
      manifestId: `partner-onboarding.${appId.replace(/[^a-zA-Z0-9._-]/g, "-")}`,
      appId,
      name: appName,
      version: "0.1.0",
      summary: "Partner onboarding example",
      description:
        "A concise protocol manifest used to demonstrate app registration, consent, and webhook setup.",
      categories: ["coordination", "integrations"],
      capabilities: buildCapabilities(),
      resources: DEFAULT_WEBHOOK_RESOURCES,
      actions: ["app.read", "app.update", "webhook.subscribe", "event.replay"],
      events: DEFAULT_WEBHOOK_EVENTS,
      webhooks: [],
      agent: {
        enabled: false,
        modes: [],
        requiresHumanApproval: true,
      },
      metadata,
    },
    requestedScopes: DEFAULT_SCOPES,
    requestedCapabilities: DEFAULT_CAPABILITIES,
  };
}

async function main() {
  const baseUrl = resolveProtocolBaseUrl();
  const appId = resolveAppId();
  const appName = resolveAppName();
  const ownerUserId = resolveOwnerUserId();
  const webhookUrl = resolveWebhookUrl();
  const client = createClient(baseUrl);

  const manifest = await client.getManifest();
  const discovery = await client.getDiscovery();
  const registrationRequest = buildRegistrationRequest({
    appId,
    appName,
    ownerUserId,
    webhookUrl,
  });

  logSection("protocol-example", "manifest", manifest);
  logSection("protocol-example", "discovery", discovery);
  logSection("protocol-example", "registration-request", registrationRequest);

  const registered = await client.registerApp(registrationRequest);
  logSection("protocol-example", "registered-app", registered);
  const app = bindProtocolAppClient(client, {
    appId,
    appToken: registered.credentials.appToken,
  });

  if (webhookUrl) {
    const webhook = await app.createWebhook({
      targetUrl: webhookUrl,
      events: DEFAULT_WEBHOOK_EVENTS,
      resources: DEFAULT_WEBHOOK_RESOURCES,
      deliveryMode: "json",
      metadata: {
        example: true,
        generatedBy: "scripts/examples/protocol-partner-onboarding.mjs",
      },
    });
    logSection("protocol-example", "webhook-subscription", webhook);
  }

  if (ownerUserId) {
    const consentRequest = await app.createConsentRequest({
      scope: "actions.invoke",
      capabilities: ["app.write", "webhook.write"],
      subjectType: "user",
      subjectId: ownerUserId,
      requestedByUserId: ownerUserId,
      metadata: {
        example: true,
        generatedBy: "scripts/examples/protocol-partner-onboarding.mjs",
      },
    });
    logSection("protocol-example", "consent-request", consentRequest);
  }

  const grants = await app.listGrants();
  const consentRequests = await app.listConsentRequests();
  const usage = await app.getAppUsageSummary();

  logSection("protocol-example", "grants", grants);
  logSection("protocol-example", "consent-requests", consentRequests);
  logSection("protocol-example", "usage-summary", usage);

  console.log(
    `\n[protocol-example] partner onboarding complete for appId=${appId}`,
  );
}

main().catch((error) => {
  console.error("[protocol-example] partner onboarding failed");
  console.error(error);
  process.exitCode = 1;
});
