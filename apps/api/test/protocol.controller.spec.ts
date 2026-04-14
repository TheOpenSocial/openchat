import { describe, expect, it } from "vitest";
import { ProtocolController } from "../src/protocol/protocol.controller.js";

describe("ProtocolController", () => {
  it("returns the protocol manifest envelope", async () => {
    const controller = new ProtocolController({
      getManifest: () => ({
        protocolId: "opensocial.manifest.v1",
        appId: "opensocial-api",
        manifestId: "opensocial-protocol-manifest",
      }),
      getDiscovery: () => ({
        manifest: {
          protocolId: "opensocial.manifest.v1",
          appId: "opensocial-api",
        },
        events: [],
      }),
      listEvents: () => [],
      listApps: () => [],
      registerApp: (payload: unknown) => payload,
      getApp: () => ({ appId: "alpha" }),
      listAppGrants: () => [],
      createAppGrant: () => ({}),
      revokeAppGrant: () => ({}),
      rotateAppToken: (_appId: string, token: string) => ({ token }),
      revokeAppToken: (_appId: string, token: string) => ({
        token,
        revoked: true,
      }),
      listWebhooks: () => [],
      listWebhookDeliveries: () => [],
      listWebhookDeliveryAttempts: () => [],
      replayWebhookDelivery: () => ({}),
      replayDeadLetteredDeliveries: () => ({}),
      inspectDeliveryQueue: () => ({
        appId: "alpha.app",
        generatedAt: "2026-04-13T00:00:00.000Z",
        queuedCount: 0,
        inFlightCount: 0,
        failedCount: 0,
        deadLetteredCount: 0,
        replayableCount: 0,
        deliveries: [],
      }),
      runDueWebhookDeliveries: () => ({
        claimedCount: 0,
        attemptedCount: 0,
        deliveredCount: 0,
        retryScheduledCount: 0,
        deadLetteredCount: 0,
        skippedCount: 0,
        ranAt: "2026-04-13T00:00:00.000Z",
        results: [],
      }),
      dispatchDueWebhookDeliveries: () => ({
        queueName: "protocol-webhooks",
        jobName: "RunProtocolWebhookDeliveries",
        appId: "alpha.app",
        limit: 25,
        enqueuedAt: "2026-04-13T00:00:00.000Z",
      }),
      getAppUsageSummary: () => ({
        appId: "alpha.app",
        generatedAt: "2026-04-13T00:00:00.000Z",
        appStatus: "active",
        issuedScopes: [],
        issuedCapabilities: [],
        grantCounts: { active: 0, revoked: 0 },
        deliveryCounts: {
          queued: 0,
          retrying: 0,
          delivered: 0,
          failed: 0,
          deadLettered: 0,
        },
        queueHealth: {
          replayableCount: 0,
          oldestQueuedAt: null,
          oldestRetryingAt: null,
          lastDeadLetteredAt: null,
        },
        tokenAudit: {
          appUpdatedAt: "2026-04-13T00:00:00.000Z",
          lastRotatedAt: null,
          lastRevokedAt: null,
        },
        grantAudit: {
          lastGrantedAt: null,
          lastRevokedAt: null,
        },
        latestCursor: "0",
        recentEvents: [],
      }),
      dispatchGlobalDueWebhookDeliveries: () => ({
        queueName: "protocol-webhooks",
        jobName: "RunProtocolWebhookDeliveries",
        limit: 25,
        source: "cron",
        enqueuedAt: "2026-04-13T00:00:00.000Z",
      }),
      createIntentAction: () => ({}),
      sendRequestAction: () => ({}),
      acceptRequestAction: () => ({}),
      rejectRequestAction: () => ({}),
      sendChatMessageAction: () => ({}),
      createCircleAction: () => ({}),
      joinCircleAction: () => ({}),
      leaveCircleAction: () => ({}),
      createWebhook: (_appId: string, token: string, payload: unknown) => ({
        token,
        payload,
      }),
      replayEvents: () => [],
      getReplayCursor: () => ({
        appId: "alpha.app",
        cursor: "0",
        updatedAt: "2026-04-13T00:00:00.000Z",
      }),
      saveReplayCursor: (_appId: string, _token: string, cursor: string) => ({
        appId: "alpha.app",
        cursor,
        updatedAt: "2026-04-13T00:00:00.000Z",
      }),
    } as any);

    const response = (await controller.getManifest()) as any;

    expect(response.success).toBe(true);
    expect(response.data.protocolId).toBe("opensocial.manifest.v1");
    expect(response.data.appId).toBe("opensocial-api");
  });

  it("reads the protocol app token header for webhook creation", async () => {
    const controller = new ProtocolController({
      getManifest: () => ({}),
      getDiscovery: () => ({}),
      listEvents: () => [],
      listApps: () => [],
      registerApp: () => ({}),
      getApp: () => ({}),
      listAppGrants: () => [],
      createAppGrant: () => ({}),
      revokeAppGrant: () => ({}),
      rotateAppToken: (_appId: string, token: string) => ({ token }),
      revokeAppToken: (_appId: string, token: string) => ({
        token,
        revoked: true,
      }),
      listWebhooks: () => [],
      listWebhookDeliveries: () => [],
      listWebhookDeliveryAttempts: () => [],
      replayWebhookDelivery: () => ({}),
      replayDeadLetteredDeliveries: () => ({}),
      inspectDeliveryQueue: () => ({
        appId: "alpha.app",
        generatedAt: "2026-04-13T00:00:00.000Z",
        queuedCount: 0,
        inFlightCount: 0,
        failedCount: 0,
        deadLetteredCount: 0,
        replayableCount: 0,
        deliveries: [],
      }),
      runDueWebhookDeliveries: () => ({
        claimedCount: 0,
        attemptedCount: 0,
        deliveredCount: 0,
        retryScheduledCount: 0,
        deadLetteredCount: 0,
        skippedCount: 0,
        ranAt: "2026-04-13T00:00:00.000Z",
        results: [],
      }),
      dispatchDueWebhookDeliveries: () => ({
        queueName: "protocol-webhooks",
        jobName: "RunProtocolWebhookDeliveries",
        appId: "alpha.app",
        limit: 25,
        enqueuedAt: "2026-04-13T00:00:00.000Z",
      }),
      getAppUsageSummary: () => ({
        appId: "alpha.app",
        generatedAt: "2026-04-13T00:00:00.000Z",
        appStatus: "active",
        issuedScopes: [],
        issuedCapabilities: [],
        grantCounts: { active: 0, revoked: 0 },
        deliveryCounts: {
          queued: 0,
          retrying: 0,
          delivered: 0,
          failed: 0,
          deadLettered: 0,
        },
        queueHealth: {
          replayableCount: 0,
          oldestQueuedAt: null,
          oldestRetryingAt: null,
          lastDeadLetteredAt: null,
        },
        tokenAudit: {
          appUpdatedAt: "2026-04-13T00:00:00.000Z",
          lastRotatedAt: null,
          lastRevokedAt: null,
        },
        grantAudit: {
          lastGrantedAt: null,
          lastRevokedAt: null,
        },
        latestCursor: "0",
        recentEvents: [],
      }),
      dispatchGlobalDueWebhookDeliveries: () => ({
        queueName: "protocol-webhooks",
        jobName: "RunProtocolWebhookDeliveries",
        limit: 25,
        source: "cron",
        enqueuedAt: "2026-04-13T00:00:00.000Z",
      }),
      createIntentAction: () => ({}),
      sendRequestAction: () => ({}),
      acceptRequestAction: () => ({}),
      rejectRequestAction: () => ({}),
      sendChatMessageAction: () => ({}),
      createCircleAction: () => ({}),
      joinCircleAction: () => ({}),
      leaveCircleAction: () => ({}),
      createWebhook: (
        _appId: string,
        token: string,
        payload: Record<string, unknown>,
      ) => ({
        token,
        payload,
      }),
      replayEvents: () => [],
      getReplayCursor: () => ({
        appId: "alpha.app",
        cursor: "0",
        updatedAt: "2026-04-13T00:00:00.000Z",
      }),
      saveReplayCursor: (_appId: string, _token: string, cursor: string) => ({
        appId: "alpha.app",
        cursor,
        updatedAt: "2026-04-13T00:00:00.000Z",
      }),
    } as any);

    const response = (await controller.createWebhook(
      "alpha.app",
      {
        "x-protocol-app-token": "secret-token",
      },
      {
        targetUrl: "https://example.com/hooks/opensocial",
        events: ["app.registered"],
      },
    )) as any;

    expect(response.success).toBe(true);
    expect(response.data.token).toBe("secret-token");
    expect(response.data.payload.targetUrl).toContain("example.com");
  });

  it("routes delivery and cursor endpoints through the app token", async () => {
    const controller = new ProtocolController({
      getManifest: () => ({}),
      getDiscovery: () => ({}),
      listEvents: () => [],
      listApps: () => [],
      registerApp: () => ({}),
      getApp: () => ({}),
      listAppGrants: (_appId: string, token: string) => ({ token }),
      listAppConsentRequests: (_appId: string, token: string) => ({ token }),
      createAppGrant: (
        _appId: string,
        token: string,
        payload: Record<string, unknown>,
      ) => ({
        token,
        payload,
      }),
      createAppConsentRequest: (
        _appId: string,
        token: string,
        payload: Record<string, unknown>,
      ) => ({
        token,
        payload,
      }),
      approveAppConsentRequest: (
        _appId: string,
        requestId: string,
        token: string,
        payload: Record<string, unknown>,
      ) => ({
        token,
        requestId,
        payload,
      }),
      rejectAppConsentRequest: (
        _appId: string,
        requestId: string,
        token: string,
        payload: Record<string, unknown>,
      ) => ({
        token,
        requestId,
        payload,
      }),
      revokeAppGrant: (
        _appId: string,
        grantId: string,
        token: string,
        payload: Record<string, unknown>,
      ) => ({
        token,
        grantId,
        payload,
      }),
      rotateAppToken: (_appId: string, token: string) => ({ token }),
      revokeAppToken: (_appId: string, token: string) => ({
        token,
        revoked: true,
      }),
      listWebhooks: () => [],
      listWebhookDeliveries: (
        _appId: string,
        token: string,
        subscriptionId: string,
      ) => ({
        token,
        subscriptionId,
      }),
      listWebhookDeliveryAttempts: (
        _appId: string,
        token: string,
        deliveryId: string,
      ) => ({
        token,
        deliveryId,
      }),
      replayWebhookDelivery: (
        _appId: string,
        token: string,
        deliveryId: string,
      ) => ({
        token,
        deliveryId,
        status: "queued",
      }),
      replayDeadLetteredDeliveries: (
        _appId: string,
        token: string,
        payload: Record<string, unknown>,
      ) => ({
        token,
        payload,
        replayedCount: 2,
      }),
      inspectDeliveryQueue: (
        _appId: string,
        token: string,
        cursor?: string,
      ) => ({
        token,
        cursor,
        replayableCount: 1,
      }),
      runDueWebhookDeliveries: (
        _appId: string,
        token: string,
        payload: Record<string, unknown>,
      ) => ({
        token,
        payload,
      }),
      dispatchDueWebhookDeliveries: (
        _appId: string,
        token: string,
        payload: Record<string, unknown>,
      ) => ({
        token,
        payload,
      }),
      getAppUsageSummary: (_appId: string, token: string) => ({
        token,
        appId: "alpha.app",
        generatedAt: "2026-04-13T00:00:00.000Z",
        appStatus: "active",
        issuedScopes: [],
        issuedCapabilities: [],
        grantCounts: { active: 0, revoked: 0 },
        consentRequestCounts: {
          pending: 0,
          approved: 0,
          rejected: 0,
          cancelled: 0,
          expired: 0,
        },
        deliveryCounts: {
          queued: 0,
          retrying: 0,
          delivered: 0,
          failed: 0,
          deadLettered: 0,
        },
        queueHealth: {
          replayableCount: 0,
          oldestQueuedAt: null,
          oldestRetryingAt: null,
          lastDeadLetteredAt: null,
        },
        tokenAudit: {
          appUpdatedAt: "2026-04-13T00:00:00.000Z",
          lastRotatedAt: null,
          lastRevokedAt: null,
        },
        grantAudit: {
          lastGrantedAt: null,
          lastRevokedAt: null,
        },
        latestCursor: "0",
        recentEvents: [],
      }),
      dispatchGlobalDueWebhookDeliveries: (
        payload: Record<string, unknown>,
      ) => ({
        payload,
        queueName: "protocol-webhooks",
        jobName: "RunProtocolWebhookDeliveries",
        limit: 25,
        source: "cron",
        enqueuedAt: "2026-04-13T00:00:00.000Z",
      }),
      createIntentAction: (
        _appId: string,
        token: string,
        payload: Record<string, unknown>,
      ) => ({
        token,
        payload,
      }),
      sendRequestAction: (
        _appId: string,
        token: string,
        payload: Record<string, unknown>,
      ) => ({
        token,
        payload,
      }),
      acceptRequestAction: (
        _appId: string,
        token: string,
        requestId: string,
        payload: Record<string, unknown>,
      ) => ({
        token,
        requestId,
        payload,
      }),
      rejectRequestAction: (
        _appId: string,
        token: string,
        requestId: string,
        payload: Record<string, unknown>,
      ) => ({
        token,
        requestId,
        payload,
      }),
      sendChatMessageAction: (
        _appId: string,
        token: string,
        chatId: string,
        payload: Record<string, unknown>,
      ) => ({
        token,
        chatId,
        payload,
      }),
      createWebhook: () => ({}),
      replayEvents: (_appId: string, token: string, cursor?: string) => ({
        token,
        cursor,
      }),
      getReplayCursor: (_appId: string, token: string) => ({
        appId: "alpha.app",
        token,
        cursor: "0",
        updatedAt: "2026-04-13T00:00:00.000Z",
      }),
      saveReplayCursor: (_appId: string, token: string, cursor: string) => ({
        appId: "alpha.app",
        token,
        cursor,
        updatedAt: "2026-04-13T00:00:00.000Z",
      }),
    } as any);

    const deliveries = (await controller.listWebhookDeliveries(
      "alpha.app",
      "subscription-1",
      {
        "x-protocol-app-token": "secret-token",
      },
    )) as any;
    const attempts = (await controller.listWebhookDeliveryAttempts(
      "alpha.app",
      "00000000-0000-4000-8000-000000000411",
      {
        "x-protocol-app-token": "secret-token",
      },
    )) as any;
    const replayDelivery = (await controller.replayWebhookDelivery(
      "alpha.app",
      "00000000-0000-4000-8000-000000000411",
      {
        "x-protocol-app-token": "secret-token",
      },
    )) as any;
    const replayBatch = (await controller.replayDeadLetteredDeliveries(
      "alpha.app",
      {
        "x-protocol-app-token": "secret-token",
      },
      {
        limit: 9,
      },
    )) as any;
    const replay = (await controller.replayEvents(
      "alpha.app",
      {
        "x-protocol-app-token": "secret-token",
      },
      "12",
    )) as any;
    const grants = (await controller.listAppGrants("alpha.app", {
      "x-protocol-app-token": "secret-token",
    })) as any;
    const consentRequests = (await controller.listAppConsentRequests(
      "alpha.app",
      {
        "x-protocol-app-token": "secret-token",
      },
    )) as any;
    const createdGrant = (await controller.createAppGrant(
      "alpha.app",
      {
        "x-protocol-app-token": "secret-token",
      },
      {
        scope: "resources.read",
        capabilities: ["app.read"],
        subjectType: "user",
        subjectId: "00000000-0000-4000-8000-000000000001",
      },
    )) as any;
    const createdConsentRequest = (await controller.createAppConsentRequest(
      "alpha.app",
      {
        "x-protocol-app-token": "secret-token",
      },
      {
        scope: "actions.invoke",
        capabilities: ["chat.write"],
        subjectType: "user",
        subjectId: "00000000-0000-4000-8000-000000000010",
        requestedByUserId: "00000000-0000-4000-8000-000000000020",
      },
    )) as any;
    const approvedConsentRequest = (await controller.approveAppConsentRequest(
      "alpha.app",
      "00000000-0000-4000-8000-000000000421",
      {
        "x-protocol-app-token": "secret-token",
      },
      {
        approvedByUserId: "00000000-0000-4000-8000-000000000021",
      },
    )) as any;
    const rejectedConsentRequest = (await controller.rejectAppConsentRequest(
      "alpha.app",
      "00000000-0000-4000-8000-000000000422",
      {
        "x-protocol-app-token": "secret-token",
      },
      {
        rejectedByUserId: "00000000-0000-4000-8000-000000000022",
      },
    )) as any;
    const revokedGrant = (await controller.revokeAppGrant(
      "alpha.app",
      "grant-1",
      {
        "x-protocol-app-token": "secret-token",
      },
      {
        metadata: { reason: "done" },
      },
    )) as any;
    const queue = (await controller.inspectDeliveryQueue(
      "alpha.app",
      {
        "x-protocol-app-token": "secret-token",
      },
      "7",
    )) as any;
    const usage = (await controller.getAppUsageSummary("alpha.app", {
      "x-protocol-app-token": "secret-token",
    })) as any;
    const dispatch = (await controller.dispatchDueWebhookDeliveries(
      "alpha.app",
      {
        "x-protocol-app-token": "secret-token",
      },
      {
        limit: 9,
      },
    )) as any;
    const globalDispatch = (await controller.dispatchGlobalDueWebhookDeliveries(
      undefined,
      { limit: 9 },
    )) as any;
    const currentCursor = (await controller.getReplayCursor("alpha.app", {
      "x-protocol-app-token": "secret-token",
    })) as any;
    const savedCursor = (await controller.saveReplayCursor(
      "alpha.app",
      {
        "x-protocol-app-token": "secret-token",
      },
      {
        cursor: "44",
      },
    )) as any;

    expect(deliveries.data.token).toBe("secret-token");
    expect(deliveries.data.subscriptionId).toBe("subscription-1");
    expect(attempts.data.deliveryId).toBe(
      "00000000-0000-4000-8000-000000000411",
    );
    expect(replayDelivery.data.deliveryId).toBe(
      "00000000-0000-4000-8000-000000000411",
    );
    expect(replayDelivery.data.token).toBe("secret-token");
    expect(replayBatch.data.token).toBe("secret-token");
    expect(replayBatch.data.payload.limit).toBe(9);
    expect(grants.data.token).toBe("secret-token");
    expect(consentRequests.data.token).toBe("secret-token");
    expect(createdGrant.data.token).toBe("secret-token");
    expect(createdGrant.data.payload.scope).toBe("resources.read");
    expect(createdConsentRequest.data.token).toBe("secret-token");
    expect(createdConsentRequest.data.payload.scope).toBe("actions.invoke");
    expect(approvedConsentRequest.data.requestId).toBe(
      "00000000-0000-4000-8000-000000000421",
    );
    expect(rejectedConsentRequest.data.requestId).toBe(
      "00000000-0000-4000-8000-000000000422",
    );
    expect(revokedGrant.data.grantId).toBe("grant-1");
    expect(queue.data.token).toBe("secret-token");
    expect(queue.data.cursor).toBe("7");
    expect(usage.data.token).toBe("secret-token");
    expect(dispatch.data.token).toBe("secret-token");
    expect(dispatch.data.payload.limit).toBe(9);
    expect(globalDispatch.data.payload.limit).toBe(9);
    expect(replay.data.cursor).toBe("12");
    expect(currentCursor.data.cursor).toBe("0");
    expect(savedCursor.data.cursor).toBe("44");
  });

  it("routes protocol action endpoints through the app token", async () => {
    const controller = new ProtocolController({
      getManifest: () => ({}),
      getDiscovery: () => ({}),
      listEvents: () => [],
      listApps: () => [],
      registerApp: () => ({}),
      getApp: () => ({}),
      listAppGrants: () => [],
      createAppGrant: () => ({}),
      revokeAppGrant: () => ({}),
      rotateAppToken: () => ({}),
      revokeAppToken: () => ({}),
      listWebhooks: () => [],
      listWebhookDeliveries: () => [],
      listWebhookDeliveryAttempts: () => [],
      replayWebhookDelivery: () => ({}),
      replayDeadLetteredDeliveries: () => ({}),
      inspectDeliveryQueue: () => ({}),
      runDueWebhookDeliveries: (
        _appId: string,
        token: string,
        payload: Record<string, unknown>,
      ) => ({ token, payload }),
      dispatchDueWebhookDeliveries: (
        _appId: string,
        token: string,
        payload: Record<string, unknown>,
      ) => ({ token, payload }),
      getAppUsageSummary: (_appId: string, token: string) => ({
        token,
        appId: "alpha.app",
        generatedAt: "2026-04-13T00:00:00.000Z",
        appStatus: "active",
        issuedScopes: [],
        issuedCapabilities: [],
        grantCounts: { active: 0, revoked: 0 },
        deliveryCounts: {
          queued: 0,
          retrying: 0,
          delivered: 0,
          failed: 0,
          deadLettered: 0,
        },
        queueHealth: {
          replayableCount: 0,
          oldestQueuedAt: null,
          oldestRetryingAt: null,
          lastDeadLetteredAt: null,
        },
        tokenAudit: {
          appUpdatedAt: "2026-04-13T00:00:00.000Z",
          lastRotatedAt: null,
          lastRevokedAt: null,
        },
        grantAudit: {
          lastGrantedAt: null,
          lastRevokedAt: null,
        },
        latestCursor: "0",
        recentEvents: [],
      }),
      dispatchGlobalDueWebhookDeliveries: () => ({
        queueName: "protocol-webhooks",
        jobName: "RunProtocolWebhookDeliveries",
        limit: 25,
        source: "cron",
        enqueuedAt: "2026-04-13T00:00:00.000Z",
      }),
      createIntentAction: (
        _appId: string,
        token: string,
        payload: Record<string, unknown>,
      ) => ({ token, payload }),
      sendRequestAction: (
        _appId: string,
        token: string,
        payload: Record<string, unknown>,
      ) => ({ token, payload }),
      acceptRequestAction: (
        _appId: string,
        token: string,
        requestId: string,
        payload: Record<string, unknown>,
      ) => ({ token, requestId, payload }),
      rejectRequestAction: (
        _appId: string,
        token: string,
        requestId: string,
        payload: Record<string, unknown>,
      ) => ({ token, requestId, payload }),
      sendChatMessageAction: (
        _appId: string,
        token: string,
        chatId: string,
        payload: Record<string, unknown>,
      ) => ({ token, chatId, payload }),
      createCircleAction: (
        _appId: string,
        token: string,
        payload: Record<string, unknown>,
      ) => ({ token, payload }),
      joinCircleAction: (
        _appId: string,
        token: string,
        circleId: string,
        payload: Record<string, unknown>,
      ) => ({ token, circleId, payload }),
      leaveCircleAction: (
        _appId: string,
        token: string,
        circleId: string,
        payload: Record<string, unknown>,
      ) => ({ token, circleId, payload }),
      createWebhook: () => ({}),
      replayEvents: () => [],
      getReplayCursor: () => ({}),
      saveReplayCursor: () => ({}),
    } as any);

    const intent = (await controller.createIntentAction(
      "alpha.app",
      { "x-protocol-app-token": "secret-token" },
      {
        actorUserId: "00000000-0000-4000-8000-000000000001",
        rawText: "Find dinner",
      },
    )) as any;
    const request = (await controller.sendRequestAction(
      "alpha.app",
      { "x-protocol-app-token": "secret-token" },
      {
        actorUserId: "00000000-0000-4000-8000-000000000001",
        intentId: "00000000-0000-4000-8000-000000000002",
        recipientUserId: "00000000-0000-4000-8000-000000000003",
      },
    )) as any;
    const accept = (await controller.acceptRequestAction(
      "alpha.app",
      "00000000-0000-4000-8000-000000000011",
      { "x-protocol-app-token": "secret-token" },
      { actorUserId: "00000000-0000-4000-8000-000000000001" },
    )) as any;
    const reject = (await controller.rejectRequestAction(
      "alpha.app",
      "00000000-0000-4000-8000-000000000012",
      { "x-protocol-app-token": "secret-token" },
      { actorUserId: "00000000-0000-4000-8000-000000000001" },
    )) as any;
    const chat = (await controller.sendChatMessageAction(
      "alpha.app",
      "00000000-0000-4000-8000-000000000004",
      { "x-protocol-app-token": "secret-token" },
      {
        actorUserId: "00000000-0000-4000-8000-000000000001",
        body: "hello",
      },
    )) as any;
    const circle = (await controller.createCircleAction(
      "alpha.app",
      { "x-protocol-app-token": "secret-token" },
      {
        actorUserId: "00000000-0000-4000-8000-000000000001",
        title: "Design circle",
        visibility: "private",
        topicTags: ["design"],
        cadence: {
          kind: "weekly",
          days: ["thu"],
          hour: 19,
          minute: 0,
          timezone: "America/Argentina/Buenos_Aires",
          intervalWeeks: 1,
        },
      },
    )) as any;
    const joinCircle = (await controller.joinCircleAction(
      "alpha.app",
      "00000000-0000-4000-8000-000000000005",
      { "x-protocol-app-token": "secret-token" },
      {
        actorUserId: "00000000-0000-4000-8000-000000000001",
        memberUserId: "00000000-0000-4000-8000-000000000006",
      },
    )) as any;
    const leaveCircle = (await controller.leaveCircleAction(
      "alpha.app",
      "00000000-0000-4000-8000-000000000005",
      { "x-protocol-app-token": "secret-token" },
      {
        actorUserId: "00000000-0000-4000-8000-000000000001",
        memberUserId: "00000000-0000-4000-8000-000000000006",
      },
    )) as any;
    const run = (await controller.runDueWebhookDeliveries(
      "alpha.app",
      { "x-protocol-app-token": "secret-token" },
      { limit: 10 },
    )) as any;

    expect(intent.data.token).toBe("secret-token");
    expect(request.data.token).toBe("secret-token");
    expect(accept.data.requestId).toBe("00000000-0000-4000-8000-000000000011");
    expect(reject.data.requestId).toBe("00000000-0000-4000-8000-000000000012");
    expect(chat.data.chatId).toBe("00000000-0000-4000-8000-000000000004");
    expect(circle.data.token).toBe("secret-token");
    expect(joinCircle.data.circleId).toBe(
      "00000000-0000-4000-8000-000000000005",
    );
    expect(leaveCircle.data.circleId).toBe(
      "00000000-0000-4000-8000-000000000005",
    );
    expect(run.data.token).toBe("secret-token");
  });

  it("routes app token rotate and revoke through the app token header", async () => {
    const controller = new ProtocolController({
      getManifest: () => ({}),
      getDiscovery: () => ({}),
      listEvents: () => [],
      listApps: () => [],
      registerApp: () => ({}),
      getApp: () => ({}),
      listAppGrants: () => [],
      createAppGrant: () => ({}),
      revokeAppGrant: () => ({}),
      rotateAppToken: (_appId: string, token: string) => ({
        token,
        rotated: true,
      }),
      revokeAppToken: (_appId: string, token: string) => ({
        token,
        revoked: true,
      }),
      listWebhooks: () => [],
      listWebhookDeliveries: () => [],
      listWebhookDeliveryAttempts: () => [],
      replayWebhookDelivery: () => ({}),
      replayDeadLetteredDeliveries: () => ({}),
      inspectDeliveryQueue: () => ({
        appId: "alpha.app",
        generatedAt: "2026-04-13T00:00:00.000Z",
        queuedCount: 0,
        inFlightCount: 0,
        failedCount: 0,
        deadLetteredCount: 0,
        replayableCount: 0,
        deliveries: [],
      }),
      runDueWebhookDeliveries: () => ({
        claimedCount: 0,
        attemptedCount: 0,
        deliveredCount: 0,
        retryScheduledCount: 0,
        deadLetteredCount: 0,
        skippedCount: 0,
        ranAt: "2026-04-13T00:00:00.000Z",
        results: [],
      }),
      dispatchDueWebhookDeliveries: () => ({
        queueName: "protocol-webhooks",
        jobName: "RunProtocolWebhookDeliveries",
        appId: "alpha.app",
        limit: 25,
        enqueuedAt: "2026-04-13T00:00:00.000Z",
      }),
      getAppUsageSummary: () => ({
        appId: "alpha.app",
        generatedAt: "2026-04-13T00:00:00.000Z",
        appStatus: "active",
        issuedScopes: [],
        issuedCapabilities: [],
        grantCounts: { active: 0, revoked: 0 },
        deliveryCounts: {
          queued: 0,
          retrying: 0,
          delivered: 0,
          failed: 0,
          deadLettered: 0,
        },
        queueHealth: {
          replayableCount: 0,
          oldestQueuedAt: null,
          oldestRetryingAt: null,
          lastDeadLetteredAt: null,
        },
        tokenAudit: {
          appUpdatedAt: "2026-04-13T00:00:00.000Z",
          lastRotatedAt: null,
          lastRevokedAt: null,
        },
        grantAudit: {
          lastGrantedAt: null,
          lastRevokedAt: null,
        },
        latestCursor: "0",
        recentEvents: [],
      }),
      dispatchGlobalDueWebhookDeliveries: () => ({
        queueName: "protocol-webhooks",
        jobName: "RunProtocolWebhookDeliveries",
        limit: 25,
        source: "cron",
        enqueuedAt: "2026-04-13T00:00:00.000Z",
      }),
      createIntentAction: () => ({}),
      sendRequestAction: () => ({}),
      acceptRequestAction: () => ({}),
      rejectRequestAction: () => ({}),
      sendChatMessageAction: () => ({}),
      createCircleAction: () => ({}),
      joinCircleAction: () => ({}),
      leaveCircleAction: () => ({}),
      createWebhook: () => ({}),
      replayEvents: () => [],
      getReplayCursor: () => ({
        appId: "alpha.app",
        cursor: "0",
        updatedAt: "2026-04-13T00:00:00.000Z",
      }),
      saveReplayCursor: (_appId: string, _token: string, cursor: string) => ({
        appId: "alpha.app",
        cursor,
        updatedAt: "2026-04-13T00:00:00.000Z",
      }),
    } as any);

    const rotated = (await controller.rotateAppToken("alpha.app", {
      "x-protocol-app-token": "secret-token",
    })) as any;
    const revoked = (await controller.revokeAppToken("alpha.app", {
      "x-protocol-app-token": "secret-token",
    })) as any;

    expect(rotated.success).toBe(true);
    expect(rotated.data.token).toBe("secret-token");
    expect(rotated.data.rotated).toBe(true);
    expect(revoked.success).toBe(true);
    expect(revoked.data.token).toBe("secret-token");
    expect(revoked.data.revoked).toBe(true);
  });
});
