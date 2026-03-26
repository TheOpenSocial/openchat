import { describe, expect, it, vi } from "vitest";
import { RuntimeService } from "../src/runtime/runtime.service.js";

function createHarness(input?: {
  trustScore?: number;
  workflowDomainIntentFails?: boolean;
}) {
  const prisma: any = {
    workflowDomainIntent: {
      create: input?.workflowDomainIntentFails
        ? vi.fn().mockRejectedValue(new Error("table missing"))
        : vi.fn().mockResolvedValue({}),
    },
    userPreference: {
      create: vi.fn().mockResolvedValue({}),
      findFirst: vi.fn().mockResolvedValue({
        value: {
          listingId: "listing-1",
          buyerUserId: "11111111-1111-4111-8111-111111111111",
          sellerUserId: "22222222-2222-4222-8222-222222222222",
        },
      }),
    },
    userProfile: {
      findUnique: vi.fn().mockResolvedValue({
        trustScore: input?.trustScore ?? 90,
      }),
    },
    datingConsentArtifact: {
      create: vi.fn().mockResolvedValue({}),
    },
    commerceListing: {
      create: vi.fn().mockResolvedValue({}),
    },
    commerceOffer: {
      create: vi.fn().mockResolvedValue({}),
      update: vi.fn().mockResolvedValue({}),
      findUnique: vi.fn().mockResolvedValue({
        listingId: "listing-1",
        buyerUserId: "11111111-1111-4111-8111-111111111111",
        sellerUserId: "22222222-2222-4222-8222-222222222222",
      }),
    },
    commerceEscrow: {
      upsert: vi.fn().mockResolvedValue({}),
    },
    commerceDispute: {
      create: vi.fn().mockResolvedValue({}),
    },
  };

  const workflowRuntimeService: any = {
    buildWorkflowRunId: vi.fn(
      (input: { domain: string; entityType: string; entityId: string }) =>
        `${input.domain}:${input.entityType}:${input.entityId}`,
    ),
    startRun: vi.fn().mockResolvedValue({}),
    checkpoint: vi.fn().mockResolvedValue({}),
    linkSideEffect: vi.fn().mockResolvedValue({}),
    getRunDetails: vi.fn().mockResolvedValue(null),
  };

  const notificationsService: any = {
    createInAppNotification: vi.fn().mockResolvedValue({}),
  };

  return {
    prisma,
    workflowRuntimeService,
    notificationsService,
    service: new RuntimeService(
      prisma,
      workflowRuntimeService,
      notificationsService,
    ),
  };
}

describe("RuntimeService", () => {
  it("creates intents with replayable workflow envelope", async () => {
    const { service, workflowRuntimeService } = createHarness();
    const response = await service.createIntent({
      userId: "11111111-1111-4111-8111-111111111111",
      rawText: "Find me someone to play tennis tonight",
      domain: "social",
    });

    expect(response.domain).toBe("social");
    expect(response.replayability).toBe("replayable");
    expect(response.stage.stage).toBe("domain_routing");
    expect(workflowRuntimeService.startRun).toHaveBeenCalledTimes(1);
    expect(workflowRuntimeService.checkpoint).toHaveBeenCalled();
  });

  it("falls back to partial replayability when primary intent persistence fails", async () => {
    const { service, prisma } = createHarness({
      workflowDomainIntentFails: true,
    });
    const response = await service.createIntent({
      userId: "11111111-1111-4111-8111-111111111111",
      rawText: "Find me a commerce intro",
      domain: "commerce",
    });

    expect(response.replayability).toBe("partial");
    expect(prisma.userPreference.create).toHaveBeenCalledTimes(1);
  });

  it("blocks dating consent when trust/verification do not meet policy", async () => {
    const { service } = createHarness({ trustScore: 40 });
    const response = await service.createDatingConsent({
      userId: "11111111-1111-4111-8111-111111111111",
      targetUserId: "22222222-2222-4222-8222-222222222222",
      scope: "dm_intro",
      consentState: "granted",
      verificationState: "verified",
    });

    expect(response.consentState).toBe("pending");
    expect(response.replayability).toBe("inspect_only");
  });

  it("transitions accepted commerce offers into escrow pending funding", async () => {
    const { service } = createHarness();
    const response = await service.respondCommerceOffer(
      "33333333-3333-4333-8333-333333333333",
      {
        actorUserId: "22222222-2222-4222-8222-222222222222",
        action: "accept",
      },
    );

    expect(response.state).toBe("accepted");
    expect(response.escrowState).toBe("pending_funding");
  });

  it("transitions disputed commerce offers into frozen escrow", async () => {
    const { service } = createHarness();
    const response = await service.respondCommerceOffer(
      "33333333-3333-4333-8333-333333333333",
      {
        actorUserId: "11111111-1111-4111-8111-111111111111",
        action: "dispute",
        reason: "suspected_fraud",
      },
    );

    expect(response.state).toBe("disputed");
    expect(response.escrowState).toBe("frozen");
  });
});
