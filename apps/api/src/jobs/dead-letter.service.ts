import { InjectQueue } from "@nestjs/bullmq";
import { Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { Job, Queue } from "bullmq";
import { randomUUID } from "node:crypto";
import { recordQueueJobFailure } from "../common/ops-metrics.js";
import { PrismaService } from "../database/prisma.service.js";

const DEAD_LETTER_ACTION = "queue.job_dead_lettered";
const REPLAY_ACTION = "queue.job_replayed";
const STALLED_ACTION = "queue.job_stalled";

interface DeadLetterMetadata {
  queueName?: string;
  jobName?: string;
  jobId?: string | null;
  payload?: unknown;
  failedReason?: string;
  stacktrace?: string[];
  attemptsMade?: number;
  maxAttempts?: number;
  idempotencyKey?: string | null;
  deadLetteredAt?: string;
  replayCount?: number;
  lastReplayedAt?: string;
  lastReplayJobId?: string;
}

@Injectable()
export class DeadLetterService {
  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue("intent-processing")
    private readonly intentProcessingQueue: Queue,
    @InjectQueue("notification")
    private readonly notificationQueue: Queue,
    @InjectQueue("connection-setup")
    private readonly connectionSetupQueue: Queue,
    @InjectQueue("media-processing")
    private readonly mediaProcessingQueue: Queue,
  ) {}

  async captureFailedJob(
    queueName: string,
    job: Job | undefined,
    error: Error,
  ) {
    if (!job) {
      return;
    }

    const maxAttempts = Number(job.opts.attempts ?? 1);
    if (job.attemptsMade < maxAttempts) {
      return;
    }
    recordQueueJobFailure(queueName);

    const payloadObject =
      job.data && typeof job.data === "object"
        ? (job.data as Record<string, unknown>)
        : null;
    const metadata = this.toJsonObject({
      queueName,
      jobName: job.name,
      jobId: job.id ? String(job.id) : null,
      payload: job.data,
      failedReason: error.message || job.failedReason || "unknown_error",
      stacktrace: job.stacktrace ?? [],
      attemptsMade: job.attemptsMade,
      maxAttempts,
      idempotencyKey:
        typeof payloadObject?.idempotencyKey === "string"
          ? payloadObject.idempotencyKey
          : null,
      deadLetteredAt: new Date().toISOString(),
      replayCount: 0,
    });

    await this.prisma.auditLog.create({
      data: {
        actorType: "system",
        action: DEAD_LETTER_ACTION,
        entityType: "queue_job",
        entityId: null,
        metadata,
      },
    });
  }

  async captureStalledJob(
    queueName: string,
    jobId: string,
    previousState?: string,
  ) {
    await this.prisma.auditLog.create({
      data: {
        actorType: "system",
        action: STALLED_ACTION,
        entityType: "queue_job",
        entityId: null,
        metadata: this.toJsonObject({
          queueName,
          jobId,
          previousState: previousState ?? null,
          stalledAt: new Date().toISOString(),
          recovery: "bullmq_auto_requeue",
        }),
      },
    });
  }

  async listDeadLetters(limit = 50) {
    const rows = await this.prisma.auditLog.findMany({
      where: {
        action: DEAD_LETTER_ACTION,
        entityType: "queue_job",
      },
      orderBy: {
        createdAt: "desc",
      },
      take: Math.min(Math.max(limit, 1), 200),
      select: {
        id: true,
        createdAt: true,
        metadata: true,
      },
    });

    return rows.map((row) => ({
      id: row.id,
      createdAt: row.createdAt.toISOString(),
      ...this.readDeadLetterMetadata(row.metadata),
    }));
  }

  async replayDeadLetter(deadLetterId: string) {
    const row = await this.prisma.auditLog.findUnique({
      where: { id: deadLetterId },
      select: {
        id: true,
        action: true,
        metadata: true,
      },
    });
    if (!row || row.action !== DEAD_LETTER_ACTION) {
      throw new NotFoundException("dead-letter entry not found");
    }

    const metadata = this.readDeadLetterMetadata(row.metadata);
    if (!metadata.queueName || !metadata.jobName || !metadata.payload) {
      throw new NotFoundException("dead-letter payload is not replayable");
    }

    const queue = this.resolveQueueByName(metadata.queueName);
    if (!queue) {
      throw new NotFoundException(
        `queue ${metadata.queueName} is not replayable`,
      );
    }

    const replayCount = Math.max(0, Number(metadata.replayCount ?? 0)) + 1;
    const replayJobId = `replay:${deadLetterId}:${replayCount}`;
    const replayPayload = this.withReplayIdempotencyKey(
      metadata.payload,
      replayCount,
    );
    await queue.add(metadata.jobName, replayPayload, {
      jobId: replayJobId,
      attempts: Math.max(1, Number(metadata.maxAttempts ?? 3)),
      removeOnComplete: 500,
      backoff: {
        type: "exponential",
        delay: 1000,
      },
    });

    const nextMetadata = this.toJsonObject({
      ...metadata,
      replayCount,
      lastReplayedAt: new Date().toISOString(),
      lastReplayJobId: replayJobId,
    });
    await this.prisma.auditLog.update({
      where: { id: deadLetterId },
      data: {
        metadata: nextMetadata,
      },
    });

    await this.prisma.auditLog.create({
      data: {
        actorType: "system",
        action: REPLAY_ACTION,
        entityType: "queue_job",
        entityId: null,
        metadata: this.toJsonObject({
          deadLetterId,
          queueName: metadata.queueName,
          jobName: metadata.jobName,
          replayJobId,
          replayCount,
        }),
      },
    });

    return {
      deadLetterId,
      replayJobId,
      replayCount,
      queueName: metadata.queueName,
      jobName: metadata.jobName,
      status: "queued" as const,
    };
  }

  private resolveQueueByName(queueName: string) {
    const byName: Record<string, Queue> = {
      "intent-processing": this.intentProcessingQueue,
      notification: this.notificationQueue,
      "connection-setup": this.connectionSetupQueue,
      "media-processing": this.mediaProcessingQueue,
    };
    return byName[queueName] ?? null;
  }

  private withReplayIdempotencyKey(payload: unknown, replayCount: number) {
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      return payload;
    }
    const original = payload as Record<string, unknown>;
    const idempotencyKey =
      typeof original.idempotencyKey === "string"
        ? original.idempotencyKey
        : `replay:${randomUUID()}`;
    return {
      ...original,
      idempotencyKey: `${idempotencyKey}:replay:${replayCount}`,
    };
  }

  private readDeadLetterMetadata(metadata: Prisma.JsonValue | null) {
    if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
      return {} as DeadLetterMetadata;
    }
    return metadata as DeadLetterMetadata;
  }

  private toJsonObject(input: Record<string, unknown>) {
    return JSON.parse(JSON.stringify(input)) as Prisma.InputJsonObject;
  }
}
