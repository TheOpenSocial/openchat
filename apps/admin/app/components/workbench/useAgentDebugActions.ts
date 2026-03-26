"use client";

import { useCallback } from "react";
import type { HttpMethod } from "../../lib/api";
import {
  createHistoryId,
  errorText,
  normalizeQueryValues,
  parseRecordJsonInput,
} from "./workbench-utils";

const DEBUG_HISTORY_LIMIT = 20;

type RequestApi = <T>(
  method: HttpMethod,
  path: string,
  options?: {
    body?: Record<string, unknown>;
    query?: Record<string, string | number | boolean | undefined>;
    headers?: Record<string, string>;
  },
) => Promise<T>;

type RequestApiNullable = <T>(
  method: HttpMethod,
  path: string,
  options?: {
    body?: Record<string, unknown>;
    query?: Record<string, string | number | boolean | undefined>;
    headers?: Record<string, string>;
  },
) => Promise<T | null>;

type RunAction = <T>(
  key: string,
  operation: () => Promise<T>,
  successText: string | ((payload: T) => string),
  onSuccess?: (payload: T) => void,
) => Promise<T | null>;

type DebugMethod = "GET" | "POST" | "PUT" | "PATCH";

export function useAgentDebugActions(input: {
  requestApi: RequestApi;
  requestApiNullable: RequestApiNullable;
  runAction: RunAction;
  setBanner: (
    value: { tone: "info" | "error" | "success"; text: string } | null,
  ) => void;
  setBusyKey: (
    value: string | null | ((current: string | null) => string | null),
  ) => void;
  threadId: string;
  setThreadId: (value: string) => void;
  actingUserId: string;
  agentMessage: string;
  debugMethod: DebugMethod;
  debugPath: string;
  debugQueryInput: string;
  debugBodyInput: string;
  setAgentTraceSnapshot: (value: unknown) => void;
  setDebugResponse: (value: unknown) => void;
  setDebugHistory: (
    updater: (
      current: Array<{
        id: string;
        at: string;
        method: DebugMethod;
        path: string;
        success: boolean;
      }>,
    ) => Array<{
      id: string;
      at: string;
      method: DebugMethod;
      path: string;
      success: boolean;
    }>,
  ) => void;
}) {
  const inspectAgentThread = useCallback(() => {
    if (!input.threadId.trim()) {
      input.setBanner({ tone: "error", text: "Provide a thread id." });
      return Promise.resolve(null);
    }

    return input.runAction(
      "Inspect agent thread",
      () =>
        input.requestApi(
          "GET",
          `/agent/threads/${input.threadId.trim()}/messages`,
        ),
      "Agent thread messages loaded.",
      (payload) => input.setAgentTraceSnapshot(payload),
    );
  }, [input]);

  const loadPrimaryAgentThreadFromSession = useCallback(
    () =>
      input.runAction(
        "Load primary agent thread",
        () =>
          input.requestApiNullable<{
            id: string;
            title: string;
            createdAt: string;
          }>("GET", "/agent/threads/me/summary"),
        (payload) =>
          payload?.id
            ? `Primary thread “${payload.title}” — id copied to field.`
            : "No primary thread for the signed-in user (data was null).",
        (payload) => {
          input.setAgentTraceSnapshot(payload);
          if (payload?.id) {
            input.setThreadId(payload.id);
          }
        },
      ),
    [input],
  );

  const postAgentMessage = useCallback(() => {
    if (!input.threadId.trim()) {
      input.setBanner({ tone: "error", text: "Provide a thread id." });
      return Promise.resolve(null);
    }

    return input.runAction(
      "Post agent thread message",
      async () => {
        await input.requestApi(
          "POST",
          `/agent/threads/${input.threadId.trim()}/messages`,
          {
            body: {
              userId: input.actingUserId.trim(),
              content: input.agentMessage.trim(),
            },
          },
        );
        return input.requestApi(
          "GET",
          `/agent/threads/${input.threadId.trim()}/messages`,
        );
      },
      "Thread message inserted and trace refreshed.",
      (payload) => input.setAgentTraceSnapshot(payload),
    );
  }, [input]);

  const runAgenticRespond = useCallback(() => {
    if (!input.threadId.trim()) {
      input.setBanner({ tone: "error", text: "Provide a thread id." });
      return Promise.resolve(null);
    }
    if (!input.actingUserId.trim()) {
      input.setBanner({ tone: "error", text: "Provide acting user id." });
      return Promise.resolve(null);
    }
    if (!input.agentMessage.trim()) {
      input.setBanner({
        tone: "error",
        text: "Provide inject message content.",
      });
      return Promise.resolve(null);
    }

    return input.runAction(
      "Agentic respond",
      async () => {
        await input.requestApi(
          "POST",
          `/agent/threads/${input.threadId.trim()}/respond`,
          {
            body: {
              userId: input.actingUserId.trim(),
              content: input.agentMessage.trim(),
            },
          },
        );
        return input.requestApi(
          "GET",
          `/agent/threads/${input.threadId.trim()}/messages`,
        );
      },
      "Agentic turn completed; thread refreshed.",
      (payload) => input.setAgentTraceSnapshot(payload),
    );
  }, [input]);

  const executeDebugQuery = useCallback(async () => {
    const pathValue = input.debugPath.trim();
    if (pathValue.length === 0) {
      input.setBanner({ tone: "error", text: "Debug path cannot be empty." });
      return;
    }

    input.setBusyKey("Debug query");
    input.setBanner(null);

    const normalizedPath = pathValue.startsWith("/")
      ? pathValue
      : `/${pathValue}`;
    const now = new Date().toISOString();

    try {
      const parsedQuery = parseRecordJsonInput(
        "Debug query",
        input.debugQueryInput,
      );
      const query = normalizeQueryValues(parsedQuery);
      const parsedBody =
        input.debugMethod === "GET"
          ? undefined
          : parseRecordJsonInput("Debug body", input.debugBodyInput);

      const payload = await input.requestApi(
        input.debugMethod,
        normalizedPath,
        {
          ...(query ? { query } : {}),
          ...(parsedBody ? { body: parsedBody } : {}),
        },
      );

      input.setDebugResponse(payload);
      input.setDebugHistory((current) =>
        [
          {
            id: createHistoryId(),
            at: now,
            method: input.debugMethod,
            path: normalizedPath,
            success: true,
          },
          ...current,
        ].slice(0, DEBUG_HISTORY_LIMIT),
      );
      input.setBanner({
        tone: "success",
        text: `Debug query succeeded: ${input.debugMethod} ${normalizedPath}`,
      });
    } catch (error) {
      input.setDebugHistory((current) =>
        [
          {
            id: createHistoryId(),
            at: now,
            method: input.debugMethod,
            path: normalizedPath,
            success: false,
          },
          ...current,
        ].slice(0, DEBUG_HISTORY_LIMIT),
      );
      input.setBanner({
        tone: "error",
        text: `Debug query failed: ${errorText(error)}`,
      });
    } finally {
      input.setBusyKey((current) =>
        current === "Debug query" ? null : current,
      );
    }
  }, [input]);

  return {
    inspectAgentThread,
    loadPrimaryAgentThreadFromSession,
    postAgentMessage,
    runAgenticRespond,
    executeDebugQuery,
  };
}
