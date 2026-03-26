import {
  agentThreadMessagesToTranscript,
  extractResponseTokenDelta,
} from "@opensocial/types";
import {
  useCallback,
  useRef,
  type MutableRefObject,
  type SetStateAction,
} from "react";

import {
  api,
  buildAgentThreadStreamUrl,
  isOfflineApiError,
  isRetryableApiError,
} from "../../../lib/api";
import { openAgentThreadSse } from "../../../lib/agent-thread-sse";
import { hapticImpact } from "../../../lib/haptics";
import { queueOfflineComposerSend } from "../../../lib/offline-outbox";
import type { TelemetryEventName } from "../../../lib/telemetry";
import type { AgentTimelineMessage } from "../../../types";
import { t, type AppLocale } from "../../../i18n/strings";
import { sleep } from "../domain/chat-utils";

export type IntentSendOutcome = "sent" | "queued" | "failed" | "aborted";

type SetState<T> = (value: SetStateAction<T>) => void;

type UseAgentIntentControllerInput = {
  agentComposerMode: "chat" | "intent";
  agentImageUrlDraft: string;
  agentThreadId: string | null;
  agentVoiceTranscriptRef: MutableRefObject<string | null>;
  decomposeIntent: boolean;
  decomposeMaxIntents: number;
  draftIntentText: string;
  locale: AppLocale;
  netOnline: boolean;
  onInitialAgentMessageConsumed?: () => void;
  onboardingCarryoverIdempotencyKey: string | null;
  onboardingCarryoverSeed: string;
  sendingIntent: boolean;
  sessionAccessToken: string;
  sessionUserId: string;
  setAgentImageUrlDraft: (value: string) => void;
  setAgentTimeline: SetState<AgentTimelineMessage[]>;
  setBanner: (
    input: { tone: "info" | "error" | "success"; text: string } | null,
  ) => void;
  setDraftIntentText: (value: string) => void;
  setOnboardingCarryoverIdempotencyKey: (value: string | null) => void;
  setOnboardingCarryoverSeed: (value: string) => void;
  setOnboardingCarryoverState: (
    value: "processing" | "queued" | "ready" | null,
  ) => void;
  setSendingIntent: SetState<boolean>;
  skipNetwork: boolean;
  userBuildOnboardingKey: (userId: string, seed: string) => string;
  trackTelemetry: (
    name: TelemetryEventName,
    properties?: Record<string, unknown>,
  ) => void;
  refreshPendingOutboxCount: () => Promise<void>;
};

function parseOptionalImageAttachmentUrl(raw: string) {
  const trimmed = raw.trim();
  if (!trimmed) {
    return undefined;
  }
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return undefined;
    }
    return [{ kind: "image_url" as const, url: trimmed }];
  } catch {
    return undefined;
  }
}

