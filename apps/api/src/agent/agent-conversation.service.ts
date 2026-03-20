import {
  OpenAIClient,
  agentActionTypes,
  canAgentHandoff,
  canAgentUseTool,
  requiresHumanApproval,
  type AgentActionType,
  type AgentTool,
  type OpenAIAgentRole,
} from "@opensocial/openai";
import { Prisma } from "@prisma/client";
import { Injectable, Logger, Optional } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { PrismaService } from "../database/prisma.service.js";
import { ModerationService } from "../moderation/moderation.service.js";
import { AgentService } from "./agent.service.js";

type AgentAttachmentInput =
  | {
      kind: "image_url";
      url: string;
      caption?: string;
    }
  | {
      kind: "file_ref";
      fileId: string;
      caption?: string;
    };

type ConversationToolCall = {
  role: OpenAIAgentRole;
  tool: AgentTool;
  input: Record<string, unknown>;
};

type ConversationToolResult = {
  role: OpenAIAgentRole;
  tool: AgentTool;
  status: "executed" | "denied" | "failed";
  output?: unknown;
  reason?: string;
};

type ModerationGateResult = {
  decision: "clean" | "review" | "blocked";
  score: number;
  reasons: string[];
};

@Injectable()
export class AgentConversationService {
  private readonly logger = new Logger(AgentConversationService.name);
  private readonly openai = new OpenAIClient({
    apiKey: process.env.OPENAI_API_KEY ?? "",
  });

  constructor(
    private readonly prisma: PrismaService,
    private readonly agentService: AgentService,
    @Optional()
    private readonly moderationService?: ModerationService,
  ) {}

