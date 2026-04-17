import { describe, expect, it } from "vitest";
import {
  evaluateProtocolAgentReadiness,
  type ProtocolAgentReadinessOptions,
} from "./index.js";
import type { ProtocolAppOperationalSnapshot } from "@opensocial/protocol-types";

function createSnapshot(
  overrides: Partial<
    ProtocolAppOperationalSnapshot["usage"]["tokenAudit"]
  > = {},
): ProtocolAppOperationalSnapshot {
  return {
    usage: {
      appId: "partner.alpha",
      generatedAt: "2026-04-17T00:00:00.000Z",
      appStatus: "active",
      issuedScopes: ["protocol.read", "actions.invoke"],
      issuedCapabilities: ["app.read", "chat.write"],
      grantCounts: { active: 1, revoked: 0 },
      grantSubjectCounts: { user: 1, app: 0, service: 0, agent: 0 },
      delegatedExecutionSupport: {
        executableSubjectTypes: ["user"],
        modeledOnlySubjectTypes: ["app", "service", "agent"],
      },
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
        appUpdatedAt: "2026-04-17T00:00:00.000Z",
        lastRotatedAt: "2026-04-01T00:00:00.000Z",
        lastRevokedAt: null,
        currentTokenIssuedAt: "2026-04-01T00:00:00.000Z",
        recommendedRotateBy: "2026-06-30T00:00:00.000Z",
        tokenAgeDays: 16,
        rotationWindowDays: 90,
        freshness: "current",
        ...overrides,
      },
      grantAudit: {
        lastGrantedAt: "2026-04-01T00:00:00.000Z",
        lastRevokedAt: null,
      },
      authFailureCounts: {
        missingToken: 0,
        appNotFound: 0,
        appRevoked: 0,
        invalidToken: 0,
        missingScopes: 0,
        missingCapabilities: 0,
        missingDelegatedGrant: 0,
      },
      recentAuthFailures: [],
      latestCursor: "12",
      recentEvents: [],
    },
    queue: {
      appId: "partner.alpha",
      generatedAt: "2026-04-17T00:00:00.000Z",
      queuedCount: 0,
      inFlightCount: 0,
      failedCount: 0,
      deadLetteredCount: 0,
      replayableCount: 0,
      oldestQueuedAt: null,
      oldestRetryingAt: null,
      lastDeadLetteredAt: null,
      queueState: {
        waiting: 0,
        active: 0,
        delayed: 0,
        completed: 0,
        failed: 0,
      },
      deliveries: [],
    },
    grants: [
      {
        grantId: "00000000-0000-4000-8000-000000000001",
        appId: "partner.alpha",
        scope: "actions.invoke",
        capabilities: ["chat.write"],
        subjectType: "user",
        subjectId: "00000000-0000-4000-8000-000000000123",
        executionMode: "executable",
        status: "active",
        grantedByUserId: null,
        grantedAt: "2026-04-01T00:00:00.000Z",
        revokedAt: null,
        metadata: {},
        createdAt: "2026-04-01T00:00:00.000Z",
        updatedAt: "2026-04-01T00:00:00.000Z",
      },
    ],
    consentRequests: [],
    webhooks: [],
  };
}

describe("evaluateProtocolAgentReadiness", () => {
  it("warns when token rotation is due soon", () => {
    const snapshot = createSnapshot({
      freshness: "rotate_soon",
      tokenAgeDays: 82,
      recommendedRotateBy: "2026-04-20T00:00:00.000Z",
    });

    const report = evaluateProtocolAgentReadiness(snapshot);

    expect(report.ok).toBe(true);
    expect(report.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "token_rotation_due_soon",
          severity: "warning",
        }),
      ]),
    );
  });

  it("warns by default when a token is stale", () => {
    const snapshot = createSnapshot({
      freshness: "stale",
      tokenAgeDays: 101,
    });

    const report = evaluateProtocolAgentReadiness(snapshot);

    expect(report.ok).toBe(true);
    expect(report.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "token_rotation_stale",
          severity: "warning",
        }),
      ]),
    );
  });

  it("blocks when failOnStaleToken is enabled", () => {
    const snapshot = createSnapshot({
      freshness: "stale",
      tokenAgeDays: 120,
    });
    const options: ProtocolAgentReadinessOptions = {
      failOnStaleToken: true,
    };

    const report = evaluateProtocolAgentReadiness(snapshot, options);

    expect(report.ok).toBe(false);
    expect(report.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "token_rotation_stale",
          severity: "blocking",
        }),
      ]),
    );
  });
});
