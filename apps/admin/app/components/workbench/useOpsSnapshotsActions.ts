"use client";

import { useCallback } from "react";
import { errorText } from "./workbench-utils";
import type {
  LlmRuntimeHealthSnapshot,
  OnboardingActivationSnapshot,
} from "./workbench-config";
import type { HttpMethod } from "../../lib/api";

export interface DeadLetterRow {
  id: string;
  queueName: string;
  jobName: string;
  attempts: number;
  lastError: string;
  createdAt: string;
}

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

export function useOpsSnapshotsActions(input: {
  requestApi: RequestApi;
  runAction: RunAction;
  setHealth: (value: string | ((current: string) => string)) => void;
  setDeadLetters: (
    value: DeadLetterRow[] | ((current: DeadLetterRow[]) => DeadLetterRow[]),
  ) => void;
  setRelayCount: (
    value: number | null | ((current: number | null) => number | null),
  ) => void;
  setOnboardingActivationSnapshot: (
    value:
      | OnboardingActivationSnapshot
      | null
      | ((
          current: OnboardingActivationSnapshot | null,
        ) => OnboardingActivationSnapshot | null),
  ) => void;
  setLlmRuntimeHealthSnapshot: (
    value:
      | LlmRuntimeHealthSnapshot
      | null
      | ((
          current: LlmRuntimeHealthSnapshot | null,
        ) => LlmRuntimeHealthSnapshot | null),
  ) => void;
}) {
  const refreshHealth = useCallback(async () => {
    try {
      const payload = await input.requestApi<{
        service: string;
        status: string;
      }>("GET", "/admin/health");
      input.setHealth(`${payload.service}:${payload.status}`);
    } catch (error) {
      input.setHealth(`error:${errorText(error)}`);
    }
  }, [input]);

  const loadDeadLetters = useCallback(
    () =>
      input.runAction(
        "Load dead letters",
        () =>
          input.requestApi<DeadLetterRow[]>("GET", "/admin/jobs/dead-letters"),
        (rows) => `Loaded ${rows.length} dead-letter rows.`,
        (rows) => input.setDeadLetters(rows),
      ),
    [input],
  );

  const replayDeadLetter = useCallback(
    (deadLetterId: string) =>
      input.runAction(
        "Replay dead letter",
        async () => {
          await input.requestApi(
            "POST",
            `/admin/jobs/dead-letters/${deadLetterId}/replay`,
            {
              body: {},
            },
          );
          return input.requestApi<DeadLetterRow[]>(
            "GET",
            "/admin/jobs/dead-letters",
          );
        },
        "Replay requested and dead-letter list refreshed.",
        (rows) => input.setDeadLetters(rows),
      ),
    [input],
  );

  const relayOutbox = useCallback(
    () =>
      input.runAction(
        "Relay outbox",
        () =>
          input.requestApi<{ processedCount: number }>(
            "POST",
            "/admin/outbox/relay",
            {
              body: {},
            },
          ),
        (result) => `Outbox relay processed ${result.processedCount} event(s).`,
        (result) => input.setRelayCount(result.processedCount),
      ),
    [input],
  );

  const loadOnboardingActivationSnapshot = useCallback(
    () =>
      input.runAction(
        "Load onboarding activation snapshot",
        () =>
          input.requestApi<OnboardingActivationSnapshot>(
            "GET",
            "/admin/ops/onboarding-activation",
            {
              query: {
                hours: 24,
              },
            },
          ),
        "Onboarding activation snapshot refreshed.",
        (snapshot) => input.setOnboardingActivationSnapshot(snapshot),
      ),
    [input],
  );

  const loadLlmRuntimeHealthSnapshot = useCallback(
    () =>
      input.runAction(
        "Load LLM runtime health snapshot",
        () =>
          input.requestApi<LlmRuntimeHealthSnapshot>(
            "GET",
            "/admin/ops/llm-runtime-health",
          ),
        "LLM runtime health refreshed.",
        (snapshot) => input.setLlmRuntimeHealthSnapshot(snapshot),
      ),
    [input],
  );

  return {
    refreshHealth,
    loadDeadLetters,
    replayDeadLetter,
    relayOutbox,
    loadOnboardingActivationSnapshot,
    loadLlmRuntimeHealthSnapshot,
  };
}
