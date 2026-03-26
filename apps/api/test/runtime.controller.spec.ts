import { ForbiddenException, RequestMethod } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { RuntimeController } from "../src/runtime/runtime.controller.js";

function createController(overrides?: {
  runtimeService?: Record<string, unknown>;
}) {
  const runtimeService: any = {
    createIntent: vi.fn(),
    createDatingConsent: vi.fn(),
    createCommerceListing: vi.fn(),
    createCommerceOffer: vi.fn(),
    respondCommerceOffer: vi.fn(),
    getWorkflowDetails: vi.fn(),
    ...(overrides?.runtimeService ?? {}),
  };

  return {
    runtimeService,
    controller: new RuntimeController(runtimeService),
  };
}

describe("RuntimeController", () => {
  it("uses canonical runtime route mappings", () => {
    expect(Reflect.getMetadata("path", RuntimeController)).toBe("runtime");
    expect(
      Reflect.getMetadata("path", RuntimeController.prototype.createIntent),
    ).toBe("intents");
    expect(
      Reflect.getMetadata("path", RuntimeController.prototype.getWorkflowRun),
    ).toBe("workflows/:workflowRunId");
    expect(
      Reflect.getMetadata("method", RuntimeController.prototype.createIntent),
    ).toBe(RequestMethod.POST);
    expect(
      Reflect.getMetadata("method", RuntimeController.prototype.getWorkflowRun),
    ).toBe(RequestMethod.GET);
  });

  it("creates runtime intents for matching actor user", async () => {
    const payload = {
      userId: "11111111-1111-4111-8111-111111111111",
      rawText: "Find a hiking partner this weekend",
      domain: "social" as const,
    };
    const response = {
      intentId: "22222222-2222-4222-8222-222222222222",
      domain: "social" as const,
      status: "accepted",
      workflowRunId: "social:intent:22222222-2222-4222-8222-222222222222",
      traceId: "trace-1",
      replayability: "replayable" as const,
      stage: {
        stage: "domain_routing",
        status: "completed" as const,
      },
      sideEffectIntegrity: {
        sideEffectCount: 0,
        dedupedSideEffectCount: 0,
        reusedRelations: [],
      },
    };
    const { controller, runtimeService } = createController({
      runtimeService: {
        createIntent: vi.fn().mockResolvedValue(response),
      },
    });

    const result = await controller.createIntent(payload, payload.userId);

    expect(runtimeService.createIntent).toHaveBeenCalledWith(payload);
    expect(result.success).toBe(true);
    expect(result.data).toEqual(response);
  });

  it("rejects runtime intent when payload user does not match actor", async () => {
    const payload = {
      userId: "11111111-1111-4111-8111-111111111111",
      rawText: "Mismatch actor",
      domain: "social" as const,
    };
    const { controller, runtimeService } = createController();

    await expect(
      controller.createIntent(payload, "33333333-3333-4333-8333-333333333333"),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(runtimeService.createIntent).not.toHaveBeenCalled();
  });

  it("returns workflow details envelope", async () => {
    const workflowRunId = "social:intent:abc";
    const { controller, runtimeService } = createController({
      runtimeService: {
        getWorkflowDetails: vi.fn().mockResolvedValue({
          run: {
            workflowRunId,
            traceId: "trace-workflow",
            domain: "social",
            replayability: "replayable",
            health: "healthy",
            stages: [],
            sideEffects: [],
            integrity: {
              sideEffectCount: 0,
              dedupedSideEffectCount: 0,
              reusedRelations: [],
            },
          },
        }),
      },
    });

    const result = await controller.getWorkflowRun(workflowRunId);

    expect(runtimeService.getWorkflowDetails).toHaveBeenCalledWith(
      workflowRunId,
    );
    expect(result.success).toBe(true);
    expect((result as any).data?.run?.workflowRunId).toBe(workflowRunId);
  });
});