  async runAgenticTurn(input: {
    threadId: string;
    userId: string;
    content: string;
    traceId?: string;
    streamResponseTokens?: boolean;
    voiceTranscript?: string;
    attachments?: AgentAttachmentInput[];
  }) {
    const traceId = input.traceId?.trim() || randomUUID();
    const streamResponseTokens = input.streamResponseTokens ?? false;
    const multimodalContext = this.buildMultimodalContext({
      voiceTranscript: input.voiceTranscript,
      attachments: input.attachments,
    });
    const userContent = this.buildUserContentForTurn(
      input.content,
      multimodalContext,
    );
    const hasMultimodal =
      multimodalContext.voiceTranscript.length > 0 ||
      multimodalContext.attachments.length > 0;
    const userMessage = await this.agentService.createUserMessage(
      input.threadId,
      userContent,
      input.userId,
      hasMultimodal
        ? {
            multimodal: {
              voiceTranscript: multimodalContext.voiceTranscript,
              attachments: multimodalContext.attachments,
            },
          }
        : undefined,
    );

    await this.appendOrchestrationStep(
      input.threadId,
      traceId,
      "planning_started",
      "Planning agentic response.",
    );

    const threadMessages = await this.prisma.agentMessage.findMany({
      where: { threadId: input.threadId },
      orderBy: { createdAt: "desc" },
      take: 24,
      select: {
        id: true,
        role: true,
        content: true,
        createdAt: true,
        metadata: true,
      },
    });

    const threadSummary = this.buildThreadSummary(threadMessages);

    const allowedSpecialists: OpenAIAgentRole[] = [
      "intent_parser",
      "ranking_explanation",
      "personalization_interpreter",
      "notification_copy",
      "moderation_assistant",
    ];

    const planned = await this.openai.planConversationTurn(
      {
        userMessage: userContent,
        threadSummary,
        multimodalContext: hasMultimodal
          ? {
              voiceTranscript: multimodalContext.voiceTranscript,
              attachments: multimodalContext.attachments,
            }
          : undefined,
        allowedSpecialists,
        maxToolCalls: 8,
      },
      traceId,
    );

    const specialists = planned.specialists.filter((role) =>
      canAgentHandoff("manager", role),
    );
    const delegatedSpecialistSet = new Set<OpenAIAgentRole>(specialists);
    const toolCalls = planned.toolCalls.map((toolCall) => ({
      role: toolCall.role,
      tool: toolCall.tool,
      input: toolCall.input ?? {},
    }));

    await this.appendOrchestrationStep(
      input.threadId,
      traceId,
      "plan_ready",
      `Plan ready: ${specialists.length} specialists, ${toolCalls.length} tools.`,
      {
        specialists,
        toolCalls: toolCalls.map((call) => ({
          role: call.role,
          tool: call.tool,
        })),
      },
    );

    const preToolRisk = this.assessRiskGate({
      content: userContent,
      surface: "agent_turn",
      context:
        multimodalContext.voiceTranscript ||
        multimodalContext.attachments.length > 0
          ? "turn includes voice transcript and/or attachments"
          : undefined,
    });
    await this.appendOrchestrationStep(
      input.threadId,
      traceId,
      "risk_assessment_pre_tools",
      `Risk check before tools: ${preToolRisk.decision}.`,
      {
        decision: preToolRisk.decision,
        score: preToolRisk.score,
        reasons: preToolRisk.reasons,
      },
    );
    await this.persistRiskAssessment({
      threadId: input.threadId,
      userId: input.userId,
      traceId,
      phase: "pre_tools",
      assessedContent: userContent,
      assessment: preToolRisk,
    });

    const toolResults: ConversationToolResult[] = [];
    const specialistOutputs: Partial<Record<OpenAIAgentRole, unknown>> = {};
    const specialistNotes: Array<{ role: OpenAIAgentRole; status: string }> =
      [];

    for (const call of toolCalls) {
      if (preToolRisk.decision === "blocked") {
        toolResults.push({
          role: call.role,
          tool: call.tool,
          status: "denied",
          reason: "blocked_by_risk_assessment",
        });
        await this.appendOrchestrationStep(
          input.threadId,
          traceId,
          "tool_finished",
          `Tool ${call.tool} denied by risk gate.`,
          {
            role: call.role,
            tool: call.tool,
            status: "denied",
            reason: "blocked_by_risk_assessment",
          },
        );
        continue;
      }

      if (
        preToolRisk.decision === "review" &&
        this.isRiskSensitiveTool(call.tool)
      ) {
        toolResults.push({
          role: call.role,
          tool: call.tool,
          status: "denied",
          reason: "review_restricted_tool",
        });
        await this.appendOrchestrationStep(
          input.threadId,
          traceId,
          "tool_finished",
          `Tool ${call.tool} blocked while under review gate.`,
          {
            role: call.role,
            tool: call.tool,
            status: "denied",
            reason: "review_restricted_tool",
          },
        );
        continue;
      }

      await this.appendOrchestrationStep(
        input.threadId,
        traceId,
        "tool_started",
        `Running tool ${call.tool} as ${call.role}.`,
        { role: call.role, tool: call.tool },
      );

      if (call.role !== "manager" && !delegatedSpecialistSet.has(call.role)) {
        this.logger.warn(
          JSON.stringify({
            event: "agentic.tool_denied",
            traceId,
            role: call.role,
            tool: call.tool,
            reason: "tool_role_not_handed_off",
          }),
        );
        toolResults.push({
          role: call.role,
          tool: call.tool,
          status: "denied",
          reason: "tool_role_not_handed_off",
        });
        await this.appendOrchestrationStep(
          input.threadId,
          traceId,
          "tool_finished",
          `Tool ${call.tool} denied for ${call.role}.`,
          {
            role: call.role,
            tool: call.tool,
            status: "denied",
            reason: "tool_role_not_handed_off",
          },
        );
        continue;
      }

      const toolResult = await this.executeToolCall(
        input.threadId,
        input.userId,
        traceId,
        call,
      );
      toolResults.push(toolResult);
      await this.appendOrchestrationStep(
        input.threadId,
        traceId,
        "tool_finished",
        `Tool ${call.tool} ${toolResult.status} for ${call.role}.`,
        {
          role: call.role,
          tool: call.tool,
          status: toolResult.status,
          reason: toolResult.reason,
        },
      );
    }

    if (preToolRisk.decision === "blocked") {
      for (const specialist of specialists) {
        specialistNotes.push({
          role: specialist,
          status: "skipped_risk_blocked",
        });
      }
    }

    for (const specialist of specialists) {
      if (preToolRisk.decision === "blocked") {
        continue;
      }
      await this.appendOrchestrationStep(
        input.threadId,
        traceId,
        "specialist_started",
        `Running specialist ${specialist}.`,
        { specialist },
      );
      try {
        const output = await this.runSpecialist(
          specialist,
          userContent,
          traceId,
          toolResults,
        );
        specialistOutputs[specialist] = output;
        specialistNotes.push({ role: specialist, status: "executed" });
        await this.appendOrchestrationStep(
          input.threadId,
          traceId,
          "specialist_finished",
          `Specialist ${specialist} completed.`,
          { specialist, status: "executed" },
        );
      } catch (error) {
        specialistNotes.push({ role: specialist, status: "failed" });
        this.logger.warn(
          JSON.stringify({
            event: "agentic.specialist_failed",
            traceId,
            specialist,
            error:
              error instanceof Error
                ? error.message
                : "specialist_failed_unknown",
          }),
        );
        await this.appendOrchestrationStep(
          input.threadId,
          traceId,
          "specialist_finished",
          `Specialist ${specialist} failed.`,
          {
            specialist,
            status: "failed",
            error:
              error instanceof Error
                ? error.message
                : "specialist_failed_unknown",
          },
        );
      }
    }

    await this.appendOrchestrationStep(
      input.threadId,
      traceId,
      "response_synthesis_started",
      "Synthesizing final response.",
    );

    const responseInput = {
      userMessage: userContent,
      responseGoal: planned.responseGoal,
      multimodalContext: hasMultimodal
        ? {
            voiceTranscript: multimodalContext.voiceTranscript,
            attachments: multimodalContext.attachments,
          }
        : undefined,
      specialistOutputs: specialistOutputs as Record<string, unknown>,
      toolOutputs: toolResults.reduce(
        (acc, item, index) => {
          acc[`${item.role}:${item.tool}:${index}`] = {
            status: item.status,
            output: item.output,
            reason: item.reason,
          };
          return acc;
        },
        {} as Record<string, unknown>,
      ),
    };

    let streamedTokenChunkCount = 0;
    let streamTokenIndex = 0;
    let pendingStreamChunk = "";
    let lastStreamEmitAt = 0;

    const flushPendingStreamChunk = async (force = false) => {
      if (!streamResponseTokens || pendingStreamChunk.length === 0) {
        return;
      }
      const now = Date.now();
      if (
        !force &&
        pendingStreamChunk.length < 80 &&
        now - lastStreamEmitAt < 120
      ) {
        return;
      }
      const chunk = this.normalizeStreamChunk(pendingStreamChunk);
      pendingStreamChunk = "";
      if (!chunk) {
        return;
      }
      streamTokenIndex += 1;
      streamedTokenChunkCount = streamTokenIndex;
      lastStreamEmitAt = now;
      await this.appendOrchestrationStep(
        input.threadId,
        traceId,
        "response_token",
        chunk,
        {
          index: streamTokenIndex,
          source: "model_stream",
        },
      );
    };

    let responseText =
      preToolRisk.decision === "blocked"
        ? this.blockedByRiskResponse(preToolRisk.reasons)
        : await this.openai.composeConversationResponse(
            responseInput,
            traceId,
            streamResponseTokens
              ? {
                  onTextDelta: async (delta) => {
                    pendingStreamChunk += delta;
                    await flushPendingStreamChunk(false);
                  },
                }
              : undefined,
          );

    if (streamResponseTokens) {
      await flushPendingStreamChunk(true);
    }

    const preSendRisk = this.assessRiskGate({
      content: responseText,
      surface: "agent_response",
      context: `trace:${traceId}`,
    });
    await this.appendOrchestrationStep(
      input.threadId,
      traceId,
      "risk_assessment_pre_send",
      `Risk check before response send: ${preSendRisk.decision}.`,
      {
        decision: preSendRisk.decision,
        score: preSendRisk.score,
        reasons: preSendRisk.reasons,
      },
    );
    await this.persistRiskAssessment({
      threadId: input.threadId,
      userId: input.userId,
      traceId,
      phase: "pre_send",
      assessedContent: responseText,
      assessment: preSendRisk,
    });

    if (preSendRisk.decision === "blocked") {
      responseText = this.blockedByRiskResponse(preSendRisk.reasons);
      await this.appendOrchestrationStep(
        input.threadId,
        traceId,
        "response_sanitized",
        "Response replaced by safety fallback.",
        {
          reason: "blocked_by_risk_assessment",
          riskReasons: preSendRisk.reasons,
        },
      );
    } else if (preSendRisk.decision === "review") {
      responseText = this.reviewConstrainedResponse(responseText);
      await this.appendOrchestrationStep(
        input.threadId,
        traceId,
        "response_sanitized",
        "Response constrained by review guardrail.",
        {
          reason: "review_constrained",
          riskReasons: preSendRisk.reasons,
        },
      );
    }

    if (streamResponseTokens && streamedTokenChunkCount === 0) {
      streamedTokenChunkCount = await this.streamResponseTokenChunks(
        input.threadId,
        traceId,
        responseText,
      );
    }

    const agentMessage = await this.agentService.createAgentMessage(
      input.threadId,
      responseText,
    );

    await this.appendOrchestrationStep(
      input.threadId,
      traceId,
      "turn_completed",
      "Agentic turn completed.",
      {
        specialists,
        specialistNotes,
        riskChecks: {
          preTool: preToolRisk,
          preSend: preSendRisk,
        },
        streamResponseTokens,
        streamedTokenChunkCount,
        toolResults: toolResults.map((result) => ({
          role: result.role,
          tool: result.tool,
          status: result.status,
          reason: result.reason,
        })),
      },
    );

    return {
      traceId,
      userMessageId: userMessage.id,
      agentMessageId: agentMessage.id,
      plan: {
        specialists,
        toolCalls: toolCalls.map((call) => ({
          role: call.role,
          tool: call.tool,
        })),
        responseGoal: planned.responseGoal ?? null,
      },
      toolResults,
      specialistNotes,
      streaming: {
        responseTokenStreamed: streamResponseTokens,
        chunkCount: streamedTokenChunkCount,
      },
    };
  }

