import { Injectable, Optional } from "@nestjs/common";
import {
  NotificationType,
  negotiationOutcomeSchema,
  negotiationPacketSchema,
  type scheduledTaskCreateBodySchema,
} from "@opensocial/types";
import { OpenAIClient } from "@opensocial/openai";
import type { z } from "zod";
import { AgentService } from "./agent.service.js";
import { DiscoveryService } from "../discovery/discovery.service.js";
import { InboxService } from "../inbox/inbox.service.js";
import { IntentsService } from "../intents/intents.service.js";
import { MatchingService } from "../matching/matching.service.js";
import { PersonalizationService } from "../personalization/personalization.service.js";
import { ProfilesService } from "../profiles/profiles.service.js";
import { ProtocolService } from "../protocol/protocol.service.js";
import { RecurringCirclesService } from "../recurring-circles/recurring-circles.service.js";
import { ScheduledTasksService } from "../scheduled-tasks/scheduled-tasks.service.js";

type ScheduledTaskCreateBody = z.infer<typeof scheduledTaskCreateBodySchema>;
type NegotiationPacket = z.infer<typeof negotiationPacketSchema>;
type NegotiationOutcome = z.infer<typeof negotiationOutcomeSchema>;

@Injectable()
export class AgentOutcomeToolsService {
  private readonly openai = new OpenAIClient({
    apiKey: process.env.OPENAI_API_KEY ?? "",
  });

  constructor(
    private readonly agentService: AgentService,
    @Optional()
    private readonly intentsService?: IntentsService,
    @Optional()
    private readonly discoveryService?: DiscoveryService,
    @Optional()
    private readonly inboxService?: InboxService,
    @Optional()
    private readonly matchingService?: MatchingService,
    @Optional()
    private readonly personalizationService?: PersonalizationService,
    @Optional()
    private readonly profilesService?: ProfilesService,
    @Optional()
    private readonly protocolService?: ProtocolService,
    @Optional()
    private readonly recurringCirclesService?: RecurringCirclesService,
    @Optional()
    private readonly scheduledTasksService?: ScheduledTasksService,
  ) {}

  async searchCandidates(input: {
    userId: string;
    traceId: string;
    text: string;
    take?: number;
    widenOnScarcity?: boolean;
    scarcityThreshold?: number;
    parsedIntent?: {
      topics?: string[];
      activities?: string[];
      intentType?: string;
      modality?: string;
      timingConstraints?: string[];
      skillConstraints?: string[];
      vibeConstraints?: string[];
    };
  }) {
    if (!this.matchingService) {
      return { candidates: [], reason: "matching_service_unavailable" };
    }

    const parsedIntent =
      input.parsedIntent ??
      (await this.openai.parseIntent(input.text, input.traceId));
    const take = Math.min(Math.max(input.take ?? 5, 1), 10);
    const scarcityThreshold = Math.min(
      Math.max(input.scarcityThreshold ?? 2, 1),
      take,
    );
    const candidates = await this.matchingService.retrieveCandidates(
      input.userId,
      parsedIntent,
      take,
      {
        traceId: input.traceId,
      },
    );
    const shouldWiden =
      input.widenOnScarcity === true && candidates.length < scarcityThreshold;
    const widenedIntent = shouldWiden
      ? this.widenParsedIntentForScarcity(parsedIntent, 1)
      : null;
    const widenedCandidates =
      shouldWiden && widenedIntent
        ? await this.matchingService.retrieveCandidates(
            input.userId,
            widenedIntent,
            take,
            {
              traceId: `${input.traceId}:widened`,
            },
          )
        : null;
    const selectedCandidates =
      widenedCandidates && widenedCandidates.length > candidates.length
        ? widenedCandidates
        : candidates;

    return {
      count: selectedCandidates.length,
      parsedIntent: widenedCandidates
        ? (widenedIntent ?? parsedIntent)
        : parsedIntent,
      candidates: selectedCandidates.map((candidate) => ({
        userId: candidate.userId,
        score: candidate.score,
        rationale: candidate.rationale,
      })),
      scarcity:
        candidates.length < scarcityThreshold
          ? {
              detected: true,
              originalCount: candidates.length,
              threshold: scarcityThreshold,
              widened: Boolean(widenedCandidates),
              widenedLevel: widenedCandidates ? 1 : 0,
              widenedCandidateCount: widenedCandidates?.length ?? null,
            }
          : {
              detected: false,
              originalCount: candidates.length,
              threshold: scarcityThreshold,
              widened: false,
              widenedLevel: 0,
              widenedCandidateCount: null,
            },
    };
  }

  async lookupAvailability(input: {
    userId: string;
    candidateUserIds?: string[];
  }) {
    if (!this.matchingService) {
      return {
        requester: null,
        candidates: [],
        reason: "matching_service_unavailable",
      };
    }

    return this.matchingService.lookupAvailabilityContext(
      input.userId,
      input.candidateUserIds ?? [],
    );
  }

