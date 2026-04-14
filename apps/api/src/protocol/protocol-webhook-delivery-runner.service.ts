import { Injectable } from "@nestjs/common";
import { protocolWebhookDeliverySchema } from "@opensocial/protocol-events";
import { protocolIds } from "@opensocial/protocol-types";
import { signProtocolWebhookPayload } from "./protocol-webhooks.js";
import { PrismaService } from "../database/prisma.service.js";
import {
  ProtocolWebhookDeliveryWorkerService,
  type QueuedWebhookDelivery,
} from "./protocol-webhook-delivery-worker.service.js";

type ProtocolWebhookSubscriptionRow = {
  subscriptionId: string;
  targetUrl: string;
  status: string;
  eventNames: string[] | null;
  metadata: unknown;
};

type RunnerDeliveryResult = {
  deliveryId: string;
  subscriptionId: string;
  endpointUrl: string;
  outcome: "delivered" | "retrying" | "dead_lettered" | "skipped";
  statusCode: number | null;
  errorCode: string | null;
  errorMessage: string | null;
  attemptCount: number;
};

export type ProtocolWebhookDeliveryRunnerResult = {
  claimedCount: number;
  attemptedCount: number;
  deliveredCount: number;
  retryScheduledCount: number;
  deadLetteredCount: number;
  skippedCount: number;
  ranAt: string;
  results: RunnerDeliveryResult[];
};

export type RunProtocolWebhookDeliveriesInput = {
  limit?: number;
  now?: Date;
  requestTimeoutMs?: number;
  maxAttempts?: number;
  baseBackoffMs?: number;
  maxBackoffMs?: number;
};

