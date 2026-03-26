"use client";

import { useCallback } from "react";
import type { HttpMethod } from "../../lib/api";
import { parseContextInput } from "./workbench-utils";

type RequestApi = <T>(
  method: HttpMethod,
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

export function usePolicyAdminActions(input: {
  requestApi: RequestApi;
  runAction: RunAction;
  setBanner: (
    value: { tone: "info" | "error" | "success"; text: string } | null,
  ) => void;
  userId: string;
  deactivateReason: string;
  restrictReason: string;
  policyContextInput: string;
  policyFlags: Record<string, unknown>;
  setModerationSnapshot: (value: unknown) => void;
  setLifeGraphSnapshot: (value: unknown) => void;
  setPolicyExplainSnapshot: (value: unknown) => void;
  setMemoryResetSnapshot: (value: unknown) => void;
}) {
  const deactivateUser = useCallback(() => {
    if (!input.userId.trim()) {
      input.setBanner({ tone: "error", text: "Provide a user id." });
      return Promise.resolve(null);
    }

    return input.runAction(
      "Deactivate account",
      () =>
        input.requestApi(
          "POST",
          `/admin/users/${input.userId.trim()}/deactivate`,
          {
            body: {
              reason: input.deactivateReason.trim(),
            },
          },
        ),
      "Account deactivated.",
      (payload) => input.setModerationSnapshot(payload),
    );
  }, [input]);

  const restrictUser = useCallback(() => {
    if (!input.userId.trim()) {
      input.setBanner({ tone: "error", text: "Provide a user id." });
      return Promise.resolve(null);
    }

    return input.runAction(
      "Restrict account",
      () =>
        input.requestApi(
          "POST",
          `/admin/users/${input.userId.trim()}/restrict`,
          {
            body: {
              reason: input.restrictReason.trim(),
            },
          },
        ),
      "Account restriction applied.",
      (payload) => input.setModerationSnapshot(payload),
    );
  }, [input]);

  const inspectLifeGraph = useCallback(
    () =>
      input.runAction(
        "Inspect life graph",
        () =>
          input.requestApi(
            "GET",
            `/personalization/${input.userId.trim()}/life-graph`,
          ),
        "Life graph snapshot loaded.",
        (payload) => input.setLifeGraphSnapshot(payload),
      ),
    [input],
  );

  const explainPolicy = useCallback(
    () =>
      input.runAction(
        "Explain policy",
        async () => {
          const context = parseContextInput(input.policyContextInput);
          return input.requestApi(
            "POST",
            `/personalization/${input.userId.trim()}/policy/explain`,
            {
              body: {
                ...input.policyFlags,
                ...(context ? { context } : {}),
              },
            },
          );
        },
        "Policy explanation generated.",
        (payload) => input.setPolicyExplainSnapshot(payload),
      ),
    [input],
  );

  const resetLearnedMemory = useCallback(
    () =>
      input.runAction(
        "Reset learned memory",
        () =>
          input.requestApi(
            "POST",
            `/privacy/${input.userId.trim()}/memory/reset`,
            {
              body: {
                actorUserId: input.userId.trim(),
                mode: "learned_memory",
                reason: "admin_panel_manual_reset",
              },
            },
          ),
        "Learned memory reset completed.",
        (payload) => input.setMemoryResetSnapshot(payload),
      ),
    [input],
  );

  return {
    deactivateUser,
    restrictUser,
    inspectLifeGraph,
    explainPolicy,
    resetLearnedMemory,
  };
}