  async evaluateNegotiation(input: {
    userId: string;
    traceId: string;
    packet: unknown;
  }) {
    const parsedPacket = negotiationPacketSchema.safeParse(input.packet);
    if (!parsedPacket.success) {
      return {
        evaluated: false,
        reason: "invalid_negotiation_packet",
      };
    }

    const packet = parsedPacket.data;
    const policyBlocked = packet.policyFlags.some(
      (flag) =>
        flag === "blocked" ||
        flag === "reported" ||
        flag === "suspected_spam" ||
        flag === "unsafe_goods",
    );
    if (policyBlocked) {
      const blockedOutcome = negotiationOutcomeSchema.parse({
        packetId: packet.id ?? null,
        domain: packet.domain,
        mode: packet.mode,
        decision: "decline",
        confidence: 0.96,
        summary:
          packet.domain === "commerce"
            ? "I’m declining this negotiation because the policy risk is too high for a safe buyer-seller connection."
            : "I’m declining this match negotiation because policy signals indicate this should not move forward.",
        reasons: [
          "Policy flags indicate unsafe or blocked counterpart conditions.",
        ],
        nextActions: [
          {
            type: "workflow.write",
            reason: "Record policy decline and avoid visible side effects.",
          },
        ],
        scoreBreakdown: {
          compatibility: 0,
          trust: 0,
          availability: 0,
          language: 0,
          location: 0,
          constraints: 0,
          offer: packet.domain === "commerce" ? 0 : 0.5,
        },
        bounded: true,
        roundsUsed: 1,
      });
      return {
        evaluated: true,
        ...blockedOutcome,
      };
    }

    const trust = this.clamp01((packet.counterpart.trustScore ?? 55) / 100);
    const availability = this.computeAvailabilityScore(
      packet.requester.availabilityMode,
      packet.counterpart.availabilityMode,
    );
    const language = this.computeLanguageScore(
      packet.requester.languages,
      packet.counterpart.languages,
    );
    const location = this.computeLocationScore(
      packet.requester.country,
      packet.requester.city,
      packet.counterpart.country,
      packet.counterpart.city,
    );
    const constraints = this.computeConstraintScore(packet);
    const offer = this.computeOfferScore(packet);

    const compatibility = this.clamp01(
      packet.domain === "commerce"
        ? trust * 0.2 +
            language * 0.15 +
            location * 0.1 +
            constraints * 0.1 +
            offer * 0.45
        : trust * 0.15 +
            availability * 0.25 +
            language * 0.2 +
            location * 0.15 +
            constraints * 0.25,
    );
    const sparseSignals = this.hasSparseNegotiationSignals(packet);

    const decision: NegotiationOutcome["decision"] =
      compatibility >= 0.74 &&
      trust >= 0.55 &&
      (packet.domain === "social" || offer >= 0.6)
        ? "propose_intro"
        : compatibility >= 0.52
          ? "defer_async"
          : sparseSignals
            ? "needs_clarification"
            : "decline";
    const mode: NegotiationOutcome["mode"] =
      decision === "defer_async" ? "async" : packet.mode;
    const confidence = this.clamp01(
      decision === "propose_intro"
        ? compatibility
        : decision === "defer_async"
          ? compatibility * 0.9
          : sparseSignals
            ? 0.62
            : 0.79,
    );

    const nextActions =
      decision === "propose_intro"
        ? [
            {
              type: "intro.send_request" as const,
              reason:
                "Strong compatibility and trust signal; safe to progress into an intro request.",
            },
          ]
        : decision === "defer_async"
          ? [
              {
                type: "followup.schedule" as const,
                reason:
                  "Potential fit exists but is not strong enough for immediate intro.",
              },
              {
                type: "candidate.search" as const,
                reason:
                  "Broaden the candidate pool while preserving current negotiation context.",
              },
            ]
          : decision === "needs_clarification"
            ? [
                {
                  type: "workflow.write" as const,
                  reason:
                    "Request one high-value clarification before any visible side effect.",
                },
              ]
            : [
                {
                  type: "workflow.write" as const,
                  reason:
                    "Decline and document rationale to avoid repeating low-quality matches.",
                },
              ];

    const summary =
      decision === "propose_intro"
        ? packet.domain === "commerce"
          ? "I found a strong buyer-seller fit and recommend moving forward with an intro."
          : "I found a strong social fit and recommend moving forward with an intro."
        : decision === "defer_async"
          ? packet.domain === "commerce"
            ? "This buyer-seller fit is promising but needs asynchronous follow-up before introducing both sides."
            : "This social fit is promising but needs asynchronous follow-up before introducing both sides."
          : decision === "needs_clarification"
            ? "I need one key clarification before deciding whether this negotiation should move forward."
            : "I’m declining this negotiation because current fit and trust signals are below a safe threshold.";

    const reasons = [
      `compatibility=${compatibility.toFixed(2)}`,
      `trust=${trust.toFixed(2)}`,
      packet.domain === "commerce"
        ? `offer=${offer.toFixed(2)}`
        : `availability=${availability.toFixed(2)}`,
      `language=${language.toFixed(2)}`,
      `constraints=${constraints.toFixed(2)}`,
    ];

    const outcome = negotiationOutcomeSchema.parse({
      packetId: packet.id ?? null,
      domain: packet.domain,
      mode,
      decision,
      confidence,
      summary,
      reasons,
      nextActions,
      scoreBreakdown: {
        compatibility,
        trust,
        availability,
        language,
        location,
        constraints,
        offer,
      },
      bounded: true,
      roundsUsed: 1,
    });

    await this.recordExecutionMemory(input.userId, {
      summary: `Negotiation (${packet.domain}) decided ${outcome.decision} with confidence ${Math.round(outcome.confidence * 100)}%.`,
      topics: this.uniqueNormalized(
        [
          ...packet.requester.objectives,
          ...packet.counterpart.objectives,
          ...packet.requester.itemInterests,
          ...packet.counterpart.itemInterests,
        ],
        6,
      ),
      activities: ["negotiation"],
      people: this.uniqueNormalized(
        [packet.counterpart.userId ?? "", packet.requester.userId ?? ""],
        2,
      ),
      context: {
        source: "agent_outcome_tool",
        outcome: "negotiation_evaluated",
        traceId: input.traceId,
        decision: outcome.decision,
        domain: outcome.domain,
        mode: outcome.mode,
      },
    });

    return {
      evaluated: true,
      ...outcome,
    };
  }

