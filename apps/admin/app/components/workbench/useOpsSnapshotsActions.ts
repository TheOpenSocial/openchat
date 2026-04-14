"use client";

import { useCallback } from "react";
import type { HttpMethod } from "../../lib/api";
import type {
  SavedSearchesSnapshot,
  ScheduledTaskRunsSnapshot,
  ScheduledTasksSnapshot,
} from "./operator-surface-types";
import { errorText } from "./workbench-utils";
import type {
  AgentActionsSnapshot,
  AgentOutcomesSnapshot,
  AgentReliabilitySnapshot,
  AgentWorkflowDetailSnapshot,
  AgentWorkflowListSnapshot,
  LlmRuntimeHealthSnapshot,
  LaunchControlsSnapshot,
  OnboardingActivationSnapshot,
  ProtocolQueueHealthSnapshot,
  SecurityPostureSnapshot,
  VerificationRunsSnapshot,
} from "./workbench-config";

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
  setLaunchControlsSnapshot: (
    value:
      | LaunchControlsSnapshot
      | null
      | ((
          current: LaunchControlsSnapshot | null,
        ) => LaunchControlsSnapshot | null),
  ) => void;
  setProtocolQueueHealthSnapshot: (
    value:
      | ProtocolQueueHealthSnapshot
      | null
      | ((
          current: ProtocolQueueHealthSnapshot | null,
        ) => ProtocolQueueHealthSnapshot | null),
  ) => void;
  setSecurityPostureSnapshot: (
    value:
      | SecurityPostureSnapshot
      | null
      | ((
          current: SecurityPostureSnapshot | null,
        ) => SecurityPostureSnapshot | null),
  ) => void;
  setVerificationRunsSnapshot: (
    value:
      | VerificationRunsSnapshot
      | null
      | ((
          current: VerificationRunsSnapshot | null,
        ) => VerificationRunsSnapshot | null),
  ) => void;
  setAgentReliabilitySnapshot: (
    value:
      | AgentReliabilitySnapshot
      | null
      | ((
          current: AgentReliabilitySnapshot | null,
        ) => AgentReliabilitySnapshot | null),
  ) => void;
  setAgentOutcomesSnapshot: (
    value:
      | AgentOutcomesSnapshot
      | null
      | ((
          current: AgentOutcomesSnapshot | null,
        ) => AgentOutcomesSnapshot | null),
  ) => void;
  setAgentActionsSnapshot: (
    value:
      | AgentActionsSnapshot
      | null
      | ((current: AgentActionsSnapshot | null) => AgentActionsSnapshot | null),
  ) => void;
  setAgentWorkflowListSnapshot: (
    value:
      | AgentWorkflowListSnapshot
      | null
      | ((
          current: AgentWorkflowListSnapshot | null,
        ) => AgentWorkflowListSnapshot | null),
  ) => void;
  setAgentWorkflowDetailSnapshot: (
    value:
      | AgentWorkflowDetailSnapshot
      | null
      | ((
          current: AgentWorkflowDetailSnapshot | null,
        ) => AgentWorkflowDetailSnapshot | null),
  ) => void;
  selectedWorkflowRunId: string;
  setSelectedWorkflowRunId: (
    value: string | ((current: string) => string),
  ) => void;
  userId: string;
  launchControlReason: string;
  scheduledTaskActionReason: string;
  setScheduledTaskActionReason: (
    value: string | ((current: string) => string),
  ) => void;
  setSavedSearchSnapshot: (
    value:
      | SavedSearchesSnapshot
      | null
      | ((
          current: SavedSearchesSnapshot | null,
        ) => SavedSearchesSnapshot | null),
  ) => void;
  setScheduledTaskSnapshot: (
    value:
      | ScheduledTasksSnapshot
      | null
      | ((
          current: ScheduledTasksSnapshot | null,
        ) => ScheduledTasksSnapshot | null),
  ) => void;
  setScheduledTaskRunsSnapshot: (
    value:
      | ScheduledTaskRunsSnapshot
      | null
      | ((
          current: ScheduledTaskRunsSnapshot | null,
        ) => ScheduledTaskRunsSnapshot | null),
  ) => void;
  adminScheduledTaskId: string;
  setAdminScheduledTaskId: (
    value: string | ((current: string) => string),
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

  const loadLaunchControlsSnapshot = useCallback(
    () =>
      input.runAction(
        "Load launch controls",
        () =>
          input.requestApi<LaunchControlsSnapshot>(
            "GET",
            "/admin/launch-controls",
          ),
        "Launch controls refreshed.",
        (snapshot) => input.setLaunchControlsSnapshot(snapshot),
      ),
    [input],
  );

  const loadProtocolQueueHealthSnapshot = useCallback(
    () =>
      input.runAction(
        "Load protocol queue health",
        () =>
          input.requestApi<ProtocolQueueHealthSnapshot>(
            "GET",
            "/admin/ops/protocol-queue-health",
          ),
        "Protocol queue health refreshed.",
        (snapshot) => input.setProtocolQueueHealthSnapshot(snapshot),
      ),
    [input],
  );

  const loadSecurityPostureSnapshot = useCallback(
    () =>
      input.runAction(
        "Load security posture",
        () =>
          input.requestApi<SecurityPostureSnapshot>(
            "GET",
            "/admin/security/posture",
          ),
        "Security posture refreshed.",
        (snapshot) => input.setSecurityPostureSnapshot(snapshot),
      ),
    [input],
  );

  const loadVerificationRunsSnapshot = useCallback(
    () =>
      input.runAction(
        "Load verification runs",
        () =>
          input.requestApi<VerificationRunsSnapshot>(
            "GET",
            "/admin/ops/verification-runs",
            {
              query: { limit: 10 },
            },
          ),
        "Verification runs refreshed.",
        (snapshot) => input.setVerificationRunsSnapshot(snapshot),
      ),
    [input],
  );

  const loadAgentReliabilitySnapshot = useCallback(
    () =>
      input.runAction(
        "Load agent reliability",
        () =>
          input.requestApi<AgentReliabilitySnapshot>(
            "GET",
            "/admin/ops/agent-reliability",
            {
              query: { workflowLimit: 10, verificationLimit: 10 },
            },
          ),
        "Agent reliability refreshed.",
        (snapshot) => input.setAgentReliabilitySnapshot(snapshot),
      ),
    [input],
  );

  const loadAgentOutcomesSnapshot = useCallback(
    () =>
      input.runAction(
        "Load agent outcomes",
        () =>
          input.requestApi<AgentOutcomesSnapshot>(
            "GET",
            "/admin/ops/agent-outcomes",
            {
              query: { days: 30 },
            },
          ),
        "Agent outcomes refreshed.",
        (snapshot) => input.setAgentOutcomesSnapshot(snapshot),
      ),
    [input],
  );

  const loadAgentActionsSnapshot = useCallback(
    () =>
      input.runAction(
        "Load agent actions",
        () =>
          input.requestApi<AgentActionsSnapshot>(
            "GET",
            "/admin/ops/agent-actions",
            {
              query: { limit: 12 },
            },
          ),
        "Agent actions refreshed.",
        (snapshot) => input.setAgentActionsSnapshot(snapshot),
      ),
    [input],
  );

  const loadAgentWorkflowListSnapshot = useCallback(
    () =>
      input.runAction(
        "Load agent workflows",
        () =>
          input.requestApi<AgentWorkflowListSnapshot>(
            "GET",
            "/admin/ops/agent-workflows",
            {
              query: { limit: 12 },
            },
          ),
        "Agent workflows refreshed.",
        (snapshot) => {
          input.setAgentWorkflowListSnapshot(snapshot);
          input.setSelectedWorkflowRunId(snapshot.runs[0]?.workflowRunId ?? "");
        },
      ),
    [input],
  );

  const loadAgentWorkflowDetailSnapshot = useCallback(
    (workflowRunId?: string) =>
      input.runAction(
        "Load agent workflow detail",
        async () => {
          const id = (workflowRunId ?? input.selectedWorkflowRunId).trim();
          if (!id) {
            throw new Error("Select a workflow run id first.");
          }
          return input.requestApi<AgentWorkflowDetailSnapshot>(
            "GET",
            "/admin/ops/agent-workflows/details",
            {
              query: { workflowRunId: id },
            },
          );
        },
        "Agent workflow detail refreshed.",
        (snapshot) => {
          input.setSelectedWorkflowRunId(
            workflowRunId?.trim() ?? input.selectedWorkflowRunId.trim(),
          );
          input.setAgentWorkflowDetailSnapshot(snapshot);
        },
      ),
    [input],
  );

  const loadSavedSearchesSnapshot = useCallback(
    () =>
      input.runAction(
        "Load saved searches",
        () =>
          input.requestApi<SavedSearchesSnapshot>(
            "GET",
            `/saved-searches/${input.userId.trim()}`,
          ),
        "Saved searches refreshed.",
        (snapshot) => input.setSavedSearchSnapshot(snapshot),
      ),
    [input],
  );

  const loadScheduledTasksSnapshot = useCallback(
    () =>
      input.runAction(
        "Load scheduled tasks",
        () =>
          input.requestApi<ScheduledTasksSnapshot>(
            "GET",
            "/admin/scheduled-tasks",
          ),
        "Scheduled tasks refreshed.",
        (tasks) => {
          input.setScheduledTaskSnapshot(tasks);
          input.setAdminScheduledTaskId(tasks[0]?.id ?? "");
        },
      ),
    [input],
  );

  const loadScheduledTaskRuns = useCallback(
    (taskId?: string) =>
      input.runAction(
        "Load scheduled task runs",
        async () => {
          const id = (taskId ?? input.adminScheduledTaskId).trim();
          if (!id) {
            throw new Error("Select a scheduled task id first.");
          }
          return input.requestApi<ScheduledTaskRunsSnapshot>(
            "GET",
            `/admin/scheduled-tasks/${id}/runs`,
            {
              query: { limit: 100 },
            },
          );
        },
        "Scheduled task runs refreshed.",
        (runs) => input.setScheduledTaskRunsSnapshot(runs),
      ),
    [input],
  );

  const pauseScheduledTask = useCallback(
    (taskId: string) =>
      input.runAction(
        "Pause scheduled task",
        async () => {
          const id = taskId.trim();
          if (!id) {
            throw new Error("Select a scheduled task id first.");
          }
          await input.requestApi("POST", `/admin/scheduled-tasks/${id}/pause`, {
            body: {
              reason:
                input.scheduledTaskActionReason.trim() ||
                "operator dashboard change",
            },
          });
          return input.requestApi<ScheduledTasksSnapshot>(
            "GET",
            "/admin/scheduled-tasks",
          );
        },
        "Scheduled task paused.",
        (tasks) => {
          input.setScheduledTaskSnapshot(tasks);
          input.setAdminScheduledTaskId(taskId.trim());
        },
      ),
    [input],
  );

  const resumeScheduledTask = useCallback(
    (taskId: string) =>
      input.runAction(
        "Resume scheduled task",
        async () => {
          const id = taskId.trim();
          if (!id) {
            throw new Error("Select a scheduled task id first.");
          }
          await input.requestApi(
            "POST",
            `/admin/scheduled-tasks/${id}/resume`,
            {
              body: {
                reason:
                  input.scheduledTaskActionReason.trim() ||
                  "operator dashboard change",
              },
            },
          );
          return input.requestApi<ScheduledTasksSnapshot>(
            "GET",
            "/admin/scheduled-tasks",
          );
        },
        "Scheduled task resumed.",
        (tasks) => {
          input.setScheduledTaskSnapshot(tasks);
          input.setAdminScheduledTaskId(taskId.trim());
        },
      ),
    [input],
  );

  const archiveScheduledTask = useCallback(
    (taskId: string) =>
      input.runAction(
        "Archive scheduled task",
        async () => {
          const id = taskId.trim();
          if (!id) {
            throw new Error("Select a scheduled task id first.");
          }
          await input.requestApi(
            "POST",
            `/admin/scheduled-tasks/${id}/archive`,
            {
              body: {
                reason:
                  input.scheduledTaskActionReason.trim() ||
                  "operator dashboard change",
              },
            },
          );
          return input.requestApi<ScheduledTasksSnapshot>(
            "GET",
            "/admin/scheduled-tasks",
          );
        },
        "Scheduled task archived.",
        (tasks) => {
          input.setScheduledTaskSnapshot(tasks);
          input.setAdminScheduledTaskId(taskId.trim());
        },
      ),
    [input],
  );

  const runScheduledTaskNow = useCallback(
    (taskId: string) =>
      input.runAction(
        "Run scheduled task now",
        async () => {
          const id = taskId.trim();
          if (!id) {
            throw new Error("Select a scheduled task id first.");
          }
          await input.requestApi(
            "POST",
            `/admin/scheduled-tasks/${id}/run-now`,
            {
              body: {
                reason:
                  input.scheduledTaskActionReason.trim() ||
                  "operator dashboard change",
              },
            },
          );
          const [tasks, runs] = await Promise.all([
            input.requestApi<ScheduledTasksSnapshot>(
              "GET",
              "/admin/scheduled-tasks",
            ),
            input.requestApi<ScheduledTaskRunsSnapshot>(
              "GET",
              `/admin/scheduled-tasks/${id}/runs`,
              {
                query: { limit: 100 },
              },
            ),
          ]);
          return { tasks, runs };
        },
        "Scheduled task run requested.",
        (payload) => {
          input.setScheduledTaskSnapshot(payload.tasks);
          input.setScheduledTaskRunsSnapshot(payload.runs);
          input.setAdminScheduledTaskId(taskId.trim());
        },
      ),
    [input],
  );

  const toggleLaunchControl = useCallback(
    (
      field: "globalKillSwitch" | "enableNewIntents" | "inviteOnlyMode",
      nextValue: boolean,
    ) =>
      input.runAction(
        `Update ${field}`,
        () =>
          input.requestApi<LaunchControlsSnapshot>(
            "POST",
            "/admin/launch-controls",
            {
              body: {
                reason:
                  input.launchControlReason.trim() ||
                  "operator dashboard change",
                [field]: nextValue,
              },
            },
          ),
        "Launch controls updated.",
        (snapshot) => input.setLaunchControlsSnapshot(snapshot),
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
    loadLaunchControlsSnapshot,
    loadProtocolQueueHealthSnapshot,
    loadSecurityPostureSnapshot,
    loadVerificationRunsSnapshot,
    loadAgentReliabilitySnapshot,
    loadAgentOutcomesSnapshot,
    loadAgentActionsSnapshot,
    loadAgentWorkflowListSnapshot,
    loadAgentWorkflowDetailSnapshot,
    loadScheduledTasksSnapshot,
    loadScheduledTaskRuns,
    pauseScheduledTask,
    resumeScheduledTask,
    archiveScheduledTask,
    runScheduledTaskNow,
    loadAdminScheduledTasksSnapshot: loadScheduledTasksSnapshot,
    loadAdminScheduledTaskRunsSnapshot: loadScheduledTaskRuns,
    loadSavedSearchesSnapshot,
    toggleLaunchControl,
  };
}