@Injectable()
export class ProtocolWebhookDeliveryRunnerService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly worker: ProtocolWebhookDeliveryWorkerService,
  ) {}

  async runDueDeliveries(
    input: RunProtocolWebhookDeliveriesInput = {},
  ): Promise<ProtocolWebhookDeliveryRunnerResult> {
    const now = input.now ?? new Date();
    const claimed = await this.worker.claimDueDeliveries(
      input.limit ?? 25,
      now,
    );
    const subscriptionMap = await this.loadSubscriptions(
      claimed.deliveries.map((delivery) => delivery.subscriptionId),
    );

    const results: RunnerDeliveryResult[] = [];
    for (const delivery of claimed.deliveries) {
      const subscription = subscriptionMap.get(delivery.subscriptionId);
      if (!subscription || subscription.status !== "active") {
        const transition = await this.worker.markDeliveryFailed(
          delivery.deliveryId,
          {
            maxAttempts: 1,
            errorCode: !subscription
              ? "subscription_not_found"
              : "subscription_inactive",
            errorMessage: !subscription
              ? "protocol webhook subscription missing"
              : `protocol webhook subscription ${subscription.status}`,
            now,
          },
        );
        results.push({
          deliveryId: delivery.deliveryId,
          subscriptionId: delivery.subscriptionId,
          endpointUrl: subscription?.targetUrl ?? "",
          outcome: transition.status,
          statusCode: null,
          errorCode: !subscription
            ? "subscription_not_found"
            : "subscription_inactive",
          errorMessage: !subscription
            ? "protocol webhook subscription missing"
            : `protocol webhook subscription ${subscription.status}`,
          attemptCount: transition.attemptCount,
        });
        continue;
      }

      const requestBody = protocolWebhookDeliverySchema.parse({
        protocolId: protocolIds.protocol,
        deliveryId: delivery.deliveryId,
        subscriptionId: delivery.subscriptionId,
        eventName: delivery.eventType,
        status: "retrying",
        attemptCount: delivery.attemptCount,
        nextAttemptAt: delivery.nextAttemptAt,
        lastAttemptAt: now.toISOString(),
        deliveredAt: null,
        responseStatusCode: null,
        errorMessage: null,
        signature: null,
        payload: delivery.payload,
        metadata: {
          dedupeKey: delivery.dedupeKey,
          eventId: delivery.eventId,
          subscribedEvents: subscription.eventNames ?? [],
          subscriptionMetadata: subscription.metadata ?? {},
          subscriptionStatus: subscription.status,
        },
        createdAt: delivery.createdAt,
        updatedAt: now.toISOString(),
      });
      const signature = signProtocolWebhookPayload(requestBody);

      try {
        const response = await this.postWebhook(
          subscription.targetUrl,
          requestBody,
          signature,
          input.requestTimeoutMs ?? 10_000,
          delivery,
        );

        if (response.ok) {
          const transitioned = await this.worker.markDeliverySucceeded(
            delivery.deliveryId,
            {
              responseStatus: response.status,
              responseBody: await this.safeReadBody(response),
              deliveredAt: now,
            },
          );
          results.push({
            deliveryId: delivery.deliveryId,
            subscriptionId: delivery.subscriptionId,
            endpointUrl: subscription.targetUrl,
            outcome: transitioned.status,
            statusCode: response.status,
            errorCode: null,
            errorMessage: null,
            attemptCount: transitioned.attemptCount,
          });
          continue;
        }

        const responseBody = await this.safeReadBody(response);
        const transitioned = await this.worker.markDeliveryFailed(
          delivery.deliveryId,
          {
            responseStatus: response.status,
            responseBody,
            errorCode: `http_${response.status}`,
            errorMessage:
              response.statusText || responseBody || "webhook delivery failed",
            maxAttempts: input.maxAttempts,
            baseBackoffMs: input.baseBackoffMs,
            maxBackoffMs: input.maxBackoffMs,
            now,
          },
        );
        results.push({
          deliveryId: delivery.deliveryId,
          subscriptionId: delivery.subscriptionId,
          endpointUrl: subscription.targetUrl,
          outcome: transitioned.status,
          statusCode: response.status,
          errorCode: `http_${response.status}`,
          errorMessage:
            response.statusText || responseBody || "webhook delivery failed",
          attemptCount: transitioned.attemptCount,
        });
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "unknown webhook error";
        const transitioned = await this.worker.markDeliveryFailed(
          delivery.deliveryId,
          {
            errorCode: "network_error",
            errorMessage: message,
            maxAttempts: input.maxAttempts,
            baseBackoffMs: input.baseBackoffMs,
            maxBackoffMs: input.maxBackoffMs,
            now,
          },
        );
        results.push({
          deliveryId: delivery.deliveryId,
          subscriptionId: delivery.subscriptionId,
          endpointUrl: subscription.targetUrl,
          outcome: transitioned.status,
          statusCode: null,
          errorCode: "network_error",
          errorMessage: message,
          attemptCount: transitioned.attemptCount,
        });
      }
    }

    return {
      claimedCount: claimed.claimedCount,
      attemptedCount: results.filter((result) => result.outcome !== "skipped")
        .length,
      deliveredCount: results.filter((result) => result.outcome === "delivered")
        .length,
      retryScheduledCount: results.filter(
        (result) => result.outcome === "retrying",
      ).length,
      deadLetteredCount: results.filter(
        (result) => result.outcome === "dead_lettered",
      ).length,
      skippedCount: results.filter((result) => result.outcome === "skipped")
        .length,
      ranAt: now.toISOString(),
      results,
    };
  }

  private async loadSubscriptions(subscriptionIds: string[]) {
    const uniqueIds = [...new Set(subscriptionIds)].filter(Boolean);
    const subscriptions = new Map<string, ProtocolWebhookSubscriptionRow>();

    if (uniqueIds.length === 0) {
      return subscriptions;
    }

    const rows = await this.prisma.$queryRawUnsafe<
      ProtocolWebhookSubscriptionRow[]
    >(
      `SELECT id AS "subscriptionId",
              subscription_id AS "subscriptionId",
              target_url AS "targetUrl",
              status,
              event_names AS "eventNames",
              metadata
       FROM protocol_webhook_subscriptions
       WHERE subscription_id = ANY($1::text[])`,
      uniqueIds,
    );

    for (const row of rows) {
      subscriptions.set(row.subscriptionId, row);
    }

    return subscriptions;
  }

  private async postWebhook(
    targetUrl: string,
    body: unknown,
    signature: string,
    timeoutMs: number,
    delivery: QueuedWebhookDelivery,
  ) {
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      Math.max(timeoutMs, 1),
    );
    try {
      return await fetch(targetUrl, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "user-agent": "OpenSocial-Protocol-Webhook/1.0",
          "x-opensocial-protocol-delivery-id": delivery.deliveryId,
          "x-opensocial-protocol-subscription-id": delivery.subscriptionId,
          "x-opensocial-protocol-event-name": delivery.eventType,
          "x-opensocial-protocol-attempt-count": String(delivery.attemptCount),
          "x-opensocial-protocol-event-family": "protocol",
          "x-opensocial-protocol-signature": signature,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }
  }

  private async safeReadBody(response: Response) {
    try {
      const body = await response.text();
      return body.slice(0, 2000);
    } catch {
      return null;
    }
  }
}