  async searchCircles(input: { userId: string; limit?: number }) {
    if (!this.discoveryService) {
      return { groups: [], reason: "discovery_service_unavailable" };
    }

    const result = await this.discoveryService.suggestGroups(
      input.userId,
      Math.min(Math.max(input.limit ?? 3, 1), 5),
    );
    return {
      count: result.groups.length,
      groups: result.groups,
    };
  }

  async planGroup(input: {
    userId: string;
    threadId: string;
    traceId: string;
    text: string;
    groupSizeTarget?: number;
  }) {
    if (!this.intentsService) {
      return { planned: false, reason: "intents_service_unavailable" };
    }

    const groupSizeTarget = Math.min(
      Math.max(input.groupSizeTarget ?? 3, 2),
      4,
    );
    const intent = await this.intentsService.createIntentWithOverrides({
      userId: input.userId,
      rawText: input.text,
      traceId: input.traceId,
      agentThreadId: input.threadId,
      parsedIntentOverrides: {
        intentType: "group",
        groupSizeTarget,
      },
    });

    return {
      planned: true,
      intentId: intent.id,
      status: intent.status,
      groupSizeTarget,
    };
  }

  async persistIntent(input: {
    userId: string;
    threadId: string;
    traceId: string;
    text: string;
  }) {
    if (!this.intentsService) {
      return { persisted: false, reason: "intents_service_unavailable" };
    }

    const intent = this.protocolService
      ? await this.protocolService.createFirstPartyIntentAction({
          actorUserId: input.userId,
          rawText: input.text,
          traceId: input.traceId,
          agentThreadId: input.threadId,
          metadata: {
            source: "agent_outcome_tool.persist_intent",
          },
        })
      : await this.intentsService.createIntent(
          input.userId,
          input.text,
          input.traceId,
          input.threadId,
        );

    return {
      persisted: true,
      intentId: "intentId" in intent ? intent.intentId : intent.id,
      status: intent.status,
      safetyState:
        "safetyState" in intent ? (intent.safetyState ?? null) : null,
    };
  }

  async sendIntroRequest(input: {
    actorUserId: string;
    intentId: string;
    recipientUserId: string;
    traceId: string;
    threadId?: string;
  }) {
    if (!this.intentsService) {
      return { sent: false, reason: "intents_service_unavailable" };
    }

    const result = this.protocolService
      ? await this.protocolService.sendFirstPartyRequestAction({
          actorUserId: input.actorUserId,
          intentId: input.intentId,
          recipientUserId: input.recipientUserId,
          traceId: input.traceId,
          agentThreadId: input.threadId,
          metadata: {
            source: "agent_outcome_tool.send_intro_request",
          },
        })
      : await this.intentsService.sendIntentRequest({
          intentId: input.intentId,
          recipientUserId: input.recipientUserId,
          traceId: input.traceId,
          agentThreadId: input.threadId,
        });

    return {
      sent: result.status === "pending" || result.status === "accepted",
      ...result,
    };
  }

