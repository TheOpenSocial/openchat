import { agentThreadMessagesToTranscript } from "@opensocial/types";
import { useEffect, useRef, useState } from "react";

import { api } from "./api";
import type { AgentTimelineMessage } from "../types";

type UsePrimaryAgentThreadOptions = {
  enabled: boolean;
  accessToken: string;
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
  onHydrated,
  onLoadError,
}: UsePrimaryAgentThreadOptions): {
  threadId: string | null;
  loading: boolean;
} {
  const [threadId, setThreadId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
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
        const summary = await api.getMyAgentThreadSummary(accessToken);
        if (cancelled) {
          return;
        }
        if (!summary) {
          setThreadId(null);
          return;
        }
        setThreadId(summary.id);
        const messages = await api.listAgentThreadMessages(
          summary.id,
          accessToken,
        );
        if (cancelled) {
          return;
        }
        if (messages.length > 0) {
          onHydratedRef.current(agentThreadMessagesToTranscript(messages));
        }
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
  }, [accessToken, enabled]);

  return { loading, threadId };
}