  private async executeToolCall(
    threadId: string,
    userId: string,
    traceId: string,
    call: ConversationToolCall,
  ): Promise<ConversationToolResult> {
    if (!canAgentUseTool(call.role, call.tool)) {
      this.logger.warn(
        JSON.stringify({
          event: "agentic.tool_denied",
          traceId,
          role: call.role,
          tool: call.tool,
          reason: "tool_not_allowed_for_role",
        }),
      );
      return {
        role: call.role,
        tool: call.tool,
        status: "denied",
        reason: "tool_not_allowed_for_role",
      };
    }

    const requestedActionRaw = this.readString(
      call.input.actionType ?? call.input.action,
    );
    if (requestedActionRaw) {
      const actionType = this.readActionType(requestedActionRaw);
      if (!actionType) {
        this.logger.warn(
          JSON.stringify({
            event: "agentic.tool_denied",
            traceId,
            role: call.role,
            tool: call.tool,
            reason: "invalid_action_type",
            actionType: requestedActionRaw,
          }),
        );
        return {
          role: call.role,
          tool: call.tool,
          status: "denied",
          reason: "invalid_action_type",
        };
      }

      const riskLevel = this.readRiskLevel(call.input.riskLevel);
      const actionCheck = this.assertActionAllowedForRole(
        call.role,
        actionType,
        riskLevel,
      );
      if (!actionCheck.allowed) {
        this.logger.warn(
          JSON.stringify({
            event: "agentic.action_blocked",
            traceId,
            role: call.role,
            tool: call.tool,
            actionType,
            riskLevel,
            reason: actionCheck.reason,
          }),
        );
        return {
          role: call.role,
          tool: call.tool,
          status: "denied",
          reason: actionCheck.reason,
        };
      }
    }

    try {
      switch (call.tool) {
        case "workflow.read": {
          const maxMessages = this.readIntInRange(
            call.input.maxMessages,
            1,
            40,
            12,
          );
          const messages = await this.prisma.agentMessage.findMany({
            where: { threadId },
            orderBy: { createdAt: "desc" },
            take: maxMessages,
            select: {
              id: true,
              role: true,
              content: true,
              createdAt: true,
            },
          });
          return {
            role: call.role,
            tool: call.tool,
            status: "executed",
            output: messages.reverse(),
          };
        }
        case "workflow.write": {
          const content =
            typeof call.input.content === "string"
              ? call.input.content.slice(0, 500)
              : null;
          if (!content) {
            return {
              role: call.role,
              tool: call.tool,
              status: "failed",
              reason: "missing_workflow_content",
            };
          }
          await this.agentService.appendWorkflowUpdate(threadId, content, {
            traceId,
          });
          return {
            role: call.role,
            tool: call.tool,
            status: "executed",
            output: { written: true },
          };
        }
        case "intent.parse": {
          const text =
            typeof call.input.text === "string" &&
            call.input.text.trim().length > 0
              ? call.input.text
              : "";
          const parsed = await this.openai.parseIntent(text || "chat", traceId);
          return {
            role: call.role,
            tool: call.tool,
            status: "executed",
            output: parsed,
          };
        }
        case "moderation.review": {
          const content =
            typeof call.input.text === "string" &&
            call.input.text.trim().length > 0
              ? call.input.text
              : "";
          const moderation = await this.openai.assistModeration(
            { content: content || "empty" },
            traceId,
          );
          return {
            role: call.role,
            tool: call.tool,
            status: "executed",
            output: moderation,
          };
        }
        case "notification.compose": {
          const intentText =
            typeof call.input.intentText === "string" &&
            call.input.intentText.trim().length > 0
              ? call.input.intentText
              : "You have a new update.";
          const copy = await this.openai.composeNotificationCopy(
            {
              intentText,
              tone: this.readTone(call.input.tone),
              maxLength: this.readIntInRange(
                call.input.maxLength,
                20,
                220,
                160,
              ),
            },
            traceId,
          );
          return {
            role: call.role,
            tool: call.tool,
            status: "executed",
            output: { text: copy },
          };
        }
        case "personalization.retrieve": {
          const maxDocs = this.readIntInRange(call.input.maxDocs, 1, 10, 4);
          const documents = await this.prisma.retrievalDocument.findMany({
            where: { userId },
            orderBy: { createdAt: "desc" },
            take: maxDocs,
            select: {
              id: true,
              docType: true,
              content: true,
              createdAt: true,
            },
          });
          return {
            role: call.role,
            tool: call.tool,
            status: "executed",
            output: documents,
          };
        }
        case "ranking.explain": {
          const candidateUserId =
            typeof call.input.candidateUserId === "string"
              ? call.input.candidateUserId
              : userId;
          const score =
            typeof call.input.score === "number" &&
            Number.isFinite(call.input.score)
              ? call.input.score
              : 0.5;
          const features = this.coerceFeatures(call.input.features);
          const explanation = await this.openai.explainRanking(
            {
              candidateUserId,
              score,
              features,
              blockedByPolicy:
                typeof call.input.blockedByPolicy === "boolean"
                  ? call.input.blockedByPolicy
                  : false,
            },
            traceId,
          );
          return {
            role: call.role,
            tool: call.tool,
            status: "executed",
            output: explanation,
          };
        }
      }
    } catch (error) {
      this.logger.warn(
        JSON.stringify({
          event: "agentic.tool_failed",
          traceId,
          role: call.role,
          tool: call.tool,
          error:
            error instanceof Error ? error.message : "tool_execution_failed",
        }),
      );
      return {
        role: call.role,
        tool: call.tool,
        status: "failed",
        reason:
          error instanceof Error ? error.message : "tool_execution_failed",
      };
    }
  }