  async acceptIntro(input: { requestId: string; actorUserId: string }) {
    if (!this.inboxService) {
      return { accepted: false, reason: "inbox_service_unavailable" };
    }
    const result = this.protocolService
      ? await this.protocolService.acceptFirstPartyRequestAction(
          input.requestId,
          {
            actorUserId: input.actorUserId,
            metadata: {
              source: "agent_outcome_tool.accept_intro",
            },
          },
        )
      : await this.inboxService.updateStatus(
          input.requestId,
          "accepted",
          input.actorUserId,
        );
    const acceptedSenderUserId =
      "request" in result && typeof result.request.senderUserId === "string"
        ? result.request.senderUserId
        : "senderUserId" in result && typeof result.senderUserId === "string"
          ? result.senderUserId
          : null;
    await this.recordExecutionMemory(input.actorUserId, {
      summary:
        "Accepted a social intro request and opened the path to a real connection.",
      activities: ["accepted intro"],
      people: acceptedSenderUserId ? [acceptedSenderUserId] : [],
      highSuccessPeople: acceptedSenderUserId ? [acceptedSenderUserId] : [],
      context: {
        source: "agent_outcome_tool",
        outcome: "intro_accepted",
        requestId: "request" in result ? result.request.id : result.requestId,
        status: "request" in result ? result.request.status : result.status,
        intentId:
          "request" in result
            ? (result.request.intentId ?? null)
            : result.intentId,
      },
    });
    return {
      accepted: true,
      requestId: "request" in result ? result.request.id : result.requestId,
      status: "request" in result ? result.request.status : result.status,
      queued: Boolean("queued" in result && result.queued),
    };
  }

  async rejectIntro(input: { requestId: string; actorUserId: string }) {
    if (!this.inboxService) {
      return { rejected: false, reason: "inbox_service_unavailable" };
    }
    const result = this.protocolService
      ? await this.protocolService.rejectFirstPartyRequestAction(
          input.requestId,
          {
            actorUserId: input.actorUserId,
            metadata: {
              source: "agent_outcome_tool.reject_intro",
            },
          },
        )
      : await this.inboxService.updateStatus(
          input.requestId,
          "rejected",
          input.actorUserId,
        );
    const rejectedSenderUserId =
      "request" in result && typeof result.request.senderUserId === "string"
        ? result.request.senderUserId
        : "senderUserId" in result && typeof result.senderUserId === "string"
          ? result.senderUserId
          : null;
    await this.recordExecutionMemory(input.actorUserId, {
      summary:
        "Declined a social intro request because it was not the right fit right now.",
      activities: ["declined intro"],
      people: rejectedSenderUserId ? [rejectedSenderUserId] : [],
      context: {
        source: "agent_outcome_tool",
        outcome: "intro_rejected",
        requestId: "request" in result ? result.request.id : result.requestId,
        status: "request" in result ? result.request.status : result.status,
        intentId:
          "request" in result
            ? (result.request.intentId ?? null)
            : result.intentId,
      },
    });
    return {
      rejected: true,
      requestId: "request" in result ? result.request.id : result.requestId,
      status: "request" in result ? result.request.status : result.status,
    };
  }

  async retractIntro(input: { requestId: string; actorUserId: string }) {
    if (!this.inboxService) {
      return { retracted: false, reason: "inbox_service_unavailable" };
    }
    const result = await this.inboxService.cancelByOriginator(
      input.requestId,
      input.actorUserId,
    );
    await this.recordExecutionMemory(input.actorUserId, {
      summary:
        "Retracted a pending social intro request to keep outreach aligned with the latest intent.",
      activities: ["retracted intro"],
      people:
        typeof result.request.recipientUserId === "string"
          ? [result.request.recipientUserId]
          : [],
      context: {
        source: "agent_outcome_tool",
        outcome: "intro_retracted",
        requestId: result.request.id,
        status: result.request.status,
        intentId:
          "intentId" in result.request
            ? (result.request.intentId ?? null)
            : null,
      },
    });
    return {
      retracted: true,
      requestId: result.request.id,
      status: result.request.status,
    };
  }

  async startConversation(input: {
    userId: string;
    title?: string;
    initialMessage?: string;
  }) {
    const title = this.normalizeTitle(input.title) ?? "New social plan";
    const thread = await this.agentService.createThread(input.userId, title);

    if (input.initialMessage?.trim()) {
      await this.agentService.appendWorkflowUpdate(
        thread.id,
        input.initialMessage.trim().slice(0, 500),
        {
          category: "agent_conversation_start",
        },
      );
    }

    return {
      threadId: thread.id,
      title: thread.title,
      createdAt: thread.createdAt.toISOString(),
    };
  }

  async createCircle(input: {
    userId: string;
    title: string;
    description?: string;
    topicTags?: string[];
    targetSize?: number;
    kickoffPrompt?: string;
    timezone?: string;
  }) {
    if (!this.recurringCirclesService) {
      return {
        created: false,
        reason: "recurring_circles_service_unavailable",
      };
    }

    const title = this.normalizeTitle(input.title);
    if (!title) {
      return { created: false, reason: "missing_circle_title" };
    }
    const timezone = this.normalizeTimezone(input.timezone);
    const circle = await this.recurringCirclesService.createCircle(
      input.userId,
      {
        title,
        description: input.description?.trim() || undefined,
        visibility: "private",
        topicTags: (input.topicTags ?? [])
          .map((tag) => tag.trim())
          .filter((tag) => tag.length > 0)
          .slice(0, 8),
        targetSize: Math.min(Math.max(input.targetSize ?? 4, 2), 8),
        cadence: {
          kind: "weekly",
          days: [this.dayKeyForDate(new Date())],
          hour: 18,
          minute: 0,
          timezone,
          intervalWeeks: 1,
        },
        kickoffPrompt: input.kickoffPrompt?.trim() || undefined,
      },
    );
    await this.recordExecutionMemory(input.userId, {
      summary: `Created a recurring circle "${circle.title}" to turn social intent into a repeatable group outcome.`,
      topics: input.topicTags,
      activities: ["created circle"],
      context: {
        source: "agent_outcome_tool",
        outcome: "circle_created",
        circleId: circle.id,
        title: circle.title,
        targetSize: Math.min(Math.max(input.targetSize ?? 4, 2), 8),
      },
    });

    return {
      created: true,
      circleId: circle.id,
      title: circle.title,
      nextSessionAt: circle.nextSessionAt?.toISOString() ?? null,
    };
  }

