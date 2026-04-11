import { agentThreadMessagesToTranscript } from "@opensocial/types";
import { useEffect, useRef, useState } from "react";

import { ApiRequestError, api } from "./api";
import type { AgentTimelineMessage } from "../types";

export type PrimaryAgentThreadLoadError = {
  code: string | null;
  message: string;
  offline: boolean;
  statusCode: number | null;
  transient: boolean;
};

type UsePrimaryAgentThreadOptions = {
  enabled: boolean;
  accessToken: string;
  onHydrated: (messages: AgentTimelineMessage[]) => void;
  onLoadError: (error: PrimaryAgentThreadLoadError) => void;
};

function normalizePrimaryAgentThreadLoadError(
  error: unknown,
): PrimaryAgentThreadLoadError {
  if (error instanceof ApiRequestError) {
    return {
      code: error.code,
      message: error.message,
      offline: error.offline,
      statusCode: error.statusCode,
      transient: error.transient,
    };
  }

  if (error instanceof Error) {
    return {
      code: null,
      message: error.message,
      offline: false,
      statusCode: null,
      transient: false,
    };
  }

  return {
    code: null,
    message: "Unknown thread load failure.",
    offline: false,
    statusCode: null,
    transient: false,
  };
}

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
        onHydratedRef.current(agentThreadMessagesToTranscript(messages));
      } catch (error) {
        if (!cancelled) {
          onLoadErrorRef.current(normalizePrimaryAgentThreadLoadError(error));
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
  }, [accessToken, enabled, reloadNonce]);

  return {
    loading,
    reload: () => {
      setReloadNonce((current) => current + 1);
    },
    threadId,
  };
}
