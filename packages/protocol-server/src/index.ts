import {
  capabilityMatrixSchema,
  manifestSchema,
  protocolDiscoveryDocumentSchema,
  protocolIds,
  type ProtocolJsonObject,
  type CapabilityMatrix,
  type ProtocolDiscoveryDocument,
  type ProtocolManifest,
} from "@opensocial/protocol-types";
import { protocolEventCatalog } from "@opensocial/protocol-events";

export type ProtocolManifestBuilderInput = {
  appId?: string;
  version?: string;
  name?: string;
  summary?: string;
  description?: string;
  homepageUrl?: string;
  iconUrl?: string;
  categories?: string[];
  capabilities?: Partial<CapabilityMatrix>;
  metadata?: ProtocolJsonObject;
};

const unsupportedPrimitivesPolicy = {
  unsupportedPrimitives: ["posts", "follows", "feeds", "likes"],
  denial: "unsupported protocol primitive",
  message:
    "OpenSocial protocol intentionally excludes generic social-network primitives such as posts, follows, feeds, and likes.",
};

export function buildProtocolManifest(
  input: ProtocolManifestBuilderInput = {},
): ProtocolManifest {
  const capabilityBase = capabilityMatrixSchema.parse({
    scopes: [
      "protocol.read",
      "resources.read",
      "actions.invoke",
      "events.subscribe",
    ],
    resources: [
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
    ],
    actions: [
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
    ],
    events: protocolEventCatalog.map((entry) => entry.name),
    capabilities: [
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
    ],
    canActAsAgent: false,
    canManageWebhooks: true,
    ...input.capabilities,
  });

  return manifestSchema.parse({
    protocolId: protocolIds.manifest,
    manifestId: "opensocial-protocol-manifest",
    appId: input.appId ?? "opensocial-first-party",
    name: input.name ?? "OpenSocial Protocol",
    version: input.version ?? "0.1.0",
    summary:
      input.summary ??
      "Protocol discovery surface for identity, intents, requests, chats, circles, notifications, and agent threads.",
    description:
      input.description ??
      "OpenSocial protocol discovery manifest. Posts and feed primitives are intentionally omitted from the core protocol surface.",
    homepageUrl: input.homepageUrl,
    iconUrl: input.iconUrl,
    categories: input.categories ?? [
      "identity",
      "coordination",
      "messaging",
      "agentic-social",
    ],
    capabilities: capabilityBase,
    resources: capabilityBase.resources,
    actions: capabilityBase.actions,
    events: capabilityBase.events,
    webhooks: [],
    agent: {
      enabled: true,
      modes: ["observe", "suggest"],
      requiresHumanApproval: true,
    },
    metadata: {
      ...unsupportedPrimitivesPolicy,
      ...(input.metadata ?? {}),
    },
  });
}

export function buildProtocolDiscoveryDocument(
  input: ProtocolManifestBuilderInput = {},
): ProtocolDiscoveryDocument {
  const manifest = buildProtocolManifest(input);
  return protocolDiscoveryDocumentSchema.parse({
    manifest,
    events: protocolEventCatalog,
  });
}

export {
  buildProtocolWebhookSignature,
  buildProtocolWebhookHeaders,
  buildProtocolWebhookRequest,
  buildProtocolWebhookSignatureHeader,
  compareProtocolWebhookSignatureDigests,
  parseProtocolWebhookSignatureHeader,
  PROTOCOL_WEBHOOK_SIGNATURE_HEADER,
  readProtocolWebhookSignatureHeader,
  parseProtocolWebhookSignature,
  verifyProtocolWebhookRequest,
  verifyProtocolWebhookSignature,
} from "./webhook.ts";
export type {
  ProtocolWebhookHeaderSource,
  ProtocolWebhookHeaderValue,
  ProtocolWebhookRequest,
  ProtocolWebhookRequestInput,
  ProtocolWebhookSignatureInput,
  ProtocolWebhookVerificationInput,
} from "./webhook.ts";