  private async runSpecialist(
    specialist: OpenAIAgentRole,
    content: string,
    traceId: string,
    toolResults: ConversationToolResult[],
  ) {
    switch (specialist) {
      case "intent_parser": {
        return this.openai.parseIntent(content, traceId);
      }
      case "moderation_assistant": {
        return this.openai.assistModeration({ content }, traceId);
      }
      case "notification_copy": {
        const text = await this.openai.composeNotificationCopy(
          {
            intentText: content,
            tone: "neutral",
            maxLength: 180,
          },
          traceId,
        );
        return { text };
      }
      case "personalization_interpreter": {
        const docs = toolResults.find(
          (item) =>
            item.status === "executed" &&
            item.tool === "personalization.retrieve" &&
            Array.isArray(item.output),
        )?.output as Array<{ docType?: string }> | undefined;
        return {
          hasContext: Boolean(docs && docs.length > 0),
          docCount: docs?.length ?? 0,
          docTypes: docs?.map((doc) => doc.docType ?? "unknown") ?? [],
        };
      }
      case "ranking_explanation": {
        return this.openai.explainRanking(
          {
            candidateUserId: randomUUID(),
            score: 0.62,
            features: {
              semanticFit: 0.74,
              personalizationBoost: 0.58,
              safetyPenalty: 0,
            },
            blockedByPolicy: false,
          },
          traceId,
        );
      }
      case "manager": {
        return { skipped: true };
      }
    }
  }

