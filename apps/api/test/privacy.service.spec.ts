import { describe, expect, it, vi } from "vitest";
import { PrivacyService } from "../src/privacy/privacy.service.js";

describe("PrivacyService", () => {
  it("returns retention policy defaults", () => {
    const service = new PrivacyService({} as any);
    const policy = service.getRetentionPolicy();

    expect(policy.version).toBe(1);
    expect(policy.retention.chatMessagesDays).toBe(180);
    expect(policy.retention.auditLogsDays).toBe(365);
    expect(policy.retention.notificationsDays).toBe(90);
    expect(policy.rights.userDataExport).toBe(true);
  });

  it("resets learned memory and keeps explicit preferences", async () => {
    const tx: any = {
      retrievalDocument: {
        findMany: vi.fn().mockResolvedValue([{ id: "doc-1" }]),
        deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      inferredPreference: {
        deleteMany: vi.fn().mockResolvedValue({ count: 3 }),
      },
      preferenceFeedbackEvent: {
        deleteMany: vi.fn().mockResolvedValue({ count: 2 }),
      },
      lifeGraphEdge: {
        deleteMany: vi.fn().mockResolvedValue({ count: 4 }),
      },
      lifeGraphNode: {
        deleteMany: vi.fn().mockResolvedValue({ count: 5 }),
      },
      retrievalChunk: {
        deleteMany: vi.fn().mockResolvedValue({ count: 6 }),
      },
      explicitPreference: {
        deleteMany: vi.fn().mockResolvedValue({ count: 7 }),
      },
      embedding: {
        deleteMany: vi.fn().mockResolvedValue({ count: 8 }),
      },
      auditLog: {
        create: vi.fn().mockResolvedValue({ id: "audit-1" }),
      },
    };
    const prisma: any = {
      user: {
        findUnique: vi
          .fn()
          .mockResolvedValue({ id: "user-1", status: "active" }),
      },
      $transaction: vi.fn(async (fn: (input: unknown) => unknown) => fn(tx)),
    };

    const service = new PrivacyService(prisma);
    const result = await service.resetUserMemory("user-1", {
      mode: "learned_memory",
    });

    expect(result.mode).toBe("learned_memory");
    expect(result.deleted.inferredPreferences).toBe(3);
    expect(result.deleted.explicitPreferences).toBe(0);
    expect(tx.explicitPreference.deleteMany).not.toHaveBeenCalled();
    expect(tx.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "privacy.memory_reset",
        }),
      }),
    );
  });

  it("can reset only memory for a specific source surface without deleting learned preferences", async () => {
    const tx: any = {
      retrievalDocument: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: "doc-dm",
            docType: "interaction_summary",
            content:
              'summary: dm\ncontext: {"memory":{"class":"interaction_summary","provenance":{"sourceSurface":"dm_chat"}}}',
          },
          {
            id: "doc-agent",
            docType: "interaction_summary",
            content:
              'summary: agent\ncontext: {"memory":{"class":"interaction_summary","provenance":{"sourceSurface":"agent_chat"}}}',
          },
        ]),
        deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      inferredPreference: {
        deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
      },
      preferenceFeedbackEvent: {
        deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
      },
      lifeGraphEdge: {
        deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
      },
      lifeGraphNode: {
        deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
      },
      retrievalChunk: {
        deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      explicitPreference: {
        deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
      },
      embedding: {
        deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      auditLog: {
        create: vi.fn().mockResolvedValue({ id: "audit-surface" }),
      },
    };
    const prisma: any = {
      user: {
        findUnique: vi
          .fn()
          .mockResolvedValue({ id: "user-1", status: "active" }),
      },
      $transaction: vi.fn(async (fn: (input: unknown) => unknown) => fn(tx)),
    };

    const service = new PrivacyService(prisma);
    const result = await service.resetUserMemory("user-1", {
      mode: "surface_memory",
      surfaces: ["dm_chat"],
    });

    expect(result.mode).toBe("surface_memory");
    expect(result.deleted.retrievalDocuments).toBe(1);
    expect(tx.inferredPreference.deleteMany).not.toHaveBeenCalled();
    expect(tx.retrievalDocument.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: ["doc-dm"] } },
    });
  });

  it("anonymizes and deletes account-linked data", async () => {
    const tx: any = {
      retrievalDocument: {
        findMany: vi.fn().mockResolvedValue([{ id: "doc-1" }]),
        deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      agentThread: {
        findMany: vi.fn().mockResolvedValue([{ id: "thread-1" }]),
        deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      userSession: {
        updateMany: vi.fn().mockResolvedValue({ count: 2 }),
      },
      userProfileImage: {
        deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      userInterest: {
        deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      userTopic: {
        deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      userAvailabilityWindow: {
        deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      userRule: {
        deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      userPreference: {
        deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      inferredPreference: {
        deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      explicitPreference: {
        deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      preferenceFeedbackEvent: {
        deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      lifeGraphEdge: {
        deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      lifeGraphNode: {
        deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      retrievalChunk: {
        deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      embedding: {
        deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      agentMessage: {
        deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      chatMessage: {
        updateMany: vi.fn().mockResolvedValue({ count: 2 }),
      },
      intent: {
        updateMany: vi.fn().mockResolvedValue({ count: 3 }),
      },
      notification: {
        deleteMany: vi.fn().mockResolvedValue({ count: 4 }),
      },
      block: {
        deleteMany: vi.fn().mockResolvedValue({ count: 5 }),
      },
      userProfile: {
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      user: {
        update: vi.fn().mockResolvedValue({ id: "user-1" }),
      },
      auditLog: {
        create: vi.fn().mockResolvedValue({ id: "audit-2" }),
      },
    };

    const prisma: any = {
      user: {
        findUnique: vi
          .fn()
          .mockResolvedValue({ id: "user-1", status: "active" }),
      },
      $transaction: vi.fn(async (fn: (input: unknown) => unknown) => fn(tx)),
    };

    const service = new PrivacyService(prisma);
    const result = await service.deleteAccount("user-1", {
      reason: "user_request",
    });

    expect(result.alreadyDeleted).toBe(false);
    expect(tx.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "user-1" },
        data: expect.objectContaining({
          status: "deleted",
          email: null,
          googleSubjectId: null,
        }),
      }),
    );
    expect(tx.userSession.updateMany).toHaveBeenCalled();
    expect(tx.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "privacy.account_deleted",
        }),
      }),
    );
  });

  it("returns alreadyDeleted when account is already deleted", async () => {
    const prisma: any = {
      user: {
        findUnique: vi
          .fn()
          .mockResolvedValue({ id: "user-1", status: "deleted" }),
      },
      $transaction: vi.fn(),
    };

    const service = new PrivacyService(prisma);
    const result = await service.deleteAccount("user-1", {});

    expect(result.alreadyDeleted).toBe(true);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
