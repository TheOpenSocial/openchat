import { Injectable } from "@nestjs/common";
import { PrismaService } from "../database/prisma.service.js";

type RawQueuedWebhookDeliveryRow = {
  deliveryId: string;
  subscriptionId: string;
  eventId: string | null;
  eventType: string;
  payload: unknown;
  dedupeKey: string | null;
  attemptCount: number;
  status: string;
  nextAttemptAt: Date | string | null;
  deliveredAt: Date | string | null;
  failedAt: Date | string | null;
  responseStatus: number | null;
  responseBody: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
};

export type QueuedWebhookDelivery = {
  deliveryId: string;
  subscriptionId: string;
  eventId: string | null;
  eventType: string;
  payload: unknown;
  dedupeKey: string | null;
  attemptCount: number;
  status: "queued" | "retrying" | "delivered" | "failed" | "dead_lettered";
  nextAttemptAt: string | null;
  deliveredAt: string | null;
  failedAt: string | null;
  responseStatus: number | null;
  responseBody: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ClaimQueuedDeliveriesResult = {
  claimedCount: number;
  claimedAt: string;
  deliveries: QueuedWebhookDelivery[];
};

export type DeliverySuccessInput = {
  responseStatus: number;
  responseBody?: string | null;
  deliveredAt?: Date;
};

export type DeliveryFailureInput = {
  responseStatus?: number | null;
  responseBody?: string | null;
  errorCode?: string | null;
  errorMessage?: string | null;
  maxAttempts?: number;
  baseBackoffMs?: number;
  maxBackoffMs?: number;
  now?: Date;
};

export type DeliveryTransitionResult = {
  deliveryId: string;
  status: "retrying" | "delivered" | "dead_lettered";
  attemptCount: number;
  nextAttemptAt: string | null;
  transitionedAt: string;
};

type DeliveryAttemptStateRow = {
  deliveryId: string;
  attemptCount: number;
  status: string;
  createdAt: Date | string;
};

@Injectable()
export class ProtocolWebhookDeliveryWorkerService {
  constructor(private readonly prisma: PrismaService) {}

  async claimDueDeliveries(
    limit = 25,
    now = new Date(),
    appId?: string,
  ): Promise<ClaimQueuedDeliveriesResult> {
    return this.claimQueuedDeliveries(limit, now, appId);
  }

  async claimQueuedDeliveries(
    limit = 25,
    now = new Date(),
    appId?: string,
  ): Promise<ClaimQueuedDeliveriesResult> {
    const boundedLimit = Math.min(Math.max(limit, 1), 100);
    const claimedAt = now.toISOString();

    const rows = await this.prisma.$queryRawUnsafe<
      RawQueuedWebhookDeliveryRow[]
    >(
      `WITH candidate_ids AS (
         SELECT id
         FROM protocol_webhook_deliveries
         WHERE status IN ('queued', 'retrying')
           AND (next_attempt_at IS NULL OR next_attempt_at <= $2::timestamptz)
           AND ($3::text IS NULL OR app_id = $3)
         ORDER BY COALESCE(next_attempt_at, created_at) ASC, created_at ASC
         FOR UPDATE SKIP LOCKED
         LIMIT $1
       )
       UPDATE protocol_webhook_deliveries deliveries
       SET status = 'retrying',
           attempt_count = deliveries.attempt_count + 1,
           next_attempt_at = NULL,
           updated_at = $2::timestamptz
       FROM candidate_ids
       WHERE deliveries.id = candidate_ids.id
       RETURNING deliveries.id AS "deliveryId",
                 deliveries.subscription_id AS "subscriptionId",
                 deliveries.event_id AS "eventId",
                 deliveries.event_type AS "eventType",
                 deliveries.payload,
                 deliveries.dedupe_key AS "dedupeKey",
                 deliveries.attempt_count AS "attemptCount",
                 deliveries.status,
                 deliveries.next_attempt_at AS "nextAttemptAt",
                 deliveries.delivered_at AS "deliveredAt",
                 deliveries.failed_at AS "failedAt",
                 deliveries.response_status AS "responseStatus",
                 deliveries.response_body AS "responseBody",
                 deliveries.error_code AS "errorCode",
                 deliveries.error_message AS "errorMessage",
                 deliveries.created_at AS "createdAt",
                 deliveries.updated_at AS "updatedAt"`,
      boundedLimit,
      claimedAt,
      appId ?? null,
    );

    return {
      claimedCount: rows.length,
      claimedAt,
      deliveries: rows
        .map((row) => this.mapDeliveryRow(row))
        .sort(
          (left, right) =>
            Date.parse(left.createdAt) - Date.parse(right.createdAt),
        ),
    };
  }

  async markDeliverySucceeded(
    deliveryId: string,
    input: DeliverySuccessInput,
  ): Promise<DeliveryTransitionResult> {
    const deliveredAt = (input.deliveredAt ?? new Date()).toISOString();
    const rows = await this.prisma.$queryRawUnsafe<
      RawQueuedWebhookDeliveryRow[]
    >(
      `UPDATE protocol_webhook_deliveries
       SET status = 'delivered',
           delivered_at = $2::timestamptz,
           failed_at = NULL,
           next_attempt_at = NULL,
           response_status = $3,
           response_body = $4,
           error_code = NULL,
           error_message = NULL,
           updated_at = $2::timestamptz
       WHERE id = $1
       RETURNING id AS "deliveryId",
                 subscription_id AS "subscriptionId",
                 event_id AS "eventId",
                 event_type AS "eventType",
                 payload,
                 dedupe_key AS "dedupeKey",
                 attempt_count AS "attemptCount",
                 status,
                 next_attempt_at AS "nextAttemptAt",
                 delivered_at AS "deliveredAt",
                 failed_at AS "failedAt",
                 response_status AS "responseStatus",
                 response_body AS "responseBody",
                 error_code AS "errorCode",
                 error_message AS "errorMessage",
                 created_at AS "createdAt",
                 updated_at AS "updatedAt"`,
      deliveryId,
      deliveredAt,
      input.responseStatus,
      input.responseBody ?? null,
    );

    const row = rows[0];
    if (!row) {
      throw new Error(`protocol webhook delivery ${deliveryId} not found`);
    }

    return {
      deliveryId: row.deliveryId,
      status: "delivered",
      attemptCount: row.attemptCount,
      nextAttemptAt: null,
      transitionedAt: deliveredAt,
    };
  }

  async markDeliveryFailed(
    deliveryId: string,
    input: DeliveryFailureInput,
  ): Promise<DeliveryTransitionResult> {
    const now = (input.now ?? new Date()).toISOString();
    const maxAttempts = Math.max(input.maxAttempts ?? 5, 1);
    const baseBackoffMs = Math.max(input.baseBackoffMs ?? 1000, 1);
    const maxBackoffMs = Math.max(input.maxBackoffMs ?? 60_000, baseBackoffMs);
    const currentRows = await this.prisma.$queryRawUnsafe<
      DeliveryAttemptStateRow[]
    >(
      `SELECT id AS "deliveryId",
              attempt_count AS "attemptCount",
              status,
              created_at AS "createdAt"
       FROM protocol_webhook_deliveries
       WHERE id = $1
       LIMIT 1`,
      deliveryId,
    );

    const currentRow = currentRows[0];
    if (!currentRow) {
      throw new Error(`protocol webhook delivery ${deliveryId} not found`);
    }

    const shouldDeadLetter = currentRow.attemptCount >= maxAttempts;
    const nextAttemptAt = shouldDeadLetter
      ? null
      : new Date(
          Date.parse(now) +
            Math.min(
              maxBackoffMs,
              baseBackoffMs *
                Math.pow(2, Math.max(currentRow.attemptCount - 1, 0)),
            ),
        ).toISOString();
    const status = shouldDeadLetter ? "dead_lettered" : "retrying";

    const rows = await this.prisma.$queryRawUnsafe<
      RawQueuedWebhookDeliveryRow[]
    >(
      `UPDATE protocol_webhook_deliveries
       SET status = $2,
           failed_at = $3::timestamptz,
           next_attempt_at = $4::timestamptz,
           response_status = $5,
           response_body = $6,
           error_code = $7,
           error_message = $8,
           updated_at = $3::timestamptz
       WHERE id = $1
       RETURNING id AS "deliveryId",
                 subscription_id AS "subscriptionId",
                 event_id AS "eventId",
                 event_type AS "eventType",
                 payload,
                 dedupe_key AS "dedupeKey",
                 attempt_count AS "attemptCount",
                 status,
                 next_attempt_at AS "nextAttemptAt",
                 delivered_at AS "deliveredAt",
                 failed_at AS "failedAt",
                 response_status AS "responseStatus",
                 response_body AS "responseBody",
                 error_code AS "errorCode",
                 error_message AS "errorMessage",
                 created_at AS "createdAt",
                 updated_at AS "updatedAt"`,
      deliveryId,
      status,
      now,
      nextAttemptAt,
      input.responseStatus ?? null,
      input.responseBody ?? null,
      input.errorCode ?? null,
      input.errorMessage ?? null,
    );

    const row = rows[0];
    if (!row) {
      throw new Error(`protocol webhook delivery ${deliveryId} not found`);
    }

    return {
      deliveryId: row.deliveryId,
      status,
      attemptCount: row.attemptCount,
      nextAttemptAt,
      transitionedAt: now,
    };
  }

  private mapDeliveryRow(
    row: RawQueuedWebhookDeliveryRow,
  ): QueuedWebhookDelivery {
    return {
      deliveryId: row.deliveryId,
      subscriptionId: row.subscriptionId,
      eventId: row.eventId,
      eventType: row.eventType,
      payload: row.payload,
      dedupeKey: row.dedupeKey,
      attemptCount: Number(row.attemptCount),
      status: row.status as QueuedWebhookDelivery["status"],
      nextAttemptAt: row.nextAttemptAt
        ? new Date(row.nextAttemptAt).toISOString()
        : null,
      deliveredAt: row.deliveredAt
        ? new Date(row.deliveredAt).toISOString()
        : null,
      failedAt: row.failedAt ? new Date(row.failedAt).toISOString() : null,
      responseStatus: row.responseStatus,
      responseBody: row.responseBody,
      errorCode: row.errorCode,
      errorMessage: row.errorMessage,
      createdAt: new Date(row.createdAt).toISOString(),
      updatedAt: new Date(row.updatedAt).toISOString(),
    };
  }
}
