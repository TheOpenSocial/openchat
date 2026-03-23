import { ConflictException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { ClientMutationService } from "../src/database/client-mutation.service.js";

function createPrismaMock() {
  const rows = new Map<string, any>();
  const buildKey = (input: {
    userId: string;
    scope: string;
    idempotencyKey: string;
  }) => `${input.userId}:${input.scope}:${input.idempotencyKey}`;

  const prisma: any = {
    clientMutation: {
      findUnique: vi.fn(async ({ where }: any) => {
        return rows.get(buildKey(where.userId_scope_idempotencyKey)) ?? null;
      }),
      create: vi.fn(async ({ data }: any) => {
        const key = buildKey(data);
        if (rows.has(key)) {
          const error: any = new Error("duplicate");
          error.code = "P2002";
          error.constructor = { name: "PrismaClientKnownRequestError" };
          throw error;
        }
        const created = {
          ...data,
          responseBody: null,
          errorCode: null,
          errorMessage: null,
        };
        rows.set(key, created);
        return created;
      }),
      update: vi.fn(async ({ where, data }: any) => {
        const key = buildKey(where.userId_scope_idempotencyKey);
        const existing = rows.get(key);
        const updated = {
          ...existing,
          ...data,
        };
        rows.set(key, updated);
        return updated;
      }),
    },
  };

  return { prisma, rows };
}

describe("ClientMutationService", () => {
  it("returns cached response for completed mutation replay", async () => {
    const { prisma } = createPrismaMock();
    const service = new ClientMutationService(prisma);
    const handler = vi.fn().mockResolvedValue({ id: "intent-1" });

    const first = await service.run({
      userId: "user-1",
      scope: "intent.create",
      idempotencyKey: "mobile-outbox-1",
      handler,
    });
    const second = await service.run({
      userId: "user-1",
      scope: "intent.create",
      idempotencyKey: "mobile-outbox-1",
      handler,
    });

    expect(first).toEqual({ id: "intent-1" });
    expect(second).toEqual({ id: "intent-1" });
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("deduplicates onboarding activation replays for intent.create_from_agent scope", async () => {
    const { prisma } = createPrismaMock();
    const service = new ClientMutationService(prisma);
    const handler = vi.fn().mockResolvedValue({
      intentId: "intent-activation-1",
      intentIds: ["intent-activation-1"],
      intentCount: 1,
    });

    const idempotencyKey = "onboarding-carryover:user-1:activation-intent-hash";

    const first = await service.run({
      userId: "user-1",
      scope: "intent.create_from_agent",
      idempotencyKey,
      handler,
    });
    const second = await service.run({
      userId: "user-1",
      scope: "intent.create_from_agent",
      idempotencyKey,
      handler,
    });

    expect(first).toEqual({
      intentId: "intent-activation-1",
      intentIds: ["intent-activation-1"],
      intentCount: 1,
    });
    expect(second).toEqual({
      intentId: "intent-activation-1",
      intentIds: ["intent-activation-1"],
      intentCount: 1,
    });
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("allows retry after a failed mutation attempt", async () => {
    const { prisma } = createPrismaMock();
    const service = new ClientMutationService(prisma);
    const handler = vi
      .fn()
      .mockRejectedValueOnce(new Error("temporary failure"))
      .mockResolvedValueOnce({ id: "intent-2" });

    await expect(
      service.run({
        userId: "user-1",
        scope: "intent.create",
        idempotencyKey: "mobile-outbox-2",
        handler,
      }),
    ).rejects.toThrow("temporary failure");

    const retried = await service.run({
      userId: "user-1",
      scope: "intent.create",
      idempotencyKey: "mobile-outbox-2",
      handler,
    });

    expect(retried).toEqual({ id: "intent-2" });
    expect(handler).toHaveBeenCalledTimes(2);
  });

  it("throws conflict while a matching mutation is still processing", async () => {
    const { prisma, rows } = createPrismaMock();
    rows.set("user-1:agent.respond:processing-key", {
      userId: "user-1",
      scope: "agent.respond",
      idempotencyKey: "processing-key",
      status: "processing",
      responseBody: null,
      errorCode: null,
      errorMessage: null,
    });

    const service = new ClientMutationService(prisma);

    await expect(
      service.run({
        userId: "user-1",
        scope: "agent.respond",
        idempotencyKey: "processing-key",
        handler: vi.fn(),
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});
