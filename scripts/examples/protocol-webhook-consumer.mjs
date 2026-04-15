#!/usr/bin/env node

import http from "node:http";
import { createProtocolClient } from "@opensocial/protocol-client";
import {
  getArg,
  logSection,
  resolveIntegerArg,
  resolveOptionalStringArg,
  resolveProtocolBaseUrl,
} from "./protocol-example-args.mjs";

const DEFAULT_WEBHOOK_PATH = "/webhooks/opensocial";
const DEFAULT_EVENTS = [
  "app.registered",
  "webhook.delivered",
  "webhook.failed",
];
const DEFAULT_RESOURCES = [
  "app_registration",
  "webhook_subscription",
  "manifest",
];
const DEFAULT_SCOPES = [
  "protocol.read",
  "protocol.write",
  "actions.invoke",
  "webhooks.manage",
  "events.subscribe",
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

function resolveAction() {
  return getArg("--action", "demo");
}

function resolvePort() {
  return resolveIntegerArg({
    flag: "--port",
    envName: "PROTOCOL_WEBHOOK_PORT",
    fallback: "4040",
    minimum: 1,
    errorMessage: "Invalid port.",
  });
}

function resolveWebhookPath() {
  return getArg("--webhook-path", DEFAULT_WEBHOOK_PATH);
}

function resolveAppId() {
  const provided = resolveOptionalStringArg({
    flag: "--app-id",
    envName: "PROTOCOL_APP_ID",
  });
  if (provided) return provided;
  const stamp = new Date().toISOString().replace(/[-:TZ.]/g, "");
  return `example.webhook.consumer.${stamp}`;
}

function resolveAppName() {
  return resolveOptionalStringArg({
    flag: "--app-name",
    envName: "PROTOCOL_APP_NAME",
    fallback: "Example Webhook Consumer",
  });
}

function resolveTargetUrl() {
  return resolveOptionalStringArg({
    flag: "--webhook-url",
    envName: "PROTOCOL_WEBHOOK_URL",
  });
}

function createTransport(baseUrl) {
  return {
    request: (path, init) => fetch(`${baseUrl}${path}`, init),
  };
}

function createClient(baseUrl) {
  return createProtocolClient(createTransport(baseUrl));
}

function buildRegistrationPayload({ appId, appName, webhookUrl }) {
  const metadata = {
    example: true,
    generatedBy: "scripts/examples/protocol-webhook-consumer.mjs",
  };

  return {
    registration: {
      protocolId: "opensocial.app-registration.v1",
      appId,
      name: appName,
      summary: "Example webhook consumer for the OpenSocial protocol surface",
      description:
        "Registers a protocol app, attaches a webhook, and prints delivery payloads from a local HTTP server.",
      kind: "server",
      status: "draft",
      redirectUris: [],
      webhookUrl,
      metadata,
      capabilities: {
        scopes: DEFAULT_SCOPES,
        resources: DEFAULT_RESOURCES,
        actions: [
          "app.read",
          "app.update",
          "webhook.subscribe",
          "event.replay",
        ],
        events: DEFAULT_EVENTS,
        capabilities: DEFAULT_CAPABILITIES,
        canActAsAgent: false,
        canManageWebhooks: true,
      },
    },
    manifest: {
      protocolId: "opensocial.manifest.v1",
      manifestId: `example-webhook-consumer.${appId.replace(/[^a-zA-Z0-9._-]/g, "-")}`,
      appId,
      name: appName,
      version: "0.1.0",
      summary: "Example webhook consumer",
      description:
        "Demonstrates the current protocol-client surface by registering a webhook consumer and inspecting queue state.",
      categories: ["coordination", "integrations"],
      capabilities: {
        scopes: DEFAULT_SCOPES,
        resources: DEFAULT_RESOURCES,
        actions: [
          "app.read",
          "app.update",
          "webhook.subscribe",
          "event.replay",
        ],
        events: DEFAULT_EVENTS,
        capabilities: DEFAULT_CAPABILITIES,
        canActAsAgent: false,
        canManageWebhooks: true,
      },
      resources: DEFAULT_RESOURCES,
      actions: ["app.read", "app.update", "webhook.subscribe", "event.replay"],
      events: DEFAULT_EVENTS,
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

function collectRequestBody(req) {
  return new Promise((resolve) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf8");
      if (!raw) {
        resolve({ raw: "", parsed: null });
        return;
      }
      try {
        resolve({ raw, parsed: JSON.parse(raw) });
      } catch {
        resolve({ raw, parsed: raw });
      }
    });
  });
}

function startWebhookServer(port, webhookPath) {
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    if (req.method === "GET" && url.pathname === "/health") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: true }));
      return;
    }

    if (req.method !== "POST" || url.pathname !== webhookPath) {
      res.writeHead(404, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "not found" }));
      return;
    }

    const { parsed } = await collectRequestBody(req);
    const deliveryId = req.headers["x-opensocial-protocol-delivery-id"];
    const subscriptionId = req.headers["x-opensocial-protocol-subscription-id"];
    const eventName = req.headers["x-opensocial-protocol-event-name"];
    const signature = req.headers["x-opensocial-protocol-signature"];

    console.log("\n[protocol-example] webhook received");
    console.log(
      JSON.stringify(
        {
          deliveryId,
          subscriptionId,
          eventName,
          signature,
          headers: {
            "content-type": req.headers["content-type"],
            "user-agent": req.headers["user-agent"],
          },
          payload: parsed,
        },
        null,
        2,
      ),
    );

    res.writeHead(204);
    res.end();
  });

  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => resolve(server));
  });
}

