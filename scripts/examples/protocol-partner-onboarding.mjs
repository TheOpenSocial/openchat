#!/usr/bin/env node

import { createProtocolClient } from "@opensocial/protocol-client";

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
  const baseUrl = resolveBaseUrl();
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

  logSection("manifest", manifest);
  logSection("discovery", discovery);
  logSection("registration-request", registrationRequest);

  const registered = await client.registerApp(registrationRequest);
  logSection("registered-app", registered);

  if (webhookUrl) {
    const webhook = await client.createWebhook(
      appId,
      registered.credentials.appToken,
      {
        targetUrl: webhookUrl,
        events: DEFAULT_WEBHOOK_EVENTS,
        resources: DEFAULT_WEBHOOK_RESOURCES,
        deliveryMode: "json",
        metadata: {
          example: true,
          generatedBy: "scripts/examples/protocol-partner-onboarding.mjs",
        },
      },
    );
    logSection("webhook-subscription", webhook);
  }

  if (ownerUserId) {
    const consentRequest = await client.createConsentRequest(
      appId,
      registered.credentials.appToken,
      {
        scope: "actions.invoke",
        capabilities: ["app.write", "webhook.write"],
        subjectType: "user",
        subjectId: ownerUserId,
        requestedByUserId: ownerUserId,
        metadata: {
          example: true,
          generatedBy: "scripts/examples/protocol-partner-onboarding.mjs",
        },
      },
    );
    logSection("consent-request", consentRequest);
  }

  const grants = await client.listGrants(appId, registered.credentials.appToken);
  const consentRequests = await client.listConsentRequests(
    appId,
    registered.credentials.appToken,
  );
  const usage = await client.getAppUsageSummary(
    appId,
    registered.credentials.appToken,
  );

  logSection("grants", grants);
  logSection("consent-requests", consentRequests);
  logSection("usage-summary", usage);

  console.log(
    `\n[protocol-example] partner onboarding complete for appId=${appId}`,
  );
}

main().catch((error) => {
  console.error("[protocol-example] partner onboarding failed");
  console.error(error);
  process.exitCode = 1;
});
