"use client";

import { useCallback } from "react";
import type {
  SavedSearchesSnapshot,
  ScheduledTaskRunsSnapshot,
  ScheduledTasksSnapshot,
} from "./operator-surface-types";

type RequestApi = <T>(
  method: "GET" | "POST" | "PUT" | "PATCH",
  path: string,
  options?: {
    body?: Record<string, unknown>;
    query?: Record<string, string | number | boolean | undefined>;
    headers?: Record<string, string>;
  },
) => Promise<T>;

type RunAction = <T>(
  key: string,
  operation: () => Promise<T>,
  successText: string | ((payload: T) => string),
  onSuccess?: (payload: T) => void,
) => Promise<T | null>;

type BannerSetter = (
  value: { tone: "info" | "error" | "success"; text: string } | null,
) => void;

export function useEntityInspectorActions(input: {
  requestApi: RequestApi;
  runAction: RunAction;
  setBanner: BannerSetter;
  userId: string;
  intentId: string;
  chatId: string;
  threadId: string;
  revokeSessionId: string;
  actingUserId: string;
  messageId: string;
  moderatorUserId: string;
  hideReason: string;
  syncAfter: string;
  groupSizeTarget: number;
  searchQuery: string;
  setProfileSnapshot: (value: unknown) => void;
  setTrustSnapshot: (value: unknown) => void;
  setRuleSnapshot: (value: unknown) => void;
  setInterestSnapshot: (value: unknown) => void;
  setTopicSnapshot: (value: unknown) => void;
  setAvailabilitySnapshot: (value: unknown) => void;
  setPhotoSnapshot: (value: unknown) => void;
  setSessionSnapshot: (value: unknown) => void;
  setInboxSnapshot: (value: unknown) => void;
  setRecurringCircleSnapshot: (value: unknown) => void;
  setRecurringCircleSessionSnapshot: (value: unknown) => void;
  setSavedSearchSnapshot: (value: SavedSearchesSnapshot | null) => void;
  setScheduledTaskSnapshot: (value: ScheduledTasksSnapshot | null) => void;
  setScheduledTaskRunsSnapshot: (
    value: ScheduledTaskRunsSnapshot | null,
  ) => void;
  setDiscoveryPassiveSnapshot: (value: unknown) => void;
  setDiscoveryInboxSnapshot: (value: unknown) => void;
  setPendingIntentSummarySnapshot: (value: unknown) => void;
  setContinuityIntentExplainSnapshot: (value: unknown) => void;
  setIntentActionSnapshot: (value: unknown) => void;
  setSearchSnapshot: (value: unknown) => void;
  setIntentExplainSnapshot: (value: unknown) => void;
  setIntentUserExplainSnapshot: (value: unknown) => void;
  setChatMessagesSnapshot: (value: unknown) => void;
  setChatMetadataSnapshot: (value: unknown) => void;
  setChatSyncSnapshot: (value: unknown) => void;
  setRelayCount: (value: number) => void;
}) {
  const inspectUser = useCallback(
    () =>
      input.runAction(
        "Inspect user",
        async () => {
          const id = input.userId.trim();
          const [
            profile,
            trust,
            rules,
            interests,
            topics,
            windows,
            photos,
            sessions,
            inbox,
            circles,
            savedSearches,
            scheduledTasks,
            discoveryPassive,
            discoveryInbox,
            pendingIntentSummary,
          ] = await Promise.all([
            input.requestApi("GET", `/profiles/${id}`),
            input.requestApi("GET", `/profiles/${id}/trust`),
            input.requestApi("GET", `/personalization/${id}/rules/global`),
            input.requestApi("GET", `/profiles/${id}/interests`),
            input.requestApi("GET", `/profiles/${id}/topics`),
            input.requestApi("GET", `/profiles/${id}/availability-windows`),
            input.requestApi("GET", `/profiles/${id}/photos`),
            input.requestApi("GET", `/auth/sessions/${id}`),
            input.requestApi("GET", `/inbox/requests/${id}`),
            input.requestApi("GET", `/recurring-circles/${id}`),
            input.requestApi("GET", `/saved-searches/${id}`),
            input.requestApi("GET", `/scheduled-tasks/${id}`, {
              query: { limit: 20 },
            }),
            input.requestApi("GET", `/discovery/${id}/passive`, {
              query: { limit: 3 },
            }),
            input.requestApi("GET", `/discovery/${id}/inbox-suggestions`, {
              query: { limit: 4 },
            }),
            input.requestApi("POST", "/intents/summarize-pending", {
              body: {
                userId: id,
                maxIntents: 5,
              },
            }),
          ]);
          const firstCircleId = Array.isArray(circles)
            ? (circles[0] as { id?: string } | undefined)?.id
            : undefined;
          const circleSessions = firstCircleId
            ? await input.requestApi(
                "GET",
                `/recurring-circles/${firstCircleId}/sessions`,
              )
            : [];
          const firstTaskId = Array.isArray(scheduledTasks)
            ? (scheduledTasks[0] as { id?: string } | undefined)?.id
            : undefined;
          const scheduledTaskRuns = firstTaskId
            ? await input.requestApi(
                "GET",
                `/scheduled-tasks/${firstTaskId}/runs`,
                {
                  query: { limit: 10 },
                },
              )
            : [];
          const firstIntentId =
            typeof pendingIntentSummary === "object" &&
            pendingIntentSummary !== null &&
            "intents" in pendingIntentSummary &&
            Array.isArray(
              (pendingIntentSummary as { intents?: unknown[] }).intents,
            )
              ? ((
                  pendingIntentSummary as {
                    intents?: Array<{ intentId?: string }>;
                  }
                ).intents?.[0]?.intentId ?? null)
              : null;
          const continuityUserExplain = firstIntentId
            ? await input
                .requestApi(
                  "GET",
                  `/intents/${firstIntentId}/explanations/user`,
                )
                .catch(() => null)
            : null;

          return {
            profile,
            trust,
            rules,
            interests,
            topics,
            windows,
            photos,
            sessions,
            inbox,
            circles,
            circleSessions,
            savedSearches,
            scheduledTasks,
            scheduledTaskRuns,
            discoveryPassive,
            discoveryInbox,
            pendingIntentSummary,
            continuityUserExplain,
          };
        },
        "User snapshots loaded.",
        (payload) => {
          input.setProfileSnapshot(payload.profile);
          input.setTrustSnapshot(payload.trust);
          input.setRuleSnapshot(payload.rules);
          input.setInterestSnapshot(payload.interests);
          input.setTopicSnapshot(payload.topics);
          input.setAvailabilitySnapshot(payload.windows);
          input.setPhotoSnapshot(payload.photos);
          input.setSessionSnapshot(payload.sessions);
          input.setInboxSnapshot(payload.inbox);
          input.setRecurringCircleSnapshot(payload.circles);
          input.setRecurringCircleSessionSnapshot(payload.circleSessions);
          input.setSavedSearchSnapshot(
            payload.savedSearches as SavedSearchesSnapshot,
          );
          input.setScheduledTaskSnapshot(
            payload.scheduledTasks as ScheduledTasksSnapshot,
          );
          input.setScheduledTaskRunsSnapshot(
            payload.scheduledTaskRuns as ScheduledTaskRunsSnapshot,
          );
          input.setDiscoveryPassiveSnapshot(payload.discoveryPassive);
          input.setDiscoveryInboxSnapshot(payload.discoveryInbox);
          input.setPendingIntentSummarySnapshot(payload.pendingIntentSummary);
          input.setContinuityIntentExplainSnapshot(
            payload.continuityUserExplain,
          );
        },
      ),
    [input],
  );

  const sendDigest = useCallback(
    () =>
      input.runAction(
        "Send digest",
        () =>
          input.requestApi(
            "POST",
            `/notifications/${input.userId.trim()}/digest`,
            {
              body: {},
            },
          ),
        "Digest request submitted.",
      ),
    [input],
  );

  const summarizePendingIntents = useCallback(
    () =>
      input.runAction(
        "Summarize pending intents",
        () =>
          input.requestApi("POST", "/intents/summarize-pending", {
            body: {
              userId: input.userId.trim(),
            },
          }),
        "Pending intent summary generated.",
        (payload) => input.setIntentActionSnapshot(payload),
      ),
    [input],
  );

  const runSearch = useCallback(
    () =>
      input.runAction(
        "Run search",
        () =>
          input.requestApi("GET", `/search/${input.userId.trim()}`, {
            query: {
              q: input.searchQuery.trim(),
              limit: 6,
            },
          }),
        "Search snapshot loaded.",
        (payload) => input.setSearchSnapshot(payload),
      ),
    [input],
  );

  const revokeSession = useCallback(() => {
    if (!input.revokeSessionId.trim()) {
      input.setBanner({
        tone: "error",
        text: "Provide a session id to revoke.",
      });
      return Promise.resolve(null);
    }

    return input.runAction(
      "Revoke session",
      async () => {
        await input.requestApi(
          "POST",
          `/auth/sessions/${input.revokeSessionId.trim()}/revoke`,
          {
            body: {
              userId: input.userId.trim(),
            },
          },
        );
        const sessions = await input.requestApi(
          "GET",
          `/auth/sessions/${input.userId.trim()}`,
        );
        return { sessions };
      },
      "Session revoked and list refreshed.",
      (payload) => input.setSessionSnapshot(payload.sessions),
    );
  }, [input]);

  const revokeAllSessions = useCallback(
    () =>
      input.runAction(
        "Revoke all sessions",
        async () => {
          await input.requestApi("POST", "/auth/sessions/revoke-all", {
            body: {
              userId: input.userId.trim(),
            },
          });
          const sessions = await input.requestApi(
            "GET",
            `/auth/sessions/${input.userId.trim()}`,
          );
          return { sessions };
        },
        "All sessions revoked and list refreshed.",
        (payload) => input.setSessionSnapshot(payload.sessions),
      ),
    [input],
  );

  const inspectIntent = useCallback(() => {
    if (!input.intentId.trim()) {
      input.setBanner({ tone: "error", text: "Provide an intent id." });
      return Promise.resolve(null);
    }

    return input.runAction(
      "Inspect intent",
      async () => {
        const [adminExplain, userExplain] = await Promise.all([
          input.requestApi(
            "GET",
            `/intents/${input.intentId.trim()}/explanations`,
          ),
          input.requestApi(
            "GET",
            `/intents/${input.intentId.trim()}/explanations/user`,
          ),
        ]);

        return { adminExplain, userExplain };
      },
      "Intent explanation snapshots loaded.",
      (payload) => {
        input.setIntentExplainSnapshot(payload.adminExplain);
        input.setIntentUserExplainSnapshot(payload.userExplain);
      },
    );
  }, [input]);

  const cancelIntent = useCallback(() => {
    if (!input.intentId.trim()) {
      input.setBanner({ tone: "error", text: "Provide an intent id." });
      return Promise.resolve(null);
    }

    return input.runAction(
      "Cancel intent",
      () =>
        input.requestApi("POST", `/intents/${input.intentId.trim()}/cancel`, {
          body: {
            userId: input.userId.trim(),
            ...(input.threadId.trim()
              ? { agentThreadId: input.threadId.trim() }
              : {}),
          },
        }),
      "Intent cancellation submitted.",
      (payload) => input.setIntentActionSnapshot(payload),
    );
  }, [input]);

  const retryIntent = useCallback(() => {
    if (!input.intentId.trim()) {
      input.setBanner({ tone: "error", text: "Provide an intent id." });
      return Promise.resolve(null);
    }

    return input.runAction(
      "Retry intent",
      () =>
        input.requestApi("POST", `/intents/${input.intentId.trim()}/retry`, {
          body: {
            ...(input.threadId.trim()
              ? { agentThreadId: input.threadId.trim() }
              : {}),
          },
        }),
      "Intent retry job submitted.",
      (payload) => input.setIntentActionSnapshot(payload),
    );
  }, [input]);

  const widenIntent = useCallback(() => {
    if (!input.intentId.trim()) {
      input.setBanner({ tone: "error", text: "Provide an intent id." });
      return Promise.resolve(null);
    }

    return input.runAction(
      "Widen intent",
      () =>
        input.requestApi("POST", `/intents/${input.intentId.trim()}/widen`, {
          body: {
            ...(input.threadId.trim()
              ? { agentThreadId: input.threadId.trim() }
              : {}),
          },
        }),
      "Intent widen job submitted.",
      (payload) => input.setIntentActionSnapshot(payload),
    );
  }, [input]);

  const convertIntent = useCallback(
    (mode: "group" | "one_to_one") => {
      if (!input.intentId.trim()) {
        input.setBanner({ tone: "error", text: "Provide an intent id." });
        return Promise.resolve(null);
      }

      return input.runAction(
        `Convert intent to ${mode}`,
        () =>
          input.requestApi(
            "POST",
            `/intents/${input.intentId.trim()}/convert`,
            {
              body:
                mode === "group"
                  ? {
                      mode,
                      groupSizeTarget: input.groupSizeTarget,
                    }
                  : {
                      mode,
                    },
            },
          ),
        `Intent converted to ${mode}.`,
        (payload) => input.setIntentActionSnapshot(payload),
      );
    },
    [input],
  );

  const inspectChat = useCallback(() => {
    if (!input.chatId.trim()) {
      input.setBanner({ tone: "error", text: "Provide a chat id." });
      return Promise.resolve(null);
    }

    return input.runAction(
      "Inspect chat",
      async () => {
        const [messages, metadata] = await Promise.all([
          input.requestApi("GET", `/chats/${input.chatId.trim()}/messages`),
          input.requestApi("GET", `/chats/${input.chatId.trim()}/metadata`),
        ]);
        return { messages, metadata };
      },
      "Chat messages and metadata loaded.",
      (payload) => {
        input.setChatMessagesSnapshot(payload.messages);
        input.setChatMetadataSnapshot(payload.metadata);
      },
    );
  }, [input]);

  const syncChat = useCallback(() => {
    if (!input.chatId.trim()) {
      input.setBanner({ tone: "error", text: "Provide a chat id." });
      return Promise.resolve(null);
    }

    return input.runAction(
      "Sync chat",
      () =>
        input.requestApi("GET", `/chats/${input.chatId.trim()}/sync`, {
          query: {
            userId: input.actingUserId.trim(),
            ...(input.syncAfter.trim()
              ? { after: input.syncAfter.trim() }
              : {}),
          },
        }),
      "Chat sync snapshot loaded.",
      (payload) => input.setChatSyncSnapshot(payload),
    );
  }, [input]);

  const leaveChat = useCallback(() => {
    if (!input.chatId.trim()) {
      input.setBanner({ tone: "error", text: "Provide a chat id." });
      return Promise.resolve(null);
    }

    return input.runAction(
      "Leave chat",
      () =>
        input.requestApi("POST", `/chats/${input.chatId.trim()}/leave`, {
          body: {
            userId: input.actingUserId.trim(),
          },
        }),
      "Leave chat action completed.",
      (payload) => input.setChatMetadataSnapshot(payload),
    );
  }, [input]);

  const hideChatMessage = useCallback(() => {
    if (!input.chatId.trim() || !input.messageId.trim()) {
      input.setBanner({
        tone: "error",
        text: "Provide both chat id and message id.",
      });
      return Promise.resolve(null);
    }

    return input.runAction(
      "Hide chat message",
      () =>
        input.requestApi(
          "POST",
          `/chats/${input.chatId.trim()}/messages/${input.messageId.trim()}/hide`,
          {
            body: {
              moderatorUserId: input.moderatorUserId.trim(),
              ...(input.hideReason.trim()
                ? { reason: input.hideReason.trim() }
                : {}),
            },
          },
        ),
      "Message hidden by moderation.",
      (payload) => input.setChatMessagesSnapshot(payload),
    );
  }, [input]);

  const repairChatFlow = useCallback(() => {
    if (!input.chatId.trim()) {
      input.setBanner({ tone: "error", text: "Provide a chat id." });
      return Promise.resolve(null);
    }

    return input.runAction(
      "Repair chat flow",
      async () => {
        const [metadata, syncSnapshot, relay] = await Promise.all([
          input.requestApi("GET", `/chats/${input.chatId.trim()}/metadata`),
          input.requestApi("GET", `/chats/${input.chatId.trim()}/sync`, {
            query: {
              userId: input.actingUserId.trim(),
            },
          }),
          input.requestApi<{ processedCount: number }>(
            "POST",
            "/admin/outbox/relay",
            {
              body: {},
            },
          ),
        ]);

        return {
          metadata,
          syncSnapshot,
          relay,
        };
      },
      (payload) =>
        `Repair routine complete. Outbox processed ${payload.relay.processedCount} event(s).`,
      (payload) => {
        input.setChatMetadataSnapshot(payload.metadata);
        input.setChatSyncSnapshot(payload.syncSnapshot);
        input.setRelayCount(payload.relay.processedCount);
      },
    );
  }, [input]);

  return {
    inspectUser,
    sendDigest,
    summarizePendingIntents,
    runSearch,
    revokeSession,
    revokeAllSessions,
    inspectIntent,
    cancelIntent,
    retryIntent,
    widenIntent,
    convertIntent,
    inspectChat,
    syncChat,
    leaveChat,
    hideChatMessage,
    repairChatFlow,
  };
}