async function runServe() {
  const port = resolvePort();
  const webhookPath = resolveWebhookPath();
  const server = await startWebhookServer(port, webhookPath);

  console.log(
    `[protocol-example] listening on http://127.0.0.1:${port}${webhookPath}`,
  );
  console.log("[protocol-example] press Ctrl+C to stop");

  const shutdown = () => {
    server.close(() => process.exit(0));
  };
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
}

async function runRegister() {
  const baseUrl = resolveProtocolBaseUrl();
  const webhookUrl = resolveTargetUrl();
  if (!webhookUrl) {
    throw new Error(
      "Missing webhook URL. Set --webhook-url or PROTOCOL_WEBHOOK_URL.",
    );
  }

  const client = createClient(baseUrl);
  const appId = resolveAppId();
  const appName = resolveAppName();
  const payload = buildRegistrationPayload({ appId, appName, webhookUrl });

  const manifest = await client.getManifest();
  const discovery = await client.getDiscovery();
  const registration = await client.registerApp(payload);
  const webhook = await client.createWebhook(
    registration.registration.appId,
    registration.credentials.appToken,
    {
      targetUrl: webhookUrl,
      events: DEFAULT_EVENTS,
      resources: DEFAULT_RESOURCES,
      deliveryMode: "json",
      metadata: {
        example: true,
        source: "scripts/examples/protocol-webhook-consumer.mjs",
      },
    },
  );

  const webhooks = await client.listWebhooks(
    registration.registration.appId,
    registration.credentials.appToken,
  );
  const queue = await client.inspectDeliveryQueue(
    registration.registration.appId,
    registration.credentials.appToken,
  );

  logSection("manifest", {
    manifestId: manifest.manifestId,
    appId: manifest.appId,
    name: manifest.name,
    version: manifest.version,
  });
  logSection(
    "discovery events",
    discovery.events.map((event) => event.name),
  );
  logSection("registration", {
    appId: registration.registration.appId,
    appToken: registration.credentials.appToken,
    issuedScopes: registration.issuedScopes,
    issuedCapabilities: registration.issuedCapabilities,
  });
  logSection("webhook", webhook);
  logSection("webhooks", webhooks);
  logSection("delivery queue", {
    generatedAt: queue.generatedAt,
    queuedCount: queue.queuedCount,
    inFlightCount: queue.inFlightCount,
    failedCount: queue.failedCount,
    deadLetteredCount: queue.deadLetteredCount,
    replayableCount: queue.replayableCount,
  });
}