  async joinCircle(input: {
    circleId: string;
    ownerUserId: string;
    userId: string;
    role?: "member" | "admin";
  }) {
    if (!this.recurringCirclesService) {
      return { joined: false, reason: "recurring_circles_service_unavailable" };
    }

    const member = await this.recurringCirclesService.addMember(
      input.circleId,
      input.ownerUserId,
      {
        userId: input.userId,
        role: input.role ?? "member",
      },
    );
    await this.recordExecutionMemory(input.userId, {
      summary:
        "Joined a recurring circle to turn the current social goal into an ongoing group connection.",
      activities: ["joined circle"],
      people: [input.ownerUserId],
      context: {
        source: "agent_outcome_tool",
        outcome: "circle_joined",
        circleId: member.circleId,
        role: member.role,
      },
    });

    return {
      joined: true,
      circleId: member.circleId,
      userId: member.userId,
      status: member.status,
      role: member.role,
    };
  }

  async patchProfile(input: {
    userId: string;
    consentGranted: boolean;
    consentSource?: string;
    profile?: {
      displayName?: string;
      bio?: string;
      city?: string;
      country?: string;
      visibility?: "public" | "limited" | "private";
      availabilityMode?:
        | "now"
        | "later_today"
        | "flexible"
        | "away"
        | "invisible";
    };
    globalRules?: Partial<{
      whoCanContact: "anyone" | "verified_only" | "trusted_only";
      reachable: "always" | "available_only" | "do_not_disturb";
      intentMode: "one_to_one" | "group" | "balanced";
      modality: "online" | "offline" | "either";
      languagePreferences: string[];
      countryPreferences: string[];
      translationOptIn: boolean;
      requireVerifiedUsers: boolean;
      notificationMode: "immediate" | "digest" | "quiet";
      agentAutonomy: "manual" | "suggest_only" | "auto_non_risky";
      memoryMode: "minimal" | "standard" | "extended";
    }>;
  }) {
    if (!input.consentGranted) {
      return {
        patched: false,
        reason: "consent_required",
      };
    }

    const profilePatch =
      input.profile && Object.keys(input.profile).length > 0
        ? input.profile
        : null;
    const globalRulesPatch =
      input.globalRules && Object.keys(input.globalRules).length > 0
        ? input.globalRules
        : null;

    if (!profilePatch && !globalRulesPatch) {
      return {
        patched: false,
        reason: "empty_profile_patch",
      };
    }

    const profileResult =
      profilePatch && this.profilesService
        ? await this.profilesService.applyAgentProfilePatch(
            input.userId,
            profilePatch,
          )
        : null;
    const globalRulesResult =
      globalRulesPatch && this.personalizationService
        ? await this.personalizationService.patchGlobalRules(
            input.userId,
            globalRulesPatch,
          )
        : null;

    if (
      (profilePatch && !profileResult && !this.profilesService) ||
      (globalRulesPatch && !globalRulesResult && !this.personalizationService)
    ) {
      return {
        patched: false,
        reason: "profile_patch_services_unavailable",
      };
    }

    if (profilePatch && this.personalizationService) {
      await this.personalizationService.refreshProfileSummaryDocument?.(
        input.userId,
      );
    }

    if (this.personalizationService) {
      await this.recordExecutionMemory(input.userId, {
        summary:
          "Confirmed and saved updated profile defaults for future social planning.",
        activities: ["updated defaults"],
        context: {
          source: "agent_outcome_tool",
          outcome: "profile_patch_applied",
          consentSource: input.consentSource ?? null,
          profileFields: profilePatch ? Object.keys(profilePatch) : [],
          globalRuleFields: globalRulesPatch
            ? Object.keys(globalRulesPatch)
            : [],
        },
      });
    }

    return {
      patched: true,
      consentSource: input.consentSource ?? null,
      profile: profileResult,
      globalRules: globalRulesResult,
    };
  }

