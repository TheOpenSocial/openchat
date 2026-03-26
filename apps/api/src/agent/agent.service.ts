import { Injectable, NotFoundException } from "@nestjs/common";
import { EventEmitter } from "node:events";
import type { Prisma } from "@prisma/client";
import { PrismaService } from "../database/prisma.service.js";

type ThreadMessageListener = (message: {
  id: string;
  threadId: string;
  role: string;
  content: string;
  createdByUserId: string | null;
  createdAt: Date;
  metadata?: Prisma.JsonValue | null;
}) => void;

type AgentMessageRole = "user" | "agent" | "system" | "workflow";
const INTERNAL_WORKFLOW_HISTORY_STAGES = new Set([
  "risk_assessment_pre_tools",
  "risk_assessment_pre_send",
  "response_sanitized",
]);

@Injectable()
export class AgentService {
  private readonly events = new EventEmitter();

  constructor(private readonly prisma: PrismaService) {}

  /** Oldest thread for the user (signup "Main" thread is created first). */
  findPrimaryThreadSummaryForUser(userId: string) {
    return this.prisma.agentThread.findFirst({
      where: { userId },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        title: true,
        createdAt: true,
      },
    });
  }

  async assertThreadOwnership(threadId: string, userId: string) {
    const thread = await this.prisma.agentThread.findFirst({
      where: {
        id: threadId,
        userId,
      },
      select: {
        id: true,
      },
    });
    if (!thread) {
      throw new NotFoundException("thread not found");
    }
  }

  async listThreadMessages(
    threadId: string,
    options: {
      includeInternalWorkflow?: boolean;
    } = {},
  ) {
    const messages = await this.prisma.agentMessage.findMany({
      where: { threadId },
      orderBy: { createdAt: "asc" },
    });

    if (options.includeInternalWorkflow) {
      return messages;
    }

    return messages.filter(
      (message) => !this.isInternalWorkflowHistoryMessage(message),
    );
  }

  createThread(userId: string, title?: string) {
    return this.prisma.agentThread.create({
      data: {
        userId,
        title: title?.trim() ? title.trim().slice(0, 120) : null,
      },
    });
  }

  async createUserMessage(
    threadId: string,
    content: string,
    userId: string,
    metadata?: Record<string, unknown>,
  ) {
    return this.createThreadMessage(threadId, "user", content, {
      createdByUserId: userId,
      metadata: metadata as Prisma.InputJsonValue | undefined,
    });
  }

  async createAgentMessage(threadId: string, content: string) {
    return this.createThreadMessage(threadId, "agent", content);
  }

  async appendSystemUpdate(threadId: string, content: string) {
    return this.createThreadMessage(threadId, "system", content);
  }

  async appendWorkflowUpdate(
    threadId: string,
    content: string,
    metadata?: Record<string, unknown>,
  ) {
    return this.createThreadMessage(threadId, "workflow", content, {
      metadata: metadata as Prisma.InputJsonValue | undefined,
    });
  }

  appendEphemeralWorkflowUpdate(
    threadId: string,
    content: string,
    metadata?: Record<string, unknown>,
  ) {
    const message = {
      id: `ephemeral-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
      threadId,
      role: "workflow",
      content,
      createdByUserId: null,
      createdAt: new Date(),
      metadata: (metadata as Prisma.JsonValue | undefined) ?? null,
    };
    this.emitThreadMessage(threadId, message);
    return message;
  }

  subscribeToThread(threadId: string, listener: ThreadMessageListener) {
    this.events.on(this.threadEventName(threadId), listener);
  }

  unsubscribeFromThread(threadId: string, listener: ThreadMessageListener) {
    this.events.off(this.threadEventName(threadId), listener);
  }

  private emitThreadMessage(
    threadId: string,
    message: {
      id: string;
      threadId: string;
      role: string;
      content: string;
      createdByUserId: string | null;
      createdAt: Date;
      metadata?: Prisma.JsonValue | null;
    },
  ) {
    this.events.emit(this.threadEventName(threadId), message);
  }

  private threadEventName(threadId: string) {
    return `thread:${threadId}:message`;
  }

  private isInternalWorkflowHistoryMessage(message: {
    role: string;
    metadata?: Prisma.JsonValue | null;
  }) {
    if (message.role !== "workflow") {
      return false;
    }
    const metadata = this.readMetadata(message.metadata);
    const stage = this.readString(metadata.stage);
    return (
      typeof stage === "string" && INTERNAL_WORKFLOW_HISTORY_STAGES.has(stage)
    );
  }

  private readMetadata(value: unknown): Record<string, unknown> {
    return value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  }

  private readString(value: unknown) {
    return typeof value === "string" && value.trim().length > 0
      ? value.trim()
      : null;
  }

  private async createThreadMessage(
    threadId: string,
    role: AgentMessageRole,
    content: string,
    extras: {
      createdByUserId?: string;
      metadata?: Prisma.InputJsonValue;
    } = {},
  ) {
    const message = await this.prisma.agentMessage.create({
      data: {
        threadId,
        role,
        content,
        createdByUserId: extras.createdByUserId,
        metadata: extras.metadata,
      },
    });

    this.emitThreadMessage(threadId, message);
    return message;
  }
}
