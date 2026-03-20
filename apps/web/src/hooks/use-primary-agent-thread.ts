"use client";

import {
  agentThreadMessagesToTranscript,
  type AgentTranscriptRow,
} from "@opensocial/types";
import { useEffect, useRef, useState } from "react";

import { api } from "../lib/api";

type Options = {
  enabled: boolean;
  accessToken: string;
  onHydrated: (rows: AgentTranscriptRow[]) => void;
  onLoadError: () => void;
};

/**
 * Loads the signed-in user’s primary agent thread and optional transcript.
 * Callbacks are stored in refs so parents need not wrap them in `useCallback`.
 */
export function usePrimaryAgentThread({
  accessToken,
  enabled,
  onHydrated,
  onLoadError,
}: Options): { threadId: string | null; loading: boolean } {
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