  private buildMultimodalContext(input: {
    voiceTranscript?: string;
    attachments?: AgentAttachmentInput[];
  }) {
    const voiceTranscript = this.readString(input.voiceTranscript) ?? "";
    const attachments = (input.attachments ?? [])
      .slice(0, 8)
      .map((attachment) => {
        if (attachment.kind === "image_url") {
          return {
            kind: "image_url" as const,
            url: attachment.url.slice(0, 2048),
            caption: this.readString(attachment.caption) ?? undefined,
          };
        }
        return {
          kind: "file_ref" as const,
          fileId: attachment.fileId.slice(0, 255),
          caption: this.readString(attachment.caption) ?? undefined,
        };
      });

    return {
      voiceTranscript,
      attachments,
    };
  }

  private buildUserContentForTurn(
    rawContent: string,
    ctx: { voiceTranscript: string; attachments: AgentAttachmentInput[] },
  ) {
    const content = rawContent.trim();
    const blocks: string[] = [content];
    if (ctx.voiceTranscript.length > 0) {
      blocks.push(`[Voice transcript]\n${ctx.voiceTranscript}`);
    }
    for (const attachment of ctx.attachments) {
      if (attachment.kind === "image_url") {
        blocks.push(
          `[Attached image${attachment.caption ? `: ${attachment.caption}` : ""}]\nURL: ${attachment.url}`,
        );
      } else {
        blocks.push(
          `[Attached file${attachment.caption ? `: ${attachment.caption}` : ""}]\nfileId: ${attachment.fileId}`,
        );
      }
    }
    return blocks.join("\n\n").slice(0, 8_000);
  }

