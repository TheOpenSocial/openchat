import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";
import { randomBytes } from "node:crypto";
import {
  buildProtocolDiscoveryDocument,
  buildProtocolManifest,
} from "@opensocial/protocol-server";
import { protocolEventCatalog } from "@opensocial/protocol-events";
import {
  appRegistrationRequestSchema,
  appRegistrationSchema,
  capabilityNameSchema,
  eventNameSchema,
  identifierSchema,
  protocolEventEnvelopeSchema,
  protocolIds,
  protocolScopeNameSchema,
  webhookSubscriptionCreateSchema,
  webhookSubscriptionSchema,
  type AppRegistration,
  type AppRegistrationRequest,
  type CapabilityName,
  type EventName,
  type ProtocolAppRegistrationResult,
  type ProtocolDiscoveryDocument,
  type ProtocolEventEnvelope,
  type ProtocolManifest,
  type ProtocolScopeName,
  type WebhookSubscription,
  type WebhookSubscriptionCreate,
} from "@opensocial/protocol-types";

type RegisteredProtocolApp = {
  registration: AppRegistration;
  manifest: ProtocolManifest;
  issuedScopes: ProtocolScopeName[];
  issuedCapabilities: CapabilityName[];
  appToken: string;
};

@Injectable()
export class ProtocolService {
  private readonly apps = new Map<string, RegisteredProtocolApp>();
  private readonly webhookSubscriptions = new Map<string, WebhookSubscription[]>();
  private readonly eventLog: ProtocolEventEnvelope[] = [];

  getManifest(): ProtocolManifest {
    return buildProtocolManifest({
      appId: "opensocial-api",
      version: "0.1.0",
      homepageUrl: process.env.APP_BASE_URL?.trim() || undefined,
      metadata: {
        environment: process.env.NODE_ENV ?? "development",
      },
    });
  }

  getDiscovery(): ProtocolDiscoveryDocument {
    return buildProtocolDiscoveryDocument({
      appId: "opensocial-api",
      version: "0.1.0",
      homepageUrl: process.env.APP_BASE_URL?.trim() || undefined,
      metadata: {
        environment: process.env.NODE_ENV ?? "development",
      },
    });
  }

  listEvents() {
    return protocolEventCatalog;
  }

  listApps() {
    return [...this.apps.values()].map((app) => ({
      registration: app.registration,
      manifest: app.manifest,
      issuedScopes: app.issuedScopes,
      issuedCapabilities: app.issuedCapabilities,
    }));
  }

  getApp(appId: string) {
    const parsedAppId = identifierSchema.parse(appId);
    const app = this.apps.get(parsedAppId);
    if (!app) {
      throw new NotFoundException("protocol app not found");
    }

    return {
      registration: app.registration,
      manifest: app.manifest,
      issuedScopes: app.issuedScopes,
      issuedCapabilities: app.issuedCapabilities,
    };
  }

  registerApp(input: AppRegistrationRequest): ProtocolAppRegistrationResult {
    const payload = appRegistrationRequestSchema.parse(input);
    const registration = appRegistrationSchema.parse(payload.registration);
    const manifest = buildProtocolManifest({
      appId: payload.manifest.appId,
      version: payload.manifest.version,
      name: payload.manifest.name,
      summary: payload.manifest.summary,
      description: payload.manifest.description,
      homepageUrl: payload.manifest.homepageUrl,
      iconUrl: payload.manifest.iconUrl,
      categories: payload.manifest.categories,
      capabilities: payload.manifest.capabilities,
      metadata: payload.manifest.metadata,
    });

    if (registration.appId !== manifest.appId) {
      throw new ConflictException(
        "registration app id must match manifest app id",
      );
    }

    if (this.apps.has(registration.appId)) {
      throw new ConflictException("protocol app already registered");
    }

    const issuedScopes = this.issueScopes(
      payload.requestedScopes,
      registration.capabilities.scopes,
      manifest.capabilities.scopes,
    );
    const issuedCapabilities = this.issueCapabilities(
      payload.requestedCapabilities,
      registration.capabilities.capabilities,
      manifest.capabilities.capabilities,
    );

    const now = new Date().toISOString();
    const storedRegistration = appRegistrationSchema.parse({
      ...registration,
      status: registration.status === "revoked" ? "draft" : "active",
      createdAt: now,
      updatedAt: now,
      capabilities: {
        ...registration.capabilities,
        scopes: issuedScopes,
        capabilities: issuedCapabilities,
      },
    });

    const storedManifest = buildProtocolManifest({
      appId: manifest.appId,
      version: manifest.version,
      name: manifest.name,
      summary: manifest.summary,
      description: manifest.description,
      homepageUrl: manifest.homepageUrl,
      iconUrl: manifest.iconUrl,
      categories: manifest.categories,
      capabilities: {
        ...manifest.capabilities,
        scopes: issuedScopes,
        capabilities: issuedCapabilities,
      },
      metadata: manifest.metadata,
    });

    const appToken = this.issueToken();
    const storedApp: RegisteredProtocolApp = {
      registration: storedRegistration,
      manifest: storedManifest,
      issuedScopes,
      issuedCapabilities,
      appToken,
    };

    this.apps.set(storedRegistration.appId, storedApp);
    this.webhookSubscriptions.set(storedRegistration.appId, []);
    this.recordEvent({
      actorAppId: storedRegistration.appId,
      event: "app.registered",
      resource: "app_registration",
      payload: {
        appId: storedRegistration.appId,
        kind: storedRegistration.kind,
        scopes: issuedScopes,
        capabilities: issuedCapabilities,
      },
    });

    return {
      registration: storedRegistration,
      manifest: storedManifest,
      issuedScopes,
      issuedCapabilities,
      credentials: {
        appToken,
      },
    };
  }

