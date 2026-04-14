import { beforeEach, describe, expect, it, vi } from "vitest";
import { ExperienceService } from "../src/experience/experience.service.js";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const INTENT_ID = "22222222-2222-4222-8222-222222222222";

function createService(overrides: Partial<Record<string, any>> = {}) {
  const agentService = overrides.agentService ?? {
    findPrimaryThreadSummaryForUser: vi.fn().mockResolvedValue({
      id: "thread-1",
      title: "Primary thread",
      createdAt: "2026-04-10T00:00:00.000Z",
    }),
  };

  const prisma = overrides.prisma ?? {
    notification: {
      count: vi.fn().mockResolvedValue(0),
      findMany: vi.fn().mockResolvedValue([]),
    },
    intentRequest: {
      findFirst: vi.fn().mockResolvedValue(null),
    },
    chat: {
      findFirst: vi.fn().mockResolvedValue(null),
    },
  };

  const discoveryService = overrides.discoveryService ?? {
    getPassiveDiscovery: vi.fn().mockResolvedValue({
      tonight: { suggestions: [] },
      reconnects: { reconnects: [] },
      groups: { groups: [] },
    }),
    getInboxSuggestions: vi.fn().mockResolvedValue({
      suggestions: [],
    }),
  };

  const inboxService = overrides.inboxService ?? {
    listPendingRequests: vi.fn().mockResolvedValue([]),
  };

  const intentsService = overrides.intentsService ?? {
    summarizePendingIntents: vi.fn().mockResolvedValue({
      activeIntentCount: 0,
      intents: [],
    }),
  };

  return {
    service: new ExperienceService(
      agentService,
      prisma,
      discoveryService,
      inboxService,
      intentsService,
    ),
    agentService,
    prisma,
    discoveryService,
    inboxService,
    intentsService,
  };
}

