"use client";

import { type MutableRefObject } from "react";
import { buildApiUrl } from "../../lib/api";
import { createHistoryId } from "./workbench-utils";

function safeJsonParse(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

const STREAM_EVENT_LIMIT = 60;

export function useAgentStream(input: {
  threadId: string;
  accessToken?: string;
  streamRef: MutableRefObject<EventSource | null>;
  setStreamStatus: (value: "idle" | "connecting" | "live" | "error") => void;
  setStreamEvents: (
    value:
      | Array<{ id: string; at: string; kind: string; payload: unknown }>
      | ((
          current: Array<{
            id: string;
            at: string;
            kind: string;
            payload: unknown;
          }>,
        ) => Array<{ id: string; at: string; kind: string; payload: unknown }>),
  ) => void;
  setBanner: (
    value: { tone: "info" | "error" | "success"; text: string } | null,
  ) => void;
}) {
  const pushStreamEvent = (kind: string, payload: unknown) => {
    input.setStreamEvents((current) =>
      [
        {
          id: createHistoryId(),
          at: new Date().toISOString(),
          kind,
          payload,
        },
        ...current,
      ].slice(0, STREAM_EVENT_LIMIT),
    );
  };

  const stopAgentStream = () => {
    input.streamRef.current?.close();
    input.streamRef.current = null;
    input.setStreamStatus("idle");
  };

  const startAgentStream = () => {
    if (!input.threadId.trim()) {
      input.setBanner({ tone: "error", text: "Provide a thread id." });
      return;
    }

    const streamToken = input.accessToken?.trim();
    if (!streamToken) {
      input.setBanner({
        tone: "error",
        text: "Sign in again to attach an access token for the live stream.",
      });
      return;
    }

    stopAgentStream();
    input.setStreamStatus("connecting");

    const source = new EventSource(
      buildApiUrl(`/agent/threads/${input.threadId.trim()}/stream`, {
        access_token: streamToken,
      }),
    );
    input.streamRef.current = source;

    source.onopen = () => {
      input.setStreamStatus("live");
      input.setBanner({
        tone: "success",
        text: `Live SSE stream connected for thread ${input.threadId.trim().slice(0, 8)}...`,
      });
    };

    source.onerror = () => {
      input.setStreamStatus("error");
    };

    source.onmessage = (event) => {
      pushStreamEvent(event.type || "message", safeJsonParse(event.data));
    };

    source.addEventListener("agent.message", (event) => {
      const messageEvent = event as MessageEvent;
      pushStreamEvent("agent.message", safeJsonParse(messageEvent.data));
    });
  };

  return {
    startAgentStream,
    stopAgentStream,
  };
}