  async writeMemory(input: {
    userId: string;
    summary: string;
    context?: Record<string, unknown>;
    topics?: string[];
    activities?: string[];
    traceId?: string;
    workflowRunId?: string;
    memoryClass?:
      | "profile_memory"
      | "stable_preference"
      | "inferred_preference"
      | "relationship_history"
      | "safety_memory"
      | "commerce_memory"
      | "interaction_summary"
      | "transient_working_memory";
    memoryKey?: string;
    memoryValue?: string;
    confidence?: number;
    safeWritePolicy?: "strict" | "allow_with_trace" | "best_effort";
    contradictionPolicy?:
      | "keep_latest"
      | "suppress_conflict"
      | "append_conflict_note";
  }) {
    if (!this.personalizationService) {
      return { stored: false, reason: "personalization_service_unavailable" };
    }

    const summary = input.summary.trim().slice(0, 1_000);
    if (!summary) {
      return { stored: false, reason: "empty_summary" };
    }

    const context = {
      ...(input.context ?? {}),
      ...(input.traceId ? { traceId: input.traceId } : {}),
      ...(input.workflowRunId ? { workflowRunId: input.workflowRunId } : {}),
    };
    const stored = await this.personalizationService.storeInteractionSummary(
      input.userId,
      {
        summary,
        safe: true,
        context,
        memory: {
          class: input.memoryClass ?? "interaction_summary",
          key: input.memoryKey,
          value: input.memoryValue,
          confidence: input.confidence,
          safeWritePolicy: input.safeWritePolicy ?? "allow_with_trace",
          contradictionPolicy:
            input.contradictionPolicy ?? "append_conflict_note",
          provenance: {
            sourceType: "agent_tool",
            traceId: input.traceId,
            workflowRunId: input.workflowRunId,
            toolName: "memory.write",
          },
        },
      },
    );
    if ("stored" in stored && stored.stored === false) {
      return {
        stored: false,
        reason: stored.reason,
      };
    }
    if (!("documentId" in stored) || !("docType" in stored)) {
      return {
        stored: false,
        reason: "memory_write_storage_result_invalid",
      };
    }

    const topicUpdates = (input.topics ?? [])
      .map((topic) => topic.trim())
      .filter((topic) => topic.length > 0)
      .slice(0, 5)
      .map((topic) =>
        this.personalizationService?.recordBehaviorSignal(input.userId, {
          edgeType: "recently_engaged_with",
          targetNode: { nodeType: "topic", label: topic },
          signalStrength: 0.3,
          feedbackType: "agent_memory_write_topic",
          context,
        }),
      );

    const activityUpdates = (input.activities ?? [])
      .map((activity) => activity.trim())
      .filter((activity) => activity.length > 0)
      .slice(0, 5)
      .map((activity) =>
        this.personalizationService?.recordBehaviorSignal(input.userId, {
          edgeType: "recently_engaged_with",
          targetNode: { nodeType: "activity", label: activity },
          signalStrength: 0.28,
          feedbackType: "agent_memory_write_activity",
          context,
        }),
      );

    await Promise.all([...topicUpdates, ...activityUpdates]);
    await this.personalizationService.refreshPreferenceMemoryDocument(
      input.userId,
    );

    return {
      stored: true,
      documentId: stored.documentId,
      docType: stored.docType,
      topicSignals: topicUpdates.length,
      activitySignals: activityUpdates.length,
    };
  }

  async scheduleFollowup(input: {
    userId: string;
    title?: string;
    summary?: string;
    timezone?: string;
    schedule?: Partial<
      ScheduledTaskCreateBody["schedule"] & {
        intervalHours?: number;
        days?: Array<"sun" | "mon" | "tue" | "wed" | "thu" | "fri" | "sat">;
      }
    >;
    deliveryMode?:
      | "notification"
      | "agent_thread"
      | "notification_and_agent_thread";
  }) {
    if (!this.scheduledTasksService) {
      return {
        scheduled: false,
        reason: "scheduled_tasks_service_unavailable",
      };
    }

    const timezone = this.normalizeTimezone(input.timezone);
    const title =
      this.normalizeTitle(input.title) ?? "Follow up on this social goal";
    const reminderSummary =
      input.summary?.trim().slice(0, 240) ?? "Check in on this social goal.";
    const schedule = this.resolveSchedule(input.schedule, timezone);
    const deliveryMode = input.deliveryMode ?? "agent_thread";

    const task = await this.scheduledTasksService.createTask(input.userId, {
      title,
      description: reminderSummary,
      schedule,
      task: {
        taskType: "social_reminder",
        config: {
          template: "revisit_unanswered_intents",
          deliveryMode,
          context: {
            summary: reminderSummary,
            requestedBy: "agent_tool",
          },
        },
      },
    });

    return {
      scheduled: true,
      taskId: task.id,
      nextRunAt: task.nextRunAt?.toISOString() ?? null,
      status: task.status,
      notificationType: NotificationType.REMINDER,
    };
  }

  private clamp01(value: number) {
    if (!Number.isFinite(value)) {
      return 0;
    }
    return Math.min(Math.max(value, 0), 1);
  }