  private buildThreadSummary(
    messages: Array<{
      role: string;
      content: string;
      metadata?: unknown;
    }>,
  ) {
    return messages
      .reverse()
      .map((message) => {
        const multimodal = this.readThreadMessageMultimodalMetadata(
          message.metadata,
        );
        if (!multimodal) {
          return `[${message.role}] ${message.content}`;
        }
        return `[${message.role}] ${message.content}${multimodal}`;
      })
      .join("\n")
      .slice(0, 8_000);
  }

  private readThreadMessageMultimodalMetadata(metadata: unknown) {
    if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
      return "";
    }
    const multimodal = (metadata as { multimodal?: unknown }).multimodal;
    if (
      !multimodal ||
      typeof multimodal !== "object" ||
      Array.isArray(multimodal)
    ) {
      return "";
    }
    const voiceTranscript = this.readString(
      (multimodal as { voiceTranscript?: unknown }).voiceTranscript,
    );
    const attachments = Array.isArray(
      (multimodal as { attachments?: unknown }).attachments,
    )
      ? ((multimodal as { attachments?: unknown }).attachments as unknown[])
      : [];
    const attachmentSummary = attachments
      .map((attachment) => this.summarizeAttachment(attachment))
      .filter((entry) => entry.length > 0)
      .join(", ");

    const summaryParts = [
      voiceTranscript ? `voice="${voiceTranscript.slice(0, 120)}"` : null,
      attachmentSummary ? `attachments=${attachmentSummary}` : null,
    ].filter((entry): entry is string => Boolean(entry));

