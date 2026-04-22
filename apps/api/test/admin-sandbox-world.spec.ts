import { describe, expect, it, vi } from "vitest";
import {
  buildDesignSandboxWorldSeedPlan,
  designSandboxWorldV1Fixture,
  normalizeDesignSandboxWorldFixture,
} from "../src/admin/sandbox-worlds/design-sandbox-v1.fixture.js";
import { seedDesignSandboxWorld } from "../src/admin/sandbox-worlds/design-sandbox-seeder.js";

const ACTOR = {
  adminUserId: "11111111-1111-4111-8111-111111111111",
  role: "admin" as const,
};

function createSeedPrismaMock() {
  const tx = {
    user: { upsert: vi.fn().mockResolvedValue({}) },
    userProfile: { upsert: vi.fn().mockResolvedValue({}) },
    userTopic: { upsert: vi.fn().mockResolvedValue({}) },
    userInterest: { upsert: vi.fn().mockResolvedValue({}) },
    userPreference: { upsert: vi.fn().mockResolvedValue({}) },
    userAvailabilityWindow: { upsert: vi.fn().mockResolvedValue({}) },
    agentThread: { upsert: vi.fn().mockResolvedValue({}) },
    agentMessage: { upsert: vi.fn().mockResolvedValue({}) },
    connection: { upsert: vi.fn().mockResolvedValue({}) },
    connectionParticipant: { upsert: vi.fn().mockResolvedValue({}) },
    chat: { upsert: vi.fn().mockResolvedValue({}) },
    chatMembership: { upsert: vi.fn().mockResolvedValue({}) },
    chatMessage: { upsert: vi.fn().mockResolvedValue({}) },
    intent: { upsert: vi.fn().mockResolvedValue({}) },
    intentCandidate: { upsert: vi.fn().mockResolvedValue({}) },
    intentRequest: { upsert: vi.fn().mockResolvedValue({}) },
    notification: { upsert: vi.fn().mockResolvedValue({}) },
  };

  const prisma = {
    $transaction: vi.fn(
      async (callback: (transaction: typeof tx) => Promise<void>) =>
        callback(tx),
    ),
  };

  return { prisma, tx };
}

describe("design sandbox v1 fixture", () => {
  it("normalizes into a concrete seed plan", () => {
    const normalized = normalizeDesignSandboxWorldFixture(
      designSandboxWorldV1Fixture,
    );
    const plan = buildDesignSandboxWorldSeedPlan(normalized);

    expect(plan.fixture.worldId).toBe("design-sandbox-v1");
    expect(plan.summary.userCount).toBeGreaterThanOrEqual(5);
    expect(plan.summary.connectionCount).toBe(2);
    expect(plan.summary.chatCount).toBe(2);
    expect(plan.summary.intentCount).toBeGreaterThanOrEqual(2);
    expect(plan.summary.notificationCount).toBeGreaterThanOrEqual(2);
    expect(plan.fixture.connections[0]?.chat.messages[0]?.body).toMatch(/\S/);
  });

  it("seeds the sandbox world through Prisma upserts", async () => {
    const { prisma, tx } = createSeedPrismaMock();
    const result = await seedDesignSandboxWorld(prisma as never, ACTOR);

    expect(result.worldId).toBe("design-sandbox-v1");
    expect(result.summary.userCount).toBeGreaterThan(0);
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.user.upsert).toHaveBeenCalled();
    expect(tx.connection.upsert).toHaveBeenCalledTimes(2);
    expect(tx.chat.upsert).toHaveBeenCalledTimes(2);
    expect(tx.chatMembership.upsert).toHaveBeenCalledTimes(6);
    expect(tx.intent.upsert).toHaveBeenCalledTimes(2);
    expect(tx.notification.upsert).toHaveBeenCalledTimes(3);
    expect(tx.agentThread.upsert).toHaveBeenCalledTimes(1);
  });
});