  private computeAvailabilityScore(
    requester?: "now" | "later_today" | "flexible" | "away" | "invisible",
    counterpart?: "now" | "later_today" | "flexible" | "away" | "invisible",
  ) {
    const scoreByMode: Record<string, number> = {
      now: 1,
      later_today: 0.75,
      flexible: 0.6,
      away: 0.2,
      invisible: 0.1,
    };
    const requesterScore =
      requester && scoreByMode[requester] !== undefined
        ? scoreByMode[requester]
        : 0.55;
    const counterpartScore =
      counterpart && scoreByMode[counterpart] !== undefined
        ? scoreByMode[counterpart]
        : 0.55;
    return this.clamp01(
      1 - Math.min(Math.abs(requesterScore - counterpartScore) * 1.4, 1),
    );
  }

  private computeLanguageScore(requester: string[], counterpart: string[]) {
    const requesterSet = new Set(
      requester.map((value) => value.toLowerCase().trim()).filter(Boolean),
    );
    const counterpartSet = new Set(
      counterpart.map((value) => value.toLowerCase().trim()).filter(Boolean),
    );
    if (requesterSet.size === 0 || counterpartSet.size === 0) {
      return 0.6;
    }
    let overlap = 0;
    for (const lang of requesterSet) {
      if (counterpartSet.has(lang)) {
        overlap += 1;
      }
    }
    return this.clamp01(overlap / requesterSet.size);
  }

  private computeLocationScore(
    requesterCountry?: string,
    requesterCity?: string,
    counterpartCountry?: string,
    counterpartCity?: string,
  ) {
    const countryA = requesterCountry?.trim().toLowerCase() ?? "";
    const countryB = counterpartCountry?.trim().toLowerCase() ?? "";
    const cityA = requesterCity?.trim().toLowerCase() ?? "";
    const cityB = counterpartCity?.trim().toLowerCase() ?? "";

    if (countryA && countryB && countryA === countryB) {
      if (cityA && cityB && cityA === cityB) {
        return 1;
      }
      return 0.8;
    }
    if (countryA && countryB && countryA !== countryB) {
      return 0.25;
    }
    return 0.6;
  }

  private computeConstraintScore(packet: NegotiationPacket) {
    const requesterTokens = this.toTokenSet([
      ...packet.requester.objectives,
      ...packet.requester.constraints,
      packet.intentSummary,
    ]);
    const counterpartTokens = this.toTokenSet([
      ...packet.counterpart.objectives,
      ...packet.counterpart.constraints,
      ...packet.counterpart.itemInterests,
    ]);
    if (requesterTokens.size === 0 || counterpartTokens.size === 0) {
      return 0.6;
    }
    let overlap = 0;
    for (const token of requesterTokens) {
      if (counterpartTokens.has(token)) {
        overlap += 1;
      }
    }
    return this.clamp01(overlap / Math.min(requesterTokens.size, 8));
  }

  private computeOfferScore(packet: NegotiationPacket) {
    if (packet.domain !== "commerce") {
      return 0.65;
    }

    const wantedItems = this.toTokenSet(packet.requester.itemInterests);
    const offeredItems = this.toTokenSet(packet.counterpart.itemInterests);
    let itemScore = 0.45;
    if (wantedItems.size > 0 && offeredItems.size > 0) {
      let overlap = 0;
      for (const token of wantedItems) {
        if (offeredItems.has(token)) {
          overlap += 1;
        }
      }
      itemScore = this.clamp01(overlap / wantedItems.size);
    }

    let priceScore = 0.55;
    const range = packet.requester.priceRange;
    const ask = packet.counterpart.askingPrice;
    if (
      range &&
      Number.isFinite(range.min) &&
      Number.isFinite(range.max) &&
      typeof ask === "number" &&
      Number.isFinite(ask) &&
      range.max >= range.min
    ) {
      if (ask >= range.min && ask <= range.max) {
        priceScore = 1;
      } else {
        const span = Math.max(1, range.max - range.min);
        const distance =
          ask < range.min ? range.min - ask : Math.max(0, ask - range.max);
        priceScore = this.clamp01(1 - distance / (span * 1.5));
      }
    }

    return this.clamp01(itemScore * 0.6 + priceScore * 0.4);
  }

  private hasSparseNegotiationSignals(packet: NegotiationPacket) {
    const missingLanguage =
      packet.requester.languages.length === 0 &&
      packet.counterpart.languages.length === 0;
    const missingLocation =
      !packet.requester.country &&
      !packet.requester.city &&
      !packet.counterpart.country &&
      !packet.counterpart.city;
    const missingCounterpartIdentity = !packet.counterpart.userId;
    const missingCommercePayload =
      packet.domain === "commerce" &&
      packet.requester.itemInterests.length === 0 &&
      packet.counterpart.itemInterests.length === 0 &&
      packet.counterpart.askingPrice === undefined;

    const sparseSignals = [
      missingLanguage,
      missingLocation,
      missingCounterpartIdentity,
      missingCommercePayload,
    ].filter(Boolean).length;
    return sparseSignals >= 2;
  }

  private toTokenSet(values: string[]) {
    const tokens = values
      .flatMap((value) =>
        value
          .toLowerCase()
          .split(/[^a-z0-9]+/g)
          .map((token) => token.trim())
          .filter((token) => token.length >= 3),
      )
      .slice(0, 64);
    return new Set(tokens);
  }