    return summaryParts.length > 0
      ? ` [multimodal ${summaryParts.join(" ")}]`
      : "";
  }

  private summarizeAttachment(attachment: unknown) {
    if (
      !attachment ||
      typeof attachment !== "object" ||
      Array.isArray(attachment)
    ) {
      return "";
    }
    const value = attachment as {
      kind?: unknown;
      url?: unknown;
      fileId?: unknown;
      caption?: unknown;
    };
    if (value.kind === "image_url" && typeof value.url === "string") {
      const caption = this.readString(value.caption);
      return caption ? `image:${caption.slice(0, 60)}` : "image";
    }
    if (value.kind === "file_ref" && typeof value.fileId === "string") {
      const caption = this.readString(value.caption);
      return caption ? `file:${caption.slice(0, 60)}` : "file";
    }
    return "";
  }

  private normalizeStreamChunk(value: string) {
    return value.replace(/\s+/g, " ").trim().slice(0, 240);
  }

  private isRiskSensitiveTool(tool: AgentTool) {
    return (
      tool === "intent.parse" ||
      tool === "workflow.write" ||
      tool === "notification.compose"
    );
  }

  private assessRiskGate(input: {
    content: string;
    surface: string;
    context?: string;
  }): ModerationGateResult {
    if (this.moderationService) {
      const assessed = this.moderationService.assessContentRisk({
        content: input.content,
        context: input.context,
        surface: input.surface,
      });
      return {
        decision: assessed.decision,
        score: assessed.score,
        reasons: assessed.reasons,
      };
    }

    const normalized = input.content.toLowerCase();
    const blockedTerms = ["kill yourself", "bomb threat", "terror attack"];
    const reviewTerms = ["weapon meetup", "buy drugs", "illegal deal", "scam"];
    if (blockedTerms.some((term) => normalized.includes(term))) {
      return {
        decision: "blocked",
        score: 1,
        reasons: ["fallback_blocked_term_match"],
      };
    }
    if (reviewTerms.some((term) => normalized.includes(term))) {
      return {
        decision: "review",
        score: 0.65,
        reasons: ["fallback_review_term_match"],
      };
    }
    return {
      decision: "clean",
      score: 0,
      reasons: ["fallback_no_risk_signal"],
    };
  }

  private blockedByRiskResponse(reasons: string[]) {
    return [
      "I can’t continue with that request.",
      "I can still help with a safe social plan if you share a different goal.",
      `Reference: ${reasons[0] ?? "policy_guardrail"}.`,
    ].join(" ");
  }

  private reviewConstrainedResponse(responseText: string) {
    const normalized = responseText.trim();
    if (normalized.length === 0) {
      return "I can help with safe planning details instead. Share timing, mode, and group-size preferences.";
    }
    return `${normalized.slice(0, 500)}\n\nI can continue once the request stays within safety policy.`;
  }

  private async persistRiskAssessment(input: {
    threadId: string;
    userId: string;
    traceId: string;
    phase: "pre_tools" | "pre_send";
    assessedContent: string;
    assessment: ModerationGateResult;
  }) {
    if (input.assessment.decision === "clean") {
      return;
    }
    try {
      const reasonToken = this.normalizeRiskReasonToken(
        input.assessment.reasons[0] ?? "policy_guardrail",
      );
      const reason =
        `agent_${input.phase}_${input.assessment.decision}:${reasonToken}`.slice(
          0,
          240,
        );

      let moderationFlagId: string | null = null;
      if (this.prisma.moderationFlag?.create) {
        const createdFlag = await this.prisma.moderationFlag.create({
          data: {
            entityType: "agent_thread",
            entityId: input.threadId,
            reason,
            status: "open",
          },
          select: {
            id: true,
          },
        });
        moderationFlagId = createdFlag.id;
      }

      if (this.prisma.auditLog?.create) {
        await this.prisma.auditLog.create({
          data: {
            actorUserId: null,
            actorType: "system",
            action: "moderation.agent_risk_assessed",
            entityType: "agent_thread",
            entityId: input.threadId,
            metadata: {
              traceId: input.traceId,
              userId: input.userId,
              phase: input.phase,
              decision: input.assessment.decision,
              score: input.assessment.score,
              reasons: input.assessment.reasons,
              contentExcerpt: this.makeRiskContentExcerpt(
                input.assessedContent,
              ),
              moderationFlagId,
            } as Prisma.InputJsonValue,
          },
        });
      }
    } catch (error) {
      this.logger.warn(
        JSON.stringify({
          event: "moderation.agent_risk_persist_failed",
          traceId: input.traceId,
          phase: input.phase,
          decision: input.assessment.decision,
          error:
            error instanceof Error
              ? error.message
              : "agent_risk_persist_failed",
        }),
      );
    }
  }

  private normalizeRiskReasonToken(value: string) {
    const normalized = value
      .toLowerCase()
      .replace(/[^a-z0-9:_-]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 96);
    return normalized.length > 0 ? normalized : "policy_guardrail";
  }

  private makeRiskContentExcerpt(value: string) {
    return value.replace(/\s+/g, " ").trim().slice(0, 240);
  }

  private coerceFeatures(
    value: unknown,
  ): Record<string, string | number | boolean> {
    if (!value || typeof value !== "object") {
      return { fallback: true };
    }
    return Object.entries(value as Record<string, unknown>).reduce(
      (acc, [key, entry]) => {
        if (
          typeof entry === "string" ||
          typeof entry === "number" ||
          typeof entry === "boolean"
        ) {
          acc[key] = entry;
        }
        return acc;
      },
      {} as Record<string, string | number | boolean>,
    );
  }

  private readIntInRange(
    value: unknown,
    min: number,
    max: number,
    fallback: number,
  ) {
    if (typeof value !== "number" || !Number.isFinite(value)) {
      return fallback;
    }
    const asInt = Math.trunc(value);
    return Math.min(Math.max(asInt, min), max);
  }

  private readTone(value: unknown): "neutral" | "friendly" | "urgent" {
    if (value === "friendly" || value === "urgent") {
      return value;
    }
    return "neutral";
  }

  private async appendOrchestrationStep(
    threadId: string,
    traceId: string,
    stage: string,
    content: string,
    details?: Record<string, unknown>,
  ) {
    await this.agentService.appendWorkflowUpdate(threadId, content, {
      traceId,
      stage,
      details: details ?? {},
    });
  }

  private async streamResponseTokenChunks(
    threadId: string,
    traceId: string,
    responseText: string,
  ) {
    const chunks = this.chunkText(responseText, 120, 24);
    for (const [index, chunk] of chunks.entries()) {
      await this.appendOrchestrationStep(
        threadId,
        traceId,
        "response_token",
        chunk,
        {
          index: index + 1,
          total: chunks.length,
          source: "chunked_fallback",
        },
      );
    }
    return chunks.length;
  }

  private chunkText(text: string, maxChunkLength: number, maxChunks: number) {
    const normalized = text.replace(/\s+/g, " ").trim();
    if (!normalized) {
      return [] as string[];
    }

    const words = normalized.split(" ");
    const chunks: string[] = [];
    let current = "";
    let usedWords = 0;

    for (const word of words) {
      const next = current ? `${current} ${word}` : word;
      if (next.length <= maxChunkLength) {
        current = next;
        usedWords += 1;
      } else if (!current) {
        chunks.push(word.slice(0, maxChunkLength));
        usedWords += 1;
      } else {
        chunks.push(current);
        current =
          word.length <= maxChunkLength ? word : word.slice(0, maxChunkLength);
        usedWords += 1;
      }

      if (chunks.length >= maxChunks) {
        break;
      }
    }

    if (chunks.length < maxChunks && current) {
      chunks.push(current);
    }

    if (usedWords < words.length && chunks.length > 0) {
      const lastIndex = chunks.length - 1;
      const trimmed = chunks[lastIndex].slice(
        0,
        Math.max(1, maxChunkLength - 3),
      );
      chunks[lastIndex] = `${trimmed}...`;
    }

    return chunks.slice(0, maxChunks);
  }

  private readString(value: unknown) {
    if (typeof value !== "string") {
      return null;
    }
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  private readActionType(value: string): AgentActionType | null {
    if ((agentActionTypes as readonly string[]).includes(value)) {
      return value as AgentActionType;
    }
    return null;
  }

  private readRiskLevel(value: unknown): "low" | "medium" | "high" {
    if (value === "medium" || value === "high") {
      return value;
    }
    return "low";
  }

  assertActionAllowedForRole(
    role: OpenAIAgentRole,
    action: AgentActionType,
    riskLevel: "low" | "medium" | "high",
  ) {
    if (requiresHumanApproval({ role, action, riskLevel })) {
      return { allowed: false, reason: "human_approval_required" } as const;
    }
    return { allowed: true } as const;
  }
}