async function runDemo() {
  const port = resolvePort();
  const webhookPath = resolveWebhookPath();
  const baseUrl = resolveProtocolBaseUrl();
  const client = createClient(baseUrl);
  const appId = resolveAppId();
  const appName = resolveAppName();
  const webhookUrl = `http://127.0.0.1:${port}${webhookPath}`;
  const server = await startWebhookServer(port, webhookPath);

  console.log(`[protocol-example] webhook consumer listening on ${webhookUrl}`);

  const manifest = await client.getManifest();
  const discovery = await client.getDiscovery();
  const registration = await client.registerApp(
    buildRegistrationPayload({
      appId,
      appName,
      webhookUrl,
    }),
  );
  const webhook = await client.createWebhook(
    registration.registration.appId,
    registration.credentials.appToken,
    {
      targetUrl: webhookUrl,
      events: DEFAULT_EVENTS,
      resources: DEFAULT_RESOURCES,
      deliveryMode: "json",
      metadata: {
        example: true,
        source: "scripts/examples/protocol-webhook-consumer.mjs",
      },
    },
  );
  const webhooks = await client.listWebhooks(
    registration.registration.appId,
    registration.credentials.appToken,
  );
  const queue = await client.inspectDeliveryQueue(
    registration.registration.appId,
    registration.credentials.appToken,
  );

  logSection("manifest", {
    manifestId: manifest.manifestId,
    appId: manifest.appId,
    name: manifest.name,
    version: manifest.version,
  });
  logSection(
    "discovery events",
    discovery.events.map((event) => event.name),
  );
  logSection("registration", {
    appId: registration.registration.appId,
    appToken: registration.credentials.appToken,
    issuedScopes: registration.issuedScopes,
    issuedCapabilities: registration.issuedCapabilities,
  });
  logSection("webhook", webhook);
  logSection("webhooks", webhooks);
  logSection("delivery queue", {
    generatedAt: queue.generatedAt,
    queuedCount: queue.queuedCount,
    inFlightCount: queue.inFlightCount,
    failedCount: queue.failedCount,
    deadLetteredCount: queue.deadLetteredCount,
    replayableCount: queue.replayableCount,
  });

  console.log(
    "[protocol-example] send any protocol event to the app and watch the server logs above",
  );

  const shutdown = () => {
    server.close(() => process.exit(0));
  };
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
}

function printUsage() {
  console.log(`Usage:
  node scripts/examples/protocol-webhook-consumer.mjs --action=demo [--base-url=http://127.0.0.1:3000/api] [--port=4040]
  node scripts/examples/protocol-webhook-consumer.mjs --action=serve [--port=4040]
  node scripts/examples/protocol-webhook-consumer.mjs --action=register --base-url=http://127.0.0.1:3000/api --webhook-url=http://127.0.0.1:4040/webhooks/opensocial
  node scripts/examples/protocol-webhook-consumer.mjs --action=inspect --base-url=http://127.0.0.1:3000/api --app-id=example.webhook.consumer.123 --app-token=<token>

Environment:
  PROTOCOL_BASE_URL / PLAYGROUND_BASE_URL / SMOKE_BASE_URL / STAGING_API_BASE_URL / API_BASE_URL
  PROTOCOL_WEBHOOK_PORT
  PROTOCOL_WEBHOOK_URL
  PROTOCOL_APP_ID
  PROTOCOL_APP_NAME
`);
}

async function runInspect() {
  const baseUrl = resolveProtocolBaseUrl();
  const appId = resolveAppId();
  const appToken = getArg("--app-token") || process.env.PROTOCOL_APP_TOKEN;
  if (!appToken) {
    throw new Error(
      "Missing app token. Set --app-token or PROTOCOL_APP_TOKEN.",
    );
  }

  const client = createClient(baseUrl);
  const [manifest, discovery, app, webhooks, grants, consentRequests, usage] =
    await Promise.all([
      client.getManifest(),
      client.getDiscovery(),
      client.getApp(appId),
      client.listWebhooks(appId, appToken),
      client.listGrants(appId, appToken),
      client.listConsentRequests(appId, appToken),
      client.getUsage(appId, appToken),
    ]);

  logSection("manifest", {
    manifestId: manifest.manifestId,
    appId: manifest.appId,
    name: manifest.name,
    version: manifest.version,
  });
  logSection(
    "discovery events",
    discovery.events.map((event) => event.name),
  );
  logSection("app", app);
  logSection("webhooks", webhooks);
  logSection("grants", grants);
  logSection("consent requests", consentRequests);
  logSection("usage", usage);
}

async function main() {
  const action = resolveAction();
  if (!action || action === "help") {
    printUsage();
    return;
  }

  switch (action) {
    case "serve":
      await runServe();
      break;
    case "register":
      await runRegister();
      break;
    case "inspect":
      await runInspect();
      break;
    case "demo":
      await runDemo();
      break;
    default:
      throw new Error(`Unsupported action: ${action}`);
  }
}

main().catch((error) => {
  console.error(
    `[protocol-example] ${error?.stack ?? error?.message ?? error}`,
  );
  process.exitCode = 1;
});