  listWebhooks(appId: string, appToken: string) {
    const app = this.requireAppAccess(appId, appToken, {
      scopes: ["webhooks.manage"],
      capabilities: ["webhook.read"],
    });
    return [...(this.webhookSubscriptions.get(app.registration.appId) ?? [])];
  }

  createWebhook(
    appId: string,
    appToken: string,
    input: WebhookSubscriptionCreate,
  ) {
    const app = this.requireAppAccess(appId, appToken, {
      scopes: ["webhooks.manage"],
      capabilities: ["webhook.write"],
    });
    const payload = webhookSubscriptionCreateSchema.parse(input);
    const now = new Date().toISOString();
    const subscription = webhookSubscriptionSchema.parse({
      protocolId: protocolIds.webhookSubscription,
      subscriptionId: `${app.registration.appId}.${this.issueToken(8)}`,
      appId: app.registration.appId,
      targetUrl: payload.targetUrl,
      events: payload.events,
      resources: payload.resources,
      status: "active",
      deliveryMode: payload.deliveryMode,
      retryPolicy: payload.retryPolicy,
      metadata: payload.metadata,
      createdAt: now,
      updatedAt: now,
    });

    const subscriptions =
      this.webhookSubscriptions.get(app.registration.appId) ?? [];
    subscriptions.push(subscription);
    this.webhookSubscriptions.set(app.registration.appId, subscriptions);

    this.recordEvent({
      actorAppId: app.registration.appId,
      event: "app.updated",
      resource: "app_registration",
      payload: {
        appId: app.registration.appId,
        update: "webhook_subscription_added",
        subscriptionId: subscription.subscriptionId,
      },
    });
    this.recordEvent({
      actorAppId: app.registration.appId,
      event: "webhook.delivered",
      resource: "webhook_subscription",
      payload: {
        appId: app.registration.appId,
        subscriptionId: subscription.subscriptionId,
        state: "registered",
      },
    });

    return subscription;
  }

  replayEvents(appId: string, appToken: string, cursor?: string) {
    const app = this.requireAppAccess(appId, appToken, {
      scopes: ["events.subscribe"],
      capabilities: ["event.read"],
    });
    const since = cursor ? new Date(cursor).getTime() : null;
    if (cursor && Number.isNaN(since)) {
      throw new ForbiddenException("invalid event replay cursor");
    }

    return this.eventLog.filter((entry) => {
      if (entry.actorAppId && entry.actorAppId !== app.registration.appId) {
        return false;
      }
      if (since === null) {
        return true;
      }
      return new Date(entry.issuedAt).getTime() > since;
    });
  }

  private issueScopes(
    requested: ProtocolScopeName[],
    registrationScopes: ProtocolScopeName[],
    manifestScopes: ProtocolScopeName[],
  ) {
    const available = new Set<ProtocolScopeName>([
      ...registrationScopes.map((scope) => protocolScopeNameSchema.parse(scope)),
      ...manifestScopes.map((scope) => protocolScopeNameSchema.parse(scope)),
    ]);
    const requestedScopes = requested.length > 0 ? requested : [...available];
    return requestedScopes.filter((scope) => available.has(scope));
  }

  private issueCapabilities(
    requested: CapabilityName[],
    registrationCapabilities: CapabilityName[],
    manifestCapabilities: CapabilityName[],
  ) {
    const available = new Set<CapabilityName>([
      ...registrationCapabilities.map((capability) =>
        capabilityNameSchema.parse(capability),
      ),
      ...manifestCapabilities.map((capability) =>
        capabilityNameSchema.parse(capability),
      ),
    ]);
    const requestedCapabilities =
      requested.length > 0 ? requested : [...available];
    return requestedCapabilities.filter((capability) => available.has(capability));
  }

  private requireAppAccess(
    appId: string,
    appToken: string,
    requirements: {
      scopes?: ProtocolScopeName[];
      capabilities?: CapabilityName[];
    } = {},
  ) {
    const parsedAppId = identifierSchema.parse(appId);
    const app = this.apps.get(parsedAppId);
    if (!app) {
      throw new NotFoundException("protocol app not found");
    }
    if (!appToken?.trim()) {
      throw new UnauthorizedException("missing protocol app token");
    }
    if (app.appToken !== appToken.trim()) {
      throw new ForbiddenException("invalid protocol app token");
    }

    const missingScopes = (requirements.scopes ?? []).filter(
      (scope) => !app.issuedScopes.includes(scope),
    );
    if (missingScopes.length > 0) {
      throw new ForbiddenException(
        `missing protocol scopes: ${missingScopes.join(", ")}`,
      );
    }

    const missingCapabilities = (requirements.capabilities ?? []).filter(
      (capability) => !app.issuedCapabilities.includes(capability),
    );
    if (missingCapabilities.length > 0) {
      throw new ForbiddenException(
        `missing protocol capabilities: ${missingCapabilities.join(", ")}`,
      );
    }

    return app;
  }

  private issueToken(byteLength = 24) {
    return randomBytes(byteLength).toString("hex");
  }

  private recordEvent(input: {
    actorAppId?: string;
    event: EventName;
    resource?: "app_registration" | "webhook_subscription";
    payload: unknown;
  }) {
    const envelope = protocolEventEnvelopeSchema.parse({
      protocolId: protocolIds.protocol,
      issuedAt: new Date().toISOString(),
      actorAppId: input.actorAppId,
      event: eventNameSchema.parse(input.event),
      resource: input.resource,
      payload: input.payload,
      metadata: {},
    });
    this.eventLog.push(envelope);
  }
}