export function useAgentIntentController({
  agentComposerMode,
  agentImageUrlDraft,
  agentThreadId,
  agentVoiceTranscriptRef,
  decomposeIntent,
  decomposeMaxIntents,
  draftIntentText,
  locale,
  netOnline,
  onInitialAgentMessageConsumed,
  onboardingCarryoverIdempotencyKey,
  onboardingCarryoverSeed,
  refreshPendingOutboxCount,
  sendingIntent,
  sessionAccessToken,
  sessionUserId,
  setAgentImageUrlDraft,
  setAgentTimeline,
  setBanner,
  setDraftIntentText,
  setOnboardingCarryoverIdempotencyKey,
  setOnboardingCarryoverSeed,
  setOnboardingCarryoverState,
  setSendingIntent,
  skipNetwork,
  trackTelemetry,
  userBuildOnboardingKey,
}: UseAgentIntentControllerInput) {
  const intentAbortRef = useRef<AbortController | null>(null);
  const trackedRequestSentIntentsRef = useRef<Set<string>>(new Set());

  const trackRequestSentForIntent = useCallback(
    async (intentId: string) => {
      if (trackedRequestSentIntentsRef.current.has(intentId)) {
        return;
      }
      for (let attempt = 0; attempt < 4; attempt += 1) {
        try {
          const summary = await api.summarizePendingIntents(
            sessionUserId,
            8,
            sessionAccessToken,
          );
          const matchedIntent = summary.intents.find(
            (intent) => intent.intentId === intentId,
          );
          if (!matchedIntent) {
            return;
          }

          const requestCount =
            matchedIntent.requests.pending +
            matchedIntent.requests.accepted +
            matchedIntent.requests.rejected +
            matchedIntent.requests.expired +
            matchedIntent.requests.cancelled;

          if (requestCount > 0) {
            trackedRequestSentIntentsRef.current.add(intentId);
            trackTelemetry("request_sent", {
              intentId,
              requestCount,
              pending: matchedIntent.requests.pending,
              accepted: matchedIntent.requests.accepted,
              rejected: matchedIntent.requests.rejected,
              expired: matchedIntent.requests.expired,
              cancelled: matchedIntent.requests.cancelled,
              attempt: attempt + 1,
            });
            return;
          }
        } catch {
          // Best effort.
        }

        await sleep(2_000 * (attempt + 1));
      }
    },
    [sessionAccessToken, sessionUserId, trackTelemetry],
  );

  const sendIntent = useCallback(
    async (
      messageOverride?: string,
      options?: {
        idempotencyKey?: string;
        onOutcome?: (outcome: IntentSendOutcome) => void;
      },
    ) => {
      const rawText = (messageOverride ?? draftIntentText).trim();
      if (!rawText || sendingIntent) {
        return;
      }

      const imageExtras = parseOptionalImageAttachmentUrl(agentImageUrlDraft);
      setSendingIntent(true);
      if (messageOverride == null) {
        setDraftIntentText("");
        setAgentImageUrlDraft("");
      }
      const timelineIdBase = Date.now().toString(36);
      const requestIdempotencyKey =
        options?.idempotencyKey ??
        `composer-send:${sessionUserId}:${timelineIdBase}`;
      const workflowMessageId = `workflow_${timelineIdBase}`;
      const useAgentChat =
        agentComposerMode === "chat" && Boolean(agentThreadId);
      const useIntentAgentEndpoint =
        agentComposerMode === "intent" && Boolean(agentThreadId);
      const workflowBody = useAgentChat
        ? t("agentWorkflowThinking", locale)
        : t("agentWorkflowRouting", locale);

      setAgentTimeline((current) => [
        ...current,
        {
          id: `user_${timelineIdBase}`,
          role: "user",
          body: rawText,
        },
        {
          id: workflowMessageId,
          role: "workflow",
          body: workflowBody,
        },
        ...(useAgentChat
          ? [
              {
                id: `agent_stream_${timelineIdBase}`,
                role: "agent" as const,
                body: "",
              },
            ]
          : []),
      ]);

      if (!skipNetwork && !netOnline) {
        await queueOfflineComposerSend({
          userId: sessionUserId,
          mode: agentComposerMode,
          threadId: agentThreadId ?? null,
          text: rawText,
          idempotencyKey: requestIdempotencyKey,
          ...(agentVoiceTranscriptRef.current?.trim()
            ? { voiceTranscript: agentVoiceTranscriptRef.current.trim() }
            : {}),
          ...(imageExtras?.length ? { attachments: imageExtras } : {}),
          ...(agentComposerMode === "intent"
            ? {
                allowDecomposition: decomposeIntent,
                maxIntents: decomposeMaxIntents,
              }
            : {}),
        });
        agentVoiceTranscriptRef.current = null;
        await refreshPendingOutboxCount().catch(() => {});
        setAgentTimeline((current) => [
          ...current,
          {
            id: `agent_queue_${timelineIdBase}`,
            role: "agent",
            body: "Queued offline. I’ll send this as soon as you’re back online.",
          },
        ]);
        setBanner({
          tone: "info",
          text: "Queued offline. We’ll send it automatically when internet returns.",
        });
        setSendingIntent(false);
        options?.onOutcome?.("queued");
        return;
      }

      try {
        const controller = new AbortController();
        intentAbortRef.current = controller;

        if (useAgentChat && agentThreadId) {
          const streamingId = `agent_stream_${timelineIdBase}`;
          const traceId =
            globalThis.crypto?.randomUUID?.() ??
            `trace-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
          const voiceLine = agentVoiceTranscriptRef.current?.trim();

          const sse = openAgentThreadSse(
            buildAgentThreadStreamUrl(agentThreadId, sessionAccessToken),
            (msg) => {
              const delta = extractResponseTokenDelta(msg, traceId);
              if (delta === null) {
                return;
              }
              setAgentTimeline((current) =>
                current.map((row) =>
                  row.id === streamingId
                    ? { ...row, body: row.body + delta }
                    : row,
                ),
              );
            },
          );

          try {
            await api.agentThreadRespondStream(
              agentThreadId,
              sessionUserId,
              rawText,
              sessionAccessToken,
              {
                signal: controller.signal,
                traceId,
                idempotencyKey: requestIdempotencyKey,
                ...(voiceLine ? { voiceTranscript: voiceLine } : {}),
                ...(imageExtras?.length ? { attachments: imageExtras } : {}),
              },
            );
          } finally {
            sse.close();
          }
          agentVoiceTranscriptRef.current = null;
          const messages = await api.listAgentThreadMessages(
            agentThreadId,
            sessionAccessToken,
          );
          setAgentTimeline(agentThreadMessagesToTranscript(messages));
          intentAbortRef.current = null;
          hapticImpact();
          trackTelemetry("agent_turn_completed", {
            textLength: rawText.length,
          });
          options?.onOutcome?.("sent");
          return;
        }

        if (useIntentAgentEndpoint && agentThreadId) {
          const intentResult = await api.createIntentFromAgentMessage(
            agentThreadId,
            sessionUserId,
            rawText,
            sessionAccessToken,
            {
              allowDecomposition: decomposeIntent,
              maxIntents: decomposeMaxIntents,
              idempotencyKey: requestIdempotencyKey,
            },
          );
          const primaryIntentId =
            intentResult.intentIds[0] ?? intentResult.intentId;
          setAgentTimeline((current) => [
            ...current,
            {
              id: `agent_${timelineIdBase}`,
              role: "agent",
              body:
                intentResult.intentCount > 1
                  ? `All right. I split this into ${intentResult.intentCount} focused asks and started in the background. I’ll notify you as soon as I find strong matches (${primaryIntentId.slice(0, 8)}).`
                  : `All right. I’m on it in the background, and I’ll notify you as soon as I find someone relevant (${primaryIntentId.slice(0, 8)}).`,
            },
          ]);
          trackTelemetry("intent_created", {
            intentId: primaryIntentId,
            textLength: rawText.length,
            decomposed: intentResult.intentCount > 1,
            intentCount: intentResult.intentCount,
          });
          if (primaryIntentId) {
            void trackRequestSentForIntent(primaryIntentId);
          }
          hapticImpact();
          options?.onOutcome?.("sent");
          return;
        }

        const intent = await api.createIntent(
          sessionUserId,
          rawText,
          sessionAccessToken,
          {
            signal: controller.signal,
            agentThreadId: agentThreadId ?? undefined,
            idempotencyKey: requestIdempotencyKey,
          },
        );

        intentAbortRef.current = null;
        hapticImpact();

        setAgentTimeline((current) => [
          ...current,
          {
            id: `agent_${timelineIdBase}`,
            role: "agent",
            body: `All right. I’m on it in the background, and I’ll notify you as soon as I find someone relevant (${String(intent.id ?? "new")}).`,
          },
        ]);
        const intentId = typeof intent.id === "string" ? intent.id : null;
        trackTelemetry("intent_created", {
          intentId: intentId ?? "",
          textLength: rawText.length,
        });
        if (intentId) {
          void trackRequestSentForIntent(intentId);
        }
        options?.onOutcome?.("sent");
      } catch (error) {
        const aborted = error instanceof Error && error.name === "AbortError";
        if (aborted) {
          setAgentTimeline((current) =>
            current
              .filter((message) => message.id !== workflowMessageId)
              .concat({
                id: `workflow_stop_${timelineIdBase}`,
                role: "workflow",
                body: "Stopped.",
              }),
          );
          options?.onOutcome?.("aborted");
          return;
        }

        if (isOfflineApiError(error) || isRetryableApiError(error)) {
          await queueOfflineComposerSend({
            userId: sessionUserId,
            mode: agentComposerMode,
            threadId: agentThreadId ?? null,
            text: rawText,
            idempotencyKey: requestIdempotencyKey,
            ...(agentVoiceTranscriptRef.current?.trim()
              ? { voiceTranscript: agentVoiceTranscriptRef.current.trim() }
              : {}),
            ...(imageExtras?.length ? { attachments: imageExtras } : {}),
            ...(agentComposerMode === "intent"
              ? {
                  allowDecomposition: decomposeIntent,
                  maxIntents: decomposeMaxIntents,
                }
              : {}),
          });
          agentVoiceTranscriptRef.current = null;
          await refreshPendingOutboxCount().catch(() => {});
          setAgentTimeline((current) => [
            ...current,
            {
              id: `agent_queue_${timelineIdBase}`,
              role: "agent",
              body: "Network dropped, so I queued this and will retry automatically.",
            },
          ]);
          setBanner({
            tone: "info",
            text: "Network issue detected. Your message is queued and will retry automatically.",
          });
          options?.onOutcome?.("queued");
          return;
        }

        setAgentTimeline((current) => [
          ...current,
          {
            id: `agent_error_${timelineIdBase}`,
            role: "error",
            body: `I could not submit that intent right now. ${String(error)}`,
          },
        ]);
        options?.onOutcome?.("failed");
      } finally {
        intentAbortRef.current = null;
        setSendingIntent(false);
      }
    },
    [
      agentComposerMode,
      agentImageUrlDraft,
      agentThreadId,
      agentVoiceTranscriptRef,
      decomposeIntent,
      decomposeMaxIntents,
      draftIntentText,
      locale,
      netOnline,
      refreshPendingOutboxCount,
      sendingIntent,
      sessionAccessToken,
      sessionUserId,
      setAgentImageUrlDraft,
      setAgentTimeline,
      setBanner,
      setDraftIntentText,
      setSendingIntent,
      skipNetwork,
      trackRequestSentForIntent,
      trackTelemetry,
    ],
  );

  const executeOnboardingCarryover = useCallback(async () => {
    const seed = onboardingCarryoverSeed.trim();
    const idempotencyKey =
      onboardingCarryoverIdempotencyKey ??
      userBuildOnboardingKey(sessionUserId, seed);
    if (!seed || sendingIntent) {
      return;
    }

    const startedAt = Date.now();
    trackTelemetry("onboarding_activation_started", {
      source: "home_carryover",
      seedLength: seed.length,
    });

    setOnboardingCarryoverState("processing");
    await sendIntent(seed, {
      idempotencyKey,
      onOutcome: (outcome) => {
        const elapsedMs = Math.max(0, Date.now() - startedAt);
        if (outcome === "sent") {
          trackTelemetry("onboarding_activation_succeeded", {
            source: "home_carryover",
            elapsedMs,
          });
          setOnboardingCarryoverSeed("");
          setOnboardingCarryoverIdempotencyKey(null);
          setOnboardingCarryoverState(null);
          onInitialAgentMessageConsumed?.();
          return;
        }
        if (outcome === "queued") {
          trackTelemetry("onboarding_activation_queued", {
            source: "home_carryover",
            elapsedMs,
          });
          setOnboardingCarryoverState("queued");
          onInitialAgentMessageConsumed?.();
          return;
        }
        if (outcome === "aborted") {
          trackTelemetry("onboarding_activation_failed", {
            source: "home_carryover",
            reason: "aborted",
            elapsedMs,
          });
          setOnboardingCarryoverState("ready");
          return;
        }
        trackTelemetry("onboarding_activation_failed", {
          source: "home_carryover",
          reason: "send_failed",
          elapsedMs,
        });
        setOnboardingCarryoverState("ready");
      },
    });
  }, [
    onboardingCarryoverSeed,
    onboardingCarryoverIdempotencyKey,
    userBuildOnboardingKey,
    sessionUserId,
    sendingIntent,
    trackTelemetry,
    setOnboardingCarryoverState,
    sendIntent,
    setOnboardingCarryoverSeed,
    setOnboardingCarryoverIdempotencyKey,
    onInitialAgentMessageConsumed,
  ]);

  const cancelIntentSend = useCallback(() => {
    intentAbortRef.current?.abort();
  }, []);

  return {
    cancelIntentSend,
    executeOnboardingCarryover,
    sendIntent,
  };
}
