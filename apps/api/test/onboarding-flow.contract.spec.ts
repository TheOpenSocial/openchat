import { describe, expect, it, vi } from "vitest";
import { OnboardingController } from "../src/onboarding/onboarding.controller.js";
import { ProfilesService } from "../src/profiles/profiles.service.js";
import { ClientMutationService } from "../src/database/client-mutation.service.js";

function createProfilesServiceForOnboardingFlow(userId: string) {
  let profile: any = {
    userId,
    onboardingState: "not_started",
    bio: null,
    city: null,
    country: null,
  };
  let interests: Array<any> = [];

  const prisma: any = {
    userProfile: {
      findUnique: vi.fn().mockImplementation(({ select }: any) => {
        if (!profile) {
          return null;
        }
        if (!select) {
          return { ...profile };
        }
        const result: Record<string, unknown> = {};
        for (const key of Object.keys(select)) {
          if (select[key]) {
            result[key] = profile[key] ?? null;
          }
        }
        return result;
      }),
      upsert: vi.fn().mockImplementation(({ update, create }: any) => {
        profile = {
          ...(profile ?? { userId }),
          ...(profile ? update : create),
        };
        return { ...profile };
      }),
      update: vi.fn().mockImplementation(({ data }: any) => {
        profile = { ...profile, ...data };
        return { ...profile };
      }),
    },
    userInterest: {
      count: vi.fn().mockImplementation(() => interests.length),
      deleteMany: vi.fn().mockImplementation(() => {
        interests = [];
        return { count: 0 };
      }),
      createMany: vi.fn().mockImplementation(({ data }: any) => {
        interests = [...data];
        return { count: data.length };
      }),
      findMany: vi.fn().mockImplementation(() => [...interests]),
    },
    user: {
      update: vi.fn().mockResolvedValue({ id: userId }),
    },
  };

  const notificationsService: any = {
    createInAppNotification: vi.fn().mockResolvedValue({}),
  };
  const matchingService: any = {
    upsertUserProfileEmbedding: vi.fn().mockResolvedValue({}),
    upsertInterestTopicEmbeddings: vi.fn().mockResolvedValue({}),
  };
  const mediaProcessingQueue: any = {
    add: vi.fn().mockResolvedValue({ id: "job-1" }),
  };
  const analyticsService: any = {
    trackEvent: vi.fn().mockResolvedValue({}),
  };

  return {
    prisma,
    service: new ProfilesService(
      prisma,
      notificationsService,
      matchingService,
      mediaProcessingQueue,
      analyticsService,
    ),
    getProfile: () => ({ ...profile }),
    getInterests: () => [...interests],
  };
}

