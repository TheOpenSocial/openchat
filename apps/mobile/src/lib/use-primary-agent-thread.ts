import { agentThreadMessagesToTranscript } from "@opensocial/types";
import { useEffect, useRef, useState } from "react";

import { api } from "./api";
import type { AgentTimelineMessage } from "../types";

type UsePrimaryAgentThreadOptions = {
  enabled: boolean;
  accessToken: string;
  preferredThreadId?: string | null;
  onHydrated: (messages: AgentTimelineMessage[]) => void;
  onLoadError: () => void;
};

/**
 * Loads the authenticated user’s primary agent thread id and optional initial transcript.
 * Callbacks are read from refs so callers are not forced to memoize them (avoids refetch loops).
 */
export function usePrimaryAgentThread({
  accessToken,
  enabled,
  preferredThreadId = null,
  onHydrated,
  onLoadError,
}: UsePrimaryAgentThreadOptions): {
  threadId: string | null;
  loading: boolean;
  reload: () => void;
} {
  const [threadId, setThreadId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [reloadNonce, setReloadNonce] = useState(0);
  const onHydratedRef = useRef(onHydrated);
  const onLoadErrorRef = useRef(onLoadError);
  onHydratedRef.current = onHydrated;
  onLoadErrorRef.current = onLoadError;

  useEffect(() => {
    if (!enabled) {
      setThreadId(null);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);

    void (async () => {
      try {
        const effectiveThreadId =
          preferredThreadId ??
          (await api.getMyAgentThreadSummary(accessToken))?.id ??
          null;
        if (cancelled) {
          return;
        }
        if (!effectiveThreadId) {
          setThreadId(null);
          return;
        }
        setThreadId(effectiveThreadId);
        const messages = await api.listAgentThreadMessages(
          effectiveThreadId,
          accessToken,
        );
        if (cancelled) {
          return;
        }
        onHydratedRef.current(agentThreadMessagesToTranscript(messages));
      } catch {
        if (!cancelled) {
          onLoadErrorRef.current();
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [accessToken, enabled, preferredThreadId, reloadNonce]);

  return {
    loading,
    threadId,
    reload: () => {
      setReloadNonce((current) => current + 1);
    },
  };
}
