import { Injectable, Logger, Optional } from "@nestjs/common";
import {
  NotificationType,
  commerceEscrowStateSchema,
  commerceOfferStateSchema,
  createCommerceListingBodySchema,
  createCommerceOfferBodySchema,
  createDatingConsentBodySchema,
  createRuntimeIntentBodySchema,
  intentDomainSchema,
  respondCommerceOfferBodySchema,
  workflowReplayabilitySchema,
} from "@opensocial/types";
import { randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { AgentWorkflowRuntimeService } from "../database/agent-workflow-runtime.service.js";
import { PrismaService } from "../database/prisma.service.js";
import { NotificationsService } from "../notifications/notifications.service.js";
import { ProtocolService } from "../protocol/protocol.service.js";

type IntentDomain = z.infer<typeof intentDomainSchema>;
type CreateIntentBody = z.infer<typeof createRuntimeIntentBodySchema>;
type CreateDatingConsentBody = z.infer<typeof createDatingConsentBodySchema>;
type CreateCommerceListingBody = z.infer<
  typeof createCommerceListingBodySchema
>;
type CreateCommerceOfferBody = z.infer<typeof createCommerceOfferBodySchema>;
type RespondCommerceOfferBody = z.infer<typeof respondCommerceOfferBodySchema>;
type Replayability = z.infer<typeof workflowReplayabilitySchema>;
type CommerceOfferState = z.infer<typeof commerceOfferStateSchema>;
type CommerceEscrowState = z.infer<typeof commerceEscrowStateSchema>;

@Injectable()
export class RuntimeService {
  private readonly logger = new Logger(RuntimeService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Optional()
    private readonly workflowRuntimeService?: AgentWorkflowRuntimeService,
    @Optional()
    private readonly notificationsService?: NotificationsService,
    @Optional()
    private readonly protocolService?: ProtocolService,
  ) {}

  async createIntent(input: CreateIntentBody) {
    if (this.protocolService) {
      const result = await this.protocolService.createFirstPartyIntentAction({
        actorUserId: input.userId,
        rawText: input.rawText,
        traceId: randomUUID(),
        agentThreadId: input.agentThreadId ?? undefined,
        metadata: {
          source: "runtime.create_intent",
          domain: input.domain,
          ...(input.metadata ?? {}),
        },
      });
      return {
        intentId: result.intentId,
        domain: input.domain,
        status: result.status,
        workflowRunId: `protocol:firstparty:intent:${result.intentId}`,
        traceId: result.traceId,
        replayability: "inspect_only" as const,
        stage: {
          stage: "domain_routing",
          status: "completed",
        },
        sideEffectIntegrity: {
          sideEffectCount: 0,
          dedupedSideEffectCount: 0,
          reusedRelations: [],
        },
      };
    }

    const traceId = randomUUID();
    const intentId = randomUUID();
    const workflowDomain = this.mapDomainToWorkflowDomain(input.domain);
    const workflowRunId =
      this.workflowRuntimeService?.buildWorkflowRunId({
        domain: workflowDomain,
        entityType: "intent",
        entityId: intentId,
      }) ?? `${workflowDomain}:intent:${intentId}`;

    await this.workflowRuntimeService?.startRun({
      workflowRunId,
      traceId,
      domain: workflowDomain,
      entityType: "intent",
      entityId: intentId,
      userId: input.userId,
      threadId: input.agentThreadId ?? null,
      summary: "Intent accepted",
      metadata: {
        domain: input.domain,
      },
    });
    await this.workflowRuntimeService?.checkpoint({
      workflowRunId,
      traceId,
      stage: "intent_parse",
      status: "completed",
      entityType: "intent",
      entityId: intentId,
      userId: input.userId,
      summary: "Intent payload parsed and accepted.",
    });
    await this.workflowRuntimeService?.checkpoint({
      workflowRunId,
      traceId,
      stage: "domain_routing",
      status: "completed",
      entityType: "intent",
      entityId: intentId,
      userId: input.userId,
      summary: `Intent routed to ${input.domain} domain.`,
      metadata: {
        domain: input.domain,
      },
    });

    const persistedPrimary = await this.persistDomainIntent({
      id: intentId,
      userId: input.userId,
      rawText: input.rawText,
      domain: input.domain,
      workflowRunId,
      traceId,
      metadata: input.metadata ?? {},
    });

    return {
      intentId,
      domain: input.domain,
      status: "accepted",
      workflowRunId,
      traceId,
      replayability: this.resolveReplayability(persistedPrimary),
      stage: {
        stage: "domain_routing",
        status: "completed",
      },
      sideEffectIntegrity: {
        sideEffectCount: 0,
        dedupedSideEffectCount: 0,
        reusedRelations: [],
      },
    };
  }

  async createDatingConsent(input: CreateDatingConsentBody) {
    const traceId = randomUUID();
    const consentId = randomUUID();
    const workflowRunId =
      this.workflowRuntimeService?.buildWorkflowRunId({
        domain: "dating",
        entityType: "dating_consent",
        entityId: consentId,
      }) ?? `dating:dating_consent:${consentId}`;

    await this.workflowRuntimeService?.startRun({
      workflowRunId,
      traceId,
      domain: "dating",
      entityType: "dating_consent",
      entityId: consentId,
      userId: input.userId,
      summary: "dating consent workflow initiated",
      metadata: {
        targetUserId: input.targetUserId,
        consentState: input.consentState,
      },
    });

    const profile = await this.prisma.userProfile.findUnique({
      where: { userId: input.userId },
      select: {
        trustScore: true,
      },
    });
    const trustScore = Number(profile?.trustScore ?? 0);
    const verified = input.verificationState === "verified" && trustScore >= 60;
    await this.workflowRuntimeService?.checkpoint({
      workflowRunId,
      traceId,
      stage: "dating_eligibility",
      status: verified ? "completed" : "blocked",
      entityType: "dating_consent",
      entityId: consentId,
      userId: input.userId,
      summary: verified
        ? "Eligibility verified."
        : "Eligibility blocked due to verification/trust constraints.",
      metadata: {
        verificationState: input.verificationState,
        trustScore,
      },
    });

    if (!verified) {
      return {
        consentId,
        userId: input.userId,
        targetUserId: input.targetUserId,
        scope: input.scope,
        consentState: "pending" as const,
        verificationState: input.verificationState,
        workflowRunId,
        traceId,
        replayability: "inspect_only" as const,
      };
    }

    const persistedPrimary = await this.persistDatingConsent({
      id: consentId,
      userId: input.userId,
      targetUserId: input.targetUserId,
      scope: input.scope,
      consentStatus: input.consentState,
      verificationStatus: input.verificationState,
      reason: input.reason ?? null,
      expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
      workflowRunId,
      traceId,
    });

    await this.workflowRuntimeService?.checkpoint({
      workflowRunId,
      traceId,
      stage: "dating_consent",
      status: "completed",
      entityType: "dating_consent",
      entityId: consentId,
      userId: input.userId,
      summary: "Dating consent persisted.",
      metadata: {
        consentState: input.consentState,
      },
    });

    if (input.consentState === "granted") {
      await this.notificationsService?.createInAppNotification(
        input.targetUserId,
        NotificationType.AGENT_UPDATE,
        "You received a dating-intro consent request. Review and respond when ready.",
      );
      await this.workflowRuntimeService?.linkSideEffect({
        workflowRunId,
        traceId,
        relation: "dating_consent_notification",
        entityType: "notification",
        entityId: randomUUID(),
        userId: input.targetUserId,
        summary: "Dating consent notification sent.",
      });
    }

    return {
      consentId,
      userId: input.userId,
      targetUserId: input.targetUserId,
      scope: input.scope,
      consentState: input.consentState,
      verificationState: input.verificationState,
      workflowRunId,
      traceId,
      replayability: this.resolveReplayability(persistedPrimary),
    };
  }

  async createCommerceListing(input: CreateCommerceListingBody) {
    const traceId = randomUUID();
    const listingId = randomUUID();
    const workflowRunId =
      this.workflowRuntimeService?.buildWorkflowRunId({
        domain: "commerce",
        entityType: "commerce_listing",
        entityId: listingId,
      }) ?? `commerce:commerce_listing:${listingId}`;

    await this.workflowRuntimeService?.startRun({
      workflowRunId,
      traceId,
      domain: "commerce",
      entityType: "commerce_listing",
      entityId: listingId,
      userId: input.sellerUserId,
      summary: "commerce listing creation initiated",
    });
    await this.workflowRuntimeService?.checkpoint({
      workflowRunId,
      traceId,
      stage: "commerce_listing",
      status: "started",
      entityType: "commerce_listing",
      entityId: listingId,
      userId: input.sellerUserId,
      summary: "Validating listing payload.",
    });

    const persistedPrimary = await this.persistCommerceListing({
      id: listingId,
      sellerUserId: input.sellerUserId,
      title: input.title,
      description: input.description ?? null,
      category: input.category,
      price: input.price,
      currency: input.currency,
      quantity: input.quantity ?? null,
      status: "active",
      metadata: input.metadata ?? {},
      workflowRunId,
      traceId,
    });

    await this.workflowRuntimeService?.checkpoint({
      workflowRunId,
      traceId,
      stage: "commerce_listing",
      status: "completed",
      entityType: "commerce_listing",
      entityId: listingId,
      userId: input.sellerUserId,
      summary: "Listing persisted.",
    });

    return {
      listingId,
      sellerUserId: input.sellerUserId,
      state: "active" as const,
      workflowRunId,
      traceId,
      replayability: this.resolveReplayability(persistedPrimary),
    };
  }

  async createCommerceOffer(input: CreateCommerceOfferBody) {
    const traceId = randomUUID();
    const offerId = randomUUID();
    const workflowRunId =
      this.workflowRuntimeService?.buildWorkflowRunId({
        domain: "commerce",
        entityType: "commerce_offer",
        entityId: offerId,
      }) ?? `commerce:commerce_offer:${offerId}`;

    await this.workflowRuntimeService?.startRun({
      workflowRunId,
      traceId,
      domain: "commerce",
      entityType: "commerce_offer",
      entityId: offerId,
      userId: input.buyerUserId,
      summary: "commerce offer workflow initiated",
      metadata: {
        listingId: input.listingId,
        sellerUserId: input.sellerUserId,
      },
    });
    await this.workflowRuntimeService?.checkpoint({
      workflowRunId,
      traceId,
      stage: "commerce_negotiation",
      status: "completed",
      entityType: "commerce_offer",
      entityId: offerId,
      userId: input.buyerUserId,
      summary: "Negotiation packet accepted for offer creation.",
    });

    const persistedPrimary = await this.persistCommerceOffer({
      id: offerId,
      listingId: input.listingId,
      buyerUserId: input.buyerUserId,
      sellerUserId: input.sellerUserId,
      offerPrice: input.offerPrice,
      currency: input.currency,
      message: input.message ?? null,
      status: "proposed",
      metadata: input.metadata ?? {},
      workflowRunId,
      traceId,
    });

    await this.workflowRuntimeService?.checkpoint({
      workflowRunId,
      traceId,
      stage: "commerce_offer",
      status: "completed",
      entityType: "commerce_offer",
      entityId: offerId,
      userId: input.buyerUserId,
      summary: "Offer persisted.",
    });
    await this.notificationsService?.createInAppNotification(
      input.sellerUserId,
      NotificationType.AGENT_UPDATE,
      "A new commerce offer is ready for your review.",
    );
    await this.workflowRuntimeService?.linkSideEffect({
      workflowRunId,
      traceId,
      relation: "commerce_offer_notification",
      entityType: "notification",
      entityId: randomUUID(),
      userId: input.sellerUserId,
      summary: "Seller notified about incoming offer.",
    });

    return {
      offerId,
      listingId: input.listingId,
      buyerUserId: input.buyerUserId,
      sellerUserId: input.sellerUserId,
      state: "proposed" as const,
      escrowState: "not_started" as const,
      workflowRunId,
      traceId,
      replayability: this.resolveReplayability(persistedPrimary),
    };
  }

  async respondCommerceOffer(offerId: string, input: RespondCommerceOfferBody) {
    const traceId = randomUUID();
    const workflowRunId =
      this.workflowRuntimeService?.buildWorkflowRunId({
        domain: "commerce",
        entityType: "commerce_offer",
        entityId: offerId,
      }) ?? `commerce:commerce_offer:${offerId}`;

    await this.workflowRuntimeService?.checkpoint({
      workflowRunId,
      traceId,
      stage: "commerce_offer",
      status: "started",
      entityType: "commerce_offer",
      entityId: offerId,
      userId: input.actorUserId,
      summary: `Offer response action received (${input.action}).`,
    });

    const stateTransition = this.mapOfferAction(input.action);
    const escrowState = this.mapEscrowStateForOffer(stateTransition.offerState);
    const persistedPrimary = await this.persistCommerceOfferTransition({
      offerId,
      actorUserId: input.actorUserId,
      action: input.action,
      reason: input.reason ?? null,
      counterPrice: input.counterPrice ?? null,
      offerState: stateTransition.offerState,
      escrowState,
      workflowRunId,
      traceId,
    });

    if (stateTransition.offerState === "accepted") {
      await this.workflowRuntimeService?.checkpoint({
        workflowRunId,
        traceId,
        stage: "commerce_escrow",
        status: "completed",
        entityType: "commerce_offer",
        entityId: offerId,
        userId: input.actorUserId,
        summary: "Offer accepted and escrow is pending funding.",
      });
    } else if (stateTransition.offerState === "disputed") {
      await this.workflowRuntimeService?.checkpoint({
        workflowRunId,
        traceId,
        stage: "commerce_dispute",
        status: "completed",
        entityType: "commerce_offer",
        entityId: offerId,
        userId: input.actorUserId,
        summary: "Dispute opened.",
      });
    } else if (stateTransition.offerState === "fulfilled") {
      await this.workflowRuntimeService?.checkpoint({
        workflowRunId,
        traceId,
        stage: "commerce_fulfillment",
        status: "completed",
        entityType: "commerce_offer",
        entityId: offerId,
        userId: input.actorUserId,
        summary: "Offer marked fulfilled.",
      });
    } else {
      await this.workflowRuntimeService?.checkpoint({
        workflowRunId,
        traceId,
        stage: "commerce_offer",
        status: "completed",
        entityType: "commerce_offer",
        entityId: offerId,
        userId: input.actorUserId,
        summary: `Offer moved to ${stateTransition.offerState}.`,
      });
    }

    const metadata = await this.readCommerceOfferMetadata(offerId);
    return {
      offerId,
      listingId: this.readString(metadata?.listingId) ?? "unknown-listing",
      buyerUserId: this.readString(metadata?.buyerUserId) ?? input.actorUserId,
      sellerUserId:
        this.readString(metadata?.sellerUserId) ?? input.actorUserId,
      state: stateTransition.offerState,
      escrowState,
      workflowRunId,
      traceId,
      replayability: this.resolveReplayability(persistedPrimary),
    };
  }

  async getWorkflowDetails(workflowRunId: string): Promise<{
    run: unknown;
    trace: {
      eventCount: number;
      failedEventCount: number;
      events: Array<Record<string, unknown>>;
    };
  }> {
    const details =
      (await this.workflowRuntimeService?.getRunDetails(workflowRunId)) ?? null;
    if (details) {
      return details;
    }
    return {
      run: null,
      trace: {
        eventCount: 0,
        failedEventCount: 0,
        events: [],
      },
    };
  }

  private mapDomainToWorkflowDomain(
    domain: IntentDomain,
  ): "social" | "dating" | "commerce" | "circle" | "event" | "discovery" {
    switch (domain) {
      case "group":
        return "circle";
      case "passive_discovery":
        return "discovery";
      case "social":
      case "dating":
      case "commerce":
      case "event":
        return domain;
    }
  }

  private resolveReplayability(primaryPersisted: boolean): Replayability {
    return primaryPersisted ? "replayable" : "partial";
  }

  private async persistDomainIntent(input: {
    id: string;
    userId: string;
    rawText: string;
    domain: IntentDomain;
    workflowRunId: string;
    traceId: string;
    metadata: Record<string, unknown>;
  }) {
    try {
      await this.prisma.workflowDomainIntent.create({
        data: {
          id: input.id,
          userId: input.userId,
          rawText: input.rawText,
          domain: input.domain,
          status: "accepted",
          workflowRunId: input.workflowRunId,
          traceId: input.traceId,
          metadata: this.asJson(input.metadata),
        },
      });
      return true;
    } catch (error) {
      this.logger.warn(
        `workflowDomainIntent persistence failed, falling back: ${String(error)}`,
      );
      await this.prisma.userPreference.create({
        data: {
          userId: input.userId,
          key: `runtime.intent.${input.id}`,
          value: {
            domain: input.domain,
            rawText: input.rawText,
            workflowRunId: input.workflowRunId,
            traceId: input.traceId,
            metadata: this.asJson(input.metadata),
          },
        },
      });
      return false;
    }
  }

  private async persistDatingConsent(input: {
    id: string;
    userId: string;
    targetUserId: string;
    scope: string;
    consentStatus: "pending" | "granted" | "revoked";
    verificationStatus: "unverified" | "verified" | "rejected";
    reason: string | null;
    expiresAt: Date | null;
    workflowRunId: string;
    traceId: string;
  }) {
    try {
      await this.prisma.datingConsentArtifact.create({
        data: {
          id: input.id,
          userId: input.userId,
          targetUserId: input.targetUserId,
          scope: input.scope,
          consentStatus: input.consentStatus,
          verificationStatus: input.verificationStatus,
          reason: input.reason,
          expiresAt: input.expiresAt,
          workflowRunId: input.workflowRunId,
          traceId: input.traceId,
        },
      });
      return true;
    } catch (error) {
      this.logger.warn(
        `dating consent persistence failed, falling back: ${String(error)}`,
      );
      await this.prisma.userPreference.create({
        data: {
          userId: input.userId,
          key: `runtime.dating_consent.${input.id}`,
          value: {
            targetUserId: input.targetUserId,
            scope: input.scope,
            consentStatus: input.consentStatus,
            verificationStatus: input.verificationStatus,
            reason: input.reason,
            expiresAt: input.expiresAt?.toISOString() ?? null,
            workflowRunId: input.workflowRunId,
            traceId: input.traceId,
          },
        },
      });
      return false;
    }
  }

  private async persistCommerceListing(input: {
    id: string;
    sellerUserId: string;
    title: string;
    description: string | null;
    category: string;
    price: number;
    currency: string;
    quantity: number | null;
    status: "active";
    metadata: Record<string, unknown>;
    workflowRunId: string;
    traceId: string;
  }) {
    try {
      await this.prisma.commerceListing.create({
        data: {
          id: input.id,
          sellerUserId: input.sellerUserId,
          title: input.title,
          description: input.description,
          category: input.category,
          price: input.price,
          currency: input.currency,
          quantity: input.quantity,
          status: input.status,
          metadata: this.asJson(input.metadata),
          workflowRunId: input.workflowRunId,
          traceId: input.traceId,
        },
      });
      return true;
    } catch (error) {
      this.logger.warn(
        `commerce listing persistence failed, falling back: ${String(error)}`,
      );
      await this.prisma.userPreference.create({
        data: {
          userId: input.sellerUserId,
          key: `runtime.commerce_listing.${input.id}`,
          value: {
            title: input.title,
            description: input.description,
            category: input.category,
            price: input.price,
            currency: input.currency,
            quantity: input.quantity,
            status: input.status,
            metadata: this.asJson(input.metadata),
            workflowRunId: input.workflowRunId,
            traceId: input.traceId,
          },
        },
      });
      return false;
    }
  }

  private async persistCommerceOffer(input: {
    id: string;
    listingId: string;
    buyerUserId: string;
    sellerUserId: string;
    offerPrice: number;
    currency: string;
    message: string | null;
    status: CommerceOfferState;
    metadata: Record<string, unknown>;
    workflowRunId: string;
    traceId: string;
  }) {
    try {
      await this.prisma.commerceOffer.create({
        data: {
          id: input.id,
          listingId: input.listingId,
          buyerUserId: input.buyerUserId,
          sellerUserId: input.sellerUserId,
          offerPrice: input.offerPrice,
          currency: input.currency,
          message: input.message,
          status: input.status,
          metadata: this.asJson(input.metadata),
          workflowRunId: input.workflowRunId,
          traceId: input.traceId,
        },
      });
      return true;
    } catch (error) {
      this.logger.warn(
        `commerce offer persistence failed, falling back: ${String(error)}`,
      );
      await this.prisma.userPreference.create({
        data: {
          userId: input.buyerUserId,
          key: `runtime.commerce_offer.${input.id}`,
          value: {
            listingId: input.listingId,
            buyerUserId: input.buyerUserId,
            sellerUserId: input.sellerUserId,
            offerPrice: input.offerPrice,
            currency: input.currency,
            message: input.message,
            status: input.status,
            metadata: this.asJson(input.metadata),
            workflowRunId: input.workflowRunId,
            traceId: input.traceId,
          },
        },
      });
      return false;
    }
  }

  private async persistCommerceOfferTransition(input: {
    offerId: string;
    actorUserId: string;
    action: string;
    reason: string | null;
    counterPrice: number | null;
    offerState: CommerceOfferState;
    escrowState: CommerceEscrowState;
    workflowRunId: string;
    traceId: string;
  }) {
    let updated = true;
    try {
      await this.prisma.commerceOffer.update({
        where: { id: input.offerId },
        data: {
          status: input.offerState,
          metadata: {
            transition: {
              actorUserId: input.actorUserId,
              action: input.action,
              reason: input.reason,
              counterPrice: input.counterPrice,
              traceId: input.traceId,
              at: new Date().toISOString(),
            },
          },
        },
      });
      await this.prisma.commerceEscrow.upsert({
        where: { offerId: input.offerId },
        create: {
          offerId: input.offerId,
          status: input.escrowState,
          amount: input.counterPrice ?? 0,
          currency: "USD",
          provider: "abstract",
          workflowRunId: input.workflowRunId,
          traceId: input.traceId,
        },
        update: {
          status: input.escrowState,
          freezeReason:
            input.escrowState === "frozen"
              ? (input.reason ?? "dispute_opened")
              : null,
          workflowRunId: input.workflowRunId,
          traceId: input.traceId,
        },
      });
      if (input.offerState === "disputed") {
        await this.prisma.commerceDispute.create({
          data: {
            offerId: input.offerId,
            openedByUserId: input.actorUserId,
            reason: input.reason ?? "unspecified_dispute",
            workflowRunId: input.workflowRunId,
            traceId: input.traceId,
          },
        });
      }
    } catch (error) {
      updated = false;
      this.logger.warn(
        `commerce offer transition failed, falling back: ${String(error)}`,
      );
      await this.prisma.userPreference.create({
        data: {
          userId: input.actorUserId,
          key: `runtime.commerce_offer_transition.${input.offerId}.${Date.now()}`,
          value: {
            action: input.action,
            reason: input.reason,
            counterPrice: input.counterPrice,
            offerState: input.offerState,
            escrowState: input.escrowState,
            workflowRunId: input.workflowRunId,
            traceId: input.traceId,
          },
        },
      });
    }
    return updated;
  }

  private mapOfferAction(action: RespondCommerceOfferBody["action"]): {
    offerState: CommerceOfferState;
  } {
    if (action === "accept") {
      return { offerState: "accepted" };
    }
    if (action === "reject") {
      return { offerState: "rejected" };
    }
    if (action === "counter") {
      return { offerState: "countered" };
    }
    if (action === "dispute") {
      return { offerState: "disputed" };
    }
    if (action === "fulfill") {
      return { offerState: "fulfilled" };
    }
    return { offerState: "cancelled" };
  }

  private mapEscrowStateForOffer(offerState: CommerceOfferState) {
    if (offerState === "accepted") {
      return "pending_funding" as const;
    }
    if (offerState === "fulfilled") {
      return "released" as const;
    }
    if (offerState === "disputed") {
      return "frozen" as const;
    }
    if (offerState === "rejected" || offerState === "cancelled") {
      return "refunded" as const;
    }
    return "not_started" as const;
  }

  private async readCommerceOfferMetadata(offerId: string) {
    try {
      const offer = await this.prisma.commerceOffer.findUnique({
        where: { id: offerId },
        select: {
          listingId: true,
          buyerUserId: true,
          sellerUserId: true,
        },
      });
      if (offer) {
        return offer;
      }
    } catch (error) {
      this.logger.warn(
        `commerce offer metadata primary read failed, falling back: ${String(error)}`,
      );
    }

    const fallback = await this.prisma.userPreference.findFirst({
      where: {
        key: `runtime.commerce_offer.${offerId}`,
      },
      orderBy: {
        createdAt: "desc",
      },
      select: {
        value: true,
      },
    });
    return this.readObject(fallback?.value);
  }

  private readObject(value: unknown): Record<string, unknown> | null {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return null;
    }
    return value as Record<string, unknown>;
  }

  private readString(value: unknown): string | null {
    if (typeof value !== "string") {
      return null;
    }
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  private asJson(value: unknown): Prisma.InputJsonValue {
    return value as Prisma.InputJsonValue;
  }
}