  private normalizeTitle(value?: string) {
    const title = value?.trim();
    if (!title) {
      return null;
    }
    return title.slice(0, 120);
  }

  private normalizeTimezone(value?: string) {
    const timezone = value?.trim();
    return timezone && timezone.length > 0 ? timezone.slice(0, 128) : "UTC";
  }

  private resolveSchedule(
    schedule:
      | {
          kind?: "hourly" | "weekly";
          intervalHours?: number;
          days?: Array<"sun" | "mon" | "tue" | "wed" | "thu" | "fri" | "sat">;
          hour?: number;
          minute?: number;
        }
      | undefined,
    timezone: string,
  ): ScheduledTaskCreateBody["schedule"] {
    if (schedule?.kind === "hourly") {
      return {
        kind: "hourly",
        intervalHours: Math.min(Math.max(schedule.intervalHours ?? 24, 1), 24),
        timezone,
      };
    }

    return {
      kind: "weekly",
      days:
        schedule?.kind === "weekly" && schedule.days && schedule.days.length > 0
          ? schedule.days.slice(0, 7)
          : [this.dayKeyForDate(new Date())],
      hour:
        schedule?.kind === "weekly"
          ? this.clampInt(schedule.hour, 0, 23, 18)
          : 18,
      minute:
        schedule?.kind === "weekly"
          ? this.clampInt(schedule.minute, 0, 59, 0)
          : 0,
      timezone,
    };
  }

  private clampInt(value: unknown, min: number, max: number, fallback: number) {
    if (typeof value !== "number" || !Number.isFinite(value)) {
      return fallback;
    }
    return Math.min(Math.max(Math.trunc(value), min), max);
  }

  private dayKeyForDate(date: Date) {
    const dayKeys = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;
    return dayKeys[date.getUTCDay()];
  }

  private async recordExecutionMemory(
    userId: string,
    input: {
      summary: string;
      topics?: string[];
      activities?: string[];
      people?: string[];
      highSuccessPeople?: string[];
      context?: Record<string, unknown>;
    },
  ) {
    if (!this.personalizationService) {
      return;
    }

    const summary = input.summary.trim().slice(0, 1_000);
    if (!summary) {
      return;
    }

    await this.personalizationService.storeInteractionSummary(userId, {
      summary,
      safe: true,
      context: input.context,
    });

    const updates: Array<Promise<unknown>> = [];

    for (const topic of this.uniqueNormalized(input.topics, 6)) {
      updates.push(
        this.personalizationService.recordBehaviorSignal(userId, {
          edgeType: "recently_engaged_with",
          targetNode: { nodeType: "topic", label: topic },
          signalStrength: 0.3,
          feedbackType: "agent_outcome_topic",
          context: input.context,
        }),
      );
    }

    for (const activity of this.uniqueNormalized(input.activities, 6)) {
      updates.push(
        this.personalizationService.recordBehaviorSignal(userId, {
          edgeType: "recently_engaged_with",
          targetNode: { nodeType: "activity", label: activity },
          signalStrength: 0.28,
          feedbackType: "agent_outcome_activity",
          context: input.context,
        }),
      );
    }

    for (const personUserId of this.uniqueNormalized(input.people, 4)) {
      updates.push(
        this.personalizationService.recordBehaviorSignal(userId, {
          edgeType: "recently_engaged_with",
          targetNode: { nodeType: "person", label: `user:${personUserId}` },
          signalStrength: 0.22,
          feedbackType: "agent_outcome_person",
          context: input.context,
        }),
      );
    }

    for (const personUserId of this.uniqueNormalized(
      input.highSuccessPeople,
      4,
    )) {
      updates.push(
        this.personalizationService.recordBehaviorSignal(userId, {
          edgeType: "high_success_with",
          targetNode: { nodeType: "person", label: `user:${personUserId}` },
          signalStrength: 0.5,
          feedbackType: "agent_outcome_high_success_person",
          context: input.context,
        }),
      );
    }

    await Promise.all(updates);
    await this.personalizationService.refreshPreferenceMemoryDocument(userId);
  }

  private uniqueNormalized(values: string[] | undefined, limit: number) {
    return Array.from(
      new Set(
        (values ?? [])
          .map((value) => value.trim())
          .filter((value) => value.length > 0),
      ),
    ).slice(0, limit);
  }

  private widenParsedIntentForScarcity(
    input: {
      topics?: string[];
      activities?: string[];
      intentType?: string;
      modality?: string;
      timingConstraints?: string[];
      skillConstraints?: string[];
      vibeConstraints?: string[];
    },
    level: 1 | 2,
  ) {
    const widened = {
      ...input,
    };

    if (level >= 1) {
      if (widened.modality === "offline" || widened.modality === "online") {
        widened.modality = "either";
      }
      widened.timingConstraints = [];
      widened.skillConstraints = [];
      widened.vibeConstraints = [];
    }

    if (level >= 2) {
      widened.topics = [];
      widened.activities = [];
    }

    return widened;
  }
}