describe("ExperienceService", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("returns waiting status when pending requests exist", async () => {
    const { service, inboxService } = createService({
      inboxService: {
        listPendingRequests: vi
          .fn()
          .mockResolvedValue([{ id: "req-1" }, { id: "req-2" }]),
      },
    });

    const summary = await service.getHomeSummary(USER_ID);

    expect(inboxService.listPendingRequests).toHaveBeenCalledWith(USER_ID);
    expect(summary.status).toEqual({
      eyebrow: "Needs attention",
      title: "People are waiting",
      body: "2 requests need responses before the search can move forward.",
      tone: "waiting",
      footnote: "Handle requests first, then return to matching.",
      nextAction: {
        kind: "review_requests",
        label: "Review requests",
      },
    });
  });

  it("returns recovery state when a lead intent has no momentum and no top suggestion", async () => {
    const { service } = createService({
      intentsService: {
        summarizePendingIntents: vi.fn().mockResolvedValue({
          activeIntentCount: 1,
          intents: [
            {
              intentId: INTENT_ID,
              rawText:
                "Find a very niche late-night online design systems salon this week.",
              status: "matching",
              ageMinutes: 55,
              requests: {
                pending: 0,
                accepted: 0,
                rejected: 2,
                expired: 0,
                cancelled: 0,
              },
            },
          ],
        }),
      },
    });

    const summary = await service.getHomeSummary(USER_ID);

    expect(summary.status.tone).toBe("recovery");
    expect(summary.status.body).toContain("Nothing strong enough yet");
    expect(summary.spotlight.recovery).toEqual({
      title: "Widen the timing first",
      body: "Nothing is strong enough yet. First widen timing or availability before changing the format.",
      actionLabel: "Adjust search",
      secondaryLabel: "If that still looks thin, try a small group next.",
    });
  });

  it("returns coordination handoff with chat target when an accepted request already has a DM", async () => {
    const { service, prisma } = createService({
      intentsService: {
        summarizePendingIntents: vi.fn().mockResolvedValue({
          activeIntentCount: 1,
          intents: [
            {
              intentId: INTENT_ID,
              rawText: "Meet thoughtful product and design people this week.",
              status: "matching",
              ageMinutes: 12,
              requests: {
                pending: 1,
                accepted: 1,
                rejected: 0,
                expired: 0,
                cancelled: 0,
              },
            },
          ],
        }),
      },
      prisma: {
        notification: {
          count: vi.fn().mockResolvedValue(1),
          findMany: vi.fn().mockResolvedValue([]),
        },
        intentRequest: {
          findFirst: vi.fn().mockResolvedValue({
            recipientUserId: "33333333-3333-4333-8333-333333333333",
          }),
        },
        chat: {
          findFirst: vi.fn().mockResolvedValue({
            id: "chat-accepted-1",
          }),
        },
      },
    });

    const summary = await service.getHomeSummary(USER_ID);

    expect(prisma.intentRequest.findFirst).toHaveBeenCalled();
    expect(prisma.chat.findFirst).toHaveBeenCalled();
    expect(summary.spotlight.coordination).toEqual({
      variant: "accepted",
      title: "Move the match forward",
      body: "One accepted match is ready. The fastest next move is to coordinate directly.",
      actionLabel: "Open chat",
      targetChatId: "chat-accepted-1",
    });
  });

  it("labels protocol-originated notifications as integration updates", async () => {
    const { service } = createService({
      prisma: {
        notification: {
          count: vi.fn().mockResolvedValue(1),
          findMany: vi.fn().mockResolvedValue([
            {
              id: "notif-protocol-1",
              body: "A recurring circle is active.",
              type: "agent_update",
              channel: "in_app",
              isRead: false,
              metadata: {
                provenance: {
                  source: "protocol",
                  action: "circle.create",
                },
              },
              createdAt: new Date("2026-04-13T00:00:00.000Z"),
            },
          ]),
        },
        intentRequest: {
          findFirst: vi.fn().mockResolvedValue(null),
        },
        chat: {
          findFirst: vi.fn().mockResolvedValue(null),
        },
      },
    });

    const summary = await service.getActivitySummary(USER_ID);

    expect(summary.sections.updates[0]).toEqual(
      expect.objectContaining({
        eyebrow: "Integration",
        title: "Circle created",
        body: "A recurring circle is active.",
      }),
    );
  });

  it("labels protocol request notifications with specific integration titles", async () => {
    const { service } = createService({
      prisma: {
        notification: {
          count: vi.fn().mockResolvedValue(1),
          findMany: vi.fn().mockResolvedValue([
            {
              id: "notif-protocol-request-1",
              body: "Someone wants to connect with you right now.",
              type: "request_created",
              channel: "in_app",
              isRead: false,
              metadata: {
                provenance: {
                  source: "protocol",
                  action: "request.send",
                },
              },
              createdAt: new Date("2026-04-13T00:00:00.000Z"),
            },
          ]),
        },
        intentRequest: {
          findFirst: vi.fn().mockResolvedValue(null),
        },
        chat: {
          findFirst: vi.fn().mockResolvedValue(null),
        },
      },
    });

    const summary = await service.getActivitySummary(USER_ID);

    expect(summary.sections.updates[0]).toEqual(
      expect.objectContaining({
        eyebrow: "Integration",
        title: "Integration request",
        body: "Someone wants to connect with you right now.",
      }),
    );
  });

  it("labels protocol accepted-request notifications with specific integration titles", async () => {
    const { service } = createService({
      prisma: {
        notification: {
          count: vi.fn().mockResolvedValue(1),
          findMany: vi.fn().mockResolvedValue([
            {
              id: "notif-protocol-request-accepted-1",
              body: "Someone accepted your request. Your chat is ready.",
              type: "request_accepted",
              channel: "in_app",
              isRead: false,
              metadata: {
                provenance: {
                  source: "protocol",
                  action: "request.accept_chat_ready",
                },
              },
              createdAt: new Date("2026-04-13T00:00:00.000Z"),
            },
          ]),
        },
        intentRequest: {
          findFirst: vi.fn().mockResolvedValue(null),
        },
        chat: {
          findFirst: vi.fn().mockResolvedValue(null),
        },
      },
    });

    const summary = await service.getActivitySummary(USER_ID);

    expect(summary.sections.updates[0]).toEqual(
      expect.objectContaining({
        eyebrow: "Integration",
        title: "Integration chat ready",
        body: "Someone accepted your request. Your chat is ready.",
      }),
    );
  });

  it("labels protocol group backfill notifications with specific integration titles", async () => {
    const { service } = createService({
      prisma: {
        notification: {
          count: vi.fn().mockResolvedValue(1),
          findMany: vi.fn().mockResolvedValue([
            {
              id: "notif-protocol-group-backfill-1",
              body: "A group request is available now. Join if you are in.",
              type: "request_created",
              channel: "in_app",
              isRead: false,
              metadata: {
                provenance: {
                  source: "protocol",
                  action: "request.group_backfill",
                },
              },
              createdAt: new Date("2026-04-13T00:00:00.000Z"),
            },
          ]),
        },
        intentRequest: {
          findFirst: vi.fn().mockResolvedValue(null),
        },
        chat: {
          findFirst: vi.fn().mockResolvedValue(null),
        },
      },
    });

    const summary = await service.getActivitySummary(USER_ID);

    expect(summary.sections.updates[0]).toEqual(
      expect.objectContaining({
        eyebrow: "Integration",
        title: "Integration group request",
        body: "A group request is available now. Join if you are in.",
      }),
    );
  });
});
