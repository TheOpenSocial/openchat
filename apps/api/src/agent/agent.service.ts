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

  listThreadMessages(threadId: string) {
    return this.prisma.agentMessage.findMany({
      where: { threadId },
      orderBy: { createdAt: "asc" },
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