describe("Onboarding flow contract", () => {
  it("keeps infer-fast/infer lifecycle states and persists persona-confirmed profile to complete", async () => {
    const userId = "11111111-1111-4111-8111-111111111111";
    const onboardingService: any = {
      inferQuickFromTranscript: vi.fn().mockResolvedValue({
        transcript: "I want local design and football plans.",
        interests: ["design", "football"],
        goals: ["meet people", "make plans"],
        summary: "You want local design and football plans.",
        firstIntent: "Help me meet people around design and football.",
        followUpQuestion: "Do you prefer groups or 1:1?",
        lifecycle: {
          current: "infer-success",
          transitions: ["infer-started", "infer-processing", "infer-success"],
        },
      }),
      inferFromTranscript: vi.fn().mockResolvedValue({
        transcript: "I want local design and football plans.",
        interests: ["design", "football"],
        goals: ["meet people", "make plans"],
        mode: "social",
        format: "small_groups",
        style: "Chill",
        availability: "Weekends",
        area: "Buenos Aires",
        country: "Argentina",
        summary:
          "You are looking for social plans around design and football in Buenos Aires.",
        persona: "Design Connector",
        firstIntent: "Find me social plans around design and football.",
        lifecycle: {
          current: "infer-success",
          transitions: ["infer-started", "infer-processing", "infer-success"],
        },
      }),
    };

    const onboardingController = new OnboardingController(onboardingService);
    const quick = await onboardingController.inferFast(
      {
        userId,
        transcript: "I want local design and football plans.",
      },
      userId,
    );
    const rich = await onboardingController.infer(
      {
        userId,
        transcript: "I want local design and football plans.",
      },
      userId,
    );
    const quickData = quick.data as any;
    const richData = rich.data as any;

    expect(quickData.lifecycle?.current).toBe("infer-success");
    expect(quickData.lifecycle?.transitions).toEqual([
      "infer-started",
      "infer-processing",
      "infer-success",
    ]);
    expect(richData.lifecycle?.current).toBe("infer-success");
    expect(richData.lifecycle?.transitions).toEqual([
      "infer-started",
      "infer-processing",
      "infer-success",
    ]);

    const {
      service: profilesService,
      getProfile,
      getInterests,
    } = createProfilesServiceForOnboardingFlow(userId);
    await profilesService.replaceInterests(
      userId,
      richData.interests.map((label: string) => ({
        kind: "topic",
        label,
      })),
    );
    await profilesService.upsertProfile(userId, {
      bio: richData.summary,
      city: richData.area,
      country: richData.country,
    });
    const completion = await profilesService.getProfileCompletion(userId);

    expect(getInterests().length).toBeGreaterThan(0);
    expect(getProfile().onboardingState).toBe("complete");
    expect(completion.completed).toBe(true);
    expect(completion.onboardingState).toBe("complete");
  });

  it("exposes replay-safe activation idempotency identity for starter-intent bootstrap", async () => {
    const userId = "11111111-1111-4111-8111-111111111111";
    const onboardingService: any = {
      buildActivationPlan: vi.fn().mockResolvedValue({
        state: "ready",
        source: "fallback",
        summary: "We prepared your first step.",
        idempotencyKey:
          "onboarding-carryover:11111111-1111-4111-8111-111111111111:abc123efab456789",
        activationFingerprint: "abc123efab456789",
        recommendedAction: {
          kind: "agent_thread_seed",
          label: "Start with this",
          text: "Help me find football plans in Buenos Aires.",
        },
      }),
    };
    const onboardingController = new OnboardingController(onboardingService);

    const activation = await onboardingController.activationPlan(
      {
        userId,
        summary: "Find football plans in Buenos Aires.",
      },
      userId,
    );
    const activationData = activation.data as any;
    expect(activationData.idempotencyKey).toMatch(
      /^onboarding-carryover:11111111-1111-4111-8111-111111111111:/,
    );

    const rows = new Map<string, any>();
    const prisma: any = {
      clientMutation: {
        findUnique: vi.fn(async ({ where }: any) => {
          const key = `${where.userId_scope_idempotencyKey.userId}:${where.userId_scope_idempotencyKey.scope}:${where.userId_scope_idempotencyKey.idempotencyKey}`;
          return rows.get(key) ?? null;
        }),
        create: vi.fn(async ({ data }: any) => {
          const key = `${data.userId}:${data.scope}:${data.idempotencyKey}`;
          rows.set(key, {
            ...data,
            status: "processing",
            responseBody: null,
            errorCode: null,
            errorMessage: null,
          });
          return rows.get(key);
        }),
        update: vi.fn(async ({ where, data }: any) => {
          const key = `${where.userId_scope_idempotencyKey.userId}:${where.userId_scope_idempotencyKey.scope}:${where.userId_scope_idempotencyKey.idempotencyKey}`;
          const existing = rows.get(key);
          const updated = { ...existing, ...data };
          rows.set(key, updated);
          return updated;
        }),
      },
    };
    const clientMutationService = new ClientMutationService(prisma);
    const handler = vi.fn().mockResolvedValue({
      intentId: "intent-activation-1",
      intentCount: 1,
    });

    const first = await clientMutationService.run({
      userId,
      scope: "intent.create_from_agent",
      idempotencyKey: activationData.idempotencyKey,
      handler,
    });
    const second = await clientMutationService.run({
      userId,
      scope: "intent.create_from_agent",
      idempotencyKey: activationData.idempotencyKey,
      handler,
    });

    expect(first).toEqual({ intentId: "intent-activation-1", intentCount: 1 });
    expect(second).toEqual({ intentId: "intent-activation-1", intentCount: 1 });
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("keeps starter-intent bootstrap idempotent under activation handoff retries", async () => {
    const userId = "11111111-1111-4111-8111-111111111111";
    const threadId = "22222222-2222-4222-8222-222222222222";
    const activationPlan = {
      state: "ready",
      source: "fallback",
      summary: "We prepared your first step.",
      idempotencyKey:
        "onboarding-carryover:11111111-1111-4111-8111-111111111111:retrysafe00000001",
      activationFingerprint: "retrysafe00000001",
      recommendedAction: {
        kind: "agent_thread_seed",
        label: "Start with this",
        text: "Help me find football plans in Buenos Aires.",
      },
    };

    const rows = new Map<string, any>();
    const prisma: any = {
      clientMutation: {
        findUnique: vi.fn(async ({ where }: any) => {
          const key = `${where.userId_scope_idempotencyKey.userId}:${where.userId_scope_idempotencyKey.scope}:${where.userId_scope_idempotencyKey.idempotencyKey}`;
          return rows.get(key) ?? null;
        }),
        create: vi.fn(async ({ data }: any) => {
          const key = `${data.userId}:${data.scope}:${data.idempotencyKey}`;
          rows.set(key, {
            ...data,
            status: "processing",
            responseBody: null,
            errorCode: null,
            errorMessage: null,
          });
          return rows.get(key);
        }),
        update: vi.fn(async ({ where, data }: any) => {
          const key = `${where.userId_scope_idempotencyKey.userId}:${where.userId_scope_idempotencyKey.scope}:${where.userId_scope_idempotencyKey.idempotencyKey}`;
          const existing = rows.get(key);
          const updated = { ...existing, ...data };
          rows.set(key, updated);
          return updated;
        }),
      },
    };
    const clientMutationService = new ClientMutationService(prisma);
    const intentsService = {
      createIntentFromAgentMessage: vi.fn().mockResolvedValue({
        threadId,
        intentId: "intent-activation-1",
        status: "parsed",
        intentCount: 1,
      }),
    };

    const runBootstrap = () =>
      clientMutationService.run({
        userId,
        scope: "intent.create_from_agent",
        idempotencyKey: activationPlan.idempotencyKey,
        handler: () =>
          intentsService.createIntentFromAgentMessage(
            threadId,
            userId,
            activationPlan.recommendedAction.text,
            { allowDecomposition: false, maxIntents: 1 },
          ),
      });

    const first = await runBootstrap();
    const second = await runBootstrap();

    expect(intentsService.createIntentFromAgentMessage).toHaveBeenCalledTimes(
      1,
    );
    expect(first).toEqual({
      threadId,
      intentId: "intent-activation-1",
      status: "parsed",
      intentCount: 1,
    });
    expect(second).toEqual(first);
  });

  it("exposes activation bootstrap payload for first-session home/chat state", async () => {
    const userId = "11111111-1111-4111-8111-111111111111";
    const onboardingService: any = {
      buildActivationBootstrap: vi.fn().mockResolvedValue({
        onboardingState: "complete",
        activation: {
          state: "ready",
          source: "fallback",
          summary: "We prepared your first step.",
          idempotencyKey:
            "onboarding-carryover:11111111-1111-4111-8111-111111111111:abc123efab456789",
          activationFingerprint: "abc123efab456789",
          recommendedAction: {
            kind: "agent_thread_seed",
            label: "Start with this",
            text: "Help me find football plans in Buenos Aires.",
          },
        },
        readiness: {
          hasActivationContext: true,
          profileSignalCount: 3,
          hasPrimaryThread: true,
          hasDiscoveryCandidates: true,
          recommendationReady: true,
          activationReason: "activation_ready",
        },
        primaryThread: {
          id: "22222222-2222-4222-8222-222222222222",
          title: "Main",
          createdAt: "2026-03-28T18:00:00.000Z",
        },
        discovery: {
          tonightCount: 1,
          reconnectCount: 0,
          groupCount: 0,
          activeIntentCount: 0,
          topTonight: [
            {
              userId: "33333333-3333-4333-8333-333333333333",
              displayName: "Alice",
              reason: "Strong overlap in football plans.",
              score: 0.91,
            },
          ],
          inboxSuggestions: [
            {
              title: "Try a football plan tonight",
              reason: "It fits what you just shared.",
              score: 0.88,
            },
          ],
        },
        execution: {
          scope: "intent.create_from_agent",
          idempotencyKey:
            "onboarding-carryover:11111111-1111-4111-8111-111111111111:abc123efab456789",
          status: "completed",
          hasCachedResponse: true,
          cachedResponse: {
            threadId: "22222222-2222-4222-8222-222222222222",
            intentId: "intent-activation-1",
            status: "parsed",
            intentCount: 1,
          },
        },
      }),
    };
    const onboardingController = new OnboardingController(onboardingService);

    const response = await onboardingController.activationBootstrap(
      {
        userId,
      },
      userId,
    );

    const data = response.data as any;
    expect(data.onboardingState).toBe("complete");
    expect(data.activation.state).toBe("ready");
    expect(data.readiness.activationReason).toBe("activation_ready");
    expect(data.primaryThread.id).toBe("22222222-2222-4222-8222-222222222222");
    expect(data.discovery.topTonight).toHaveLength(1);
    expect(data.execution.status).toBe("completed");
  });
});
