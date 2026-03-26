import { agentThreadMessagesToTranscript } from "@opensocial/types";
import { useEffect, type MutableRefObject, type SetStateAction } from "react";

import { api } from "../../../lib/api";
import { processOfflineOutbox } from "../../../lib/offline-outbox";
import type { AgentTimelineMessage } from "../../../types";
import type { LocalChatThread } from "../domain/types";

type SetState<T> = (value: SetStateAction<T>) => void;

type UseHomeRecoveryControllerInput = {
  agentThreadId: string | null;
  chatsRef: MutableRefObject<LocalChatThread[]>;
  netOnline: boolean;
  refreshPendingOutboxCount: () => Promise<void>;
  sessionAccessToken: string;
  sessionUserId: string;
  setAgentTimeline: SetState<AgentTimelineMessage[]>;
  setBanner: (
    input: { tone: "error" | "info" | "success"; text: string } | null,
  ) => void;
  skipNetwork: boolean;
  syncChatThread: (
    chatId: string,
    options?: { force?: boolean; quiet?: boolean },
  ) => Promise<boolean>;
};

export function useHomeRecoveryController({
  agentThreadId,
  chatsRef,
  netOnline,
  refreshPendingOutboxCount,
  sessionAccessToken,
  sessionUserId,
  setAgentTimeline,
  setBanner,
  skipNetwork,
  syncChatThread,
}: UseHomeRecoveryControllerInput) {
  useEffect(() => {
    if (skipNetwork || !netOnline) {
      return;
    }

    let cancelled = false;
    void (async () => {
      const result = await processOfflineOutbox({
        userId: sessionUserId,
        accessToken: sessionAccessToken,
      }).catch(() => null);
      if (cancelled || !result) {
        return;
      }
      await refreshPendingOutboxCount().catch(() => {});
      if (result.sentThreadIds.includes(agentThreadId ?? "")) {
        const messages = agentThreadId
          ? await api
              .listAgentThreadMessages(agentThreadId, sessionAccessToken)
              .catch(() => null)
          : null;
        if (messages) {
          setAgentTimeline(agentThreadMessagesToTranscript(messages));
        }
      }
      const knownChatIds = new Set(chatsRef.current.map((thread) => thread.id));
      for (const chatId of result.sentThreadIds) {
        if (!knownChatIds.has(chatId)) {
          continue;
        }
        await syncChatThread(chatId, { quiet: true });
      }
      if (result.processed > 0) {
        setBanner({
          tone: "success",
          text:
            result.remaining > 0
              ? `Synced ${result.processed} queued action${result.processed === 1 ? "" : "s"}. ${result.remaining} still waiting.`
              : `Synced ${result.processed} queued action${result.processed === 1 ? "" : "s"}.`,
        });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    agentThreadId,
    chatsRef,
    netOnline,
    refreshPendingOutboxCount,
    sessionAccessToken,
    sessionUserId,
    setAgentTimeline,
    setBanner,
    skipNetwork,
    syncChatThread,
  ]);

  useEffect(() => {
    if (skipNetwork || !netOnline || !agentThreadId) {
      return;
    }
    let cancelled = false;
    void api
      .listAgentThreadMessages(agentThreadId, sessionAccessToken)
      .then((messages) => {
        if (!cancelled) {
          setAgentTimeline(agentThreadMessagesToTranscript(messages));
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [
    agentThreadId,
    netOnline,
    sessionAccessToken,
    setAgentTimeline,
    skipNetwork,
  ]);
}
