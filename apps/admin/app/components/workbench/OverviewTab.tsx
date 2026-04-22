import { JsonView } from "@/app/components/JsonView";
import { Panel } from "@/app/components/Panel";
import {
  AgentOpsPanels,
  LlmRuntimeHealthPanel,
  LaunchControlsPanel,
  OnboardingActivationHealthPanel,
  ReliabilityPanels,
  ScheduledTaskOperatorPanel,
  SecurityPosturePanel,
  SystemControlsPanel,
} from "./OverviewRuntimePanels";
import {
  type AgentActionsSnapshot,
  type AgentOutcomesSnapshot,
  type AgentReliabilitySnapshot,
  type AgentWorkflowDetailSnapshot,
  type AgentWorkflowListSnapshot,
  type LlmRuntimeHealthSnapshot,
  type LaunchControlsSnapshot,
  type OnboardingActivationSnapshot,
  type SavedSearchRecord,
  type ScheduledTaskRecord,
  type ScheduledTaskRunRecord,
  type SecurityPostureSnapshot,
  type VerificationRunsSnapshot,
} from "./workbench-config";

interface DeadLetterRow {
  id: string;
  queueName: string;
  jobName: string;
  attempts: number;
  lastError: string;
  createdAt: string;
}

interface DebugHistoryRow {
  id: string;
  at: string;
  method: string;
  path: string;
  success: boolean;
}

export function OverviewTab({
  adminButtonClass,
  adminButtonGhostClass,
  adminInputClass,
  adminLabelClass,
  adminRole,
  adminUserId,
  debugBodyInput,
  debugHistory,
  debugMethod,
  debugPath,
  debugQueryInput,
  debugResponse,
  deadLetters,
  health,
  launchControlReason,
  launchControlsSnapshot,
  llmRuntimeHealthSnapshot,
  onboardingActivationSnapshot,
  savedSearches,
  relayCount,
  agentReliabilitySnapshot,
  agentOutcomesSnapshot,
  agentActionsSnapshot,
  agentWorkflowListSnapshot,
  agentWorkflowDetailSnapshot,
  scheduledTaskActionReason,
  scheduledTaskRuns,
  scheduledTasks,
  selectedScheduledTaskId,
  selectedWorkflowRunId,
  verificationRunsSnapshot,
  threadId,
  userId,
  archiveScheduledTask,
  executeDebugQuery,
  loadDeadLetters,
  loadAgentActionsSnapshot,
  loadAgentReliabilitySnapshot,
  loadAgentOutcomesSnapshot,
  loadAgentWorkflowDetailSnapshot,
  loadAgentWorkflowListSnapshot,
  loadLaunchControlsSnapshot,
  loadLlmRuntimeHealthSnapshot,
  loadOnboardingActivationSnapshot,
  loadSavedSearchesSnapshot,
  loadScheduledTaskRuns,
  loadScheduledTasksSnapshot,
  loadSecurityPostureSnapshot,
  loadVerificationRunsSnapshot,
  pauseScheduledTask,
  relayOutbox,
  replayDeadLetter,
  resumeScheduledTask,
  runScheduledTaskNow,
  securityPostureSnapshot,
  setAdminRole,
  setAdminUserId,
  setDebugBodyInput,
  setDebugMethod,
  setDebugPath,
  setDebugQueryInput,
  setLaunchControlReason,
  setScheduledTaskActionReason,
  setSelectedScheduledTaskId,
  setSelectedWorkflowRunId,
  setThreadId,
  toggleLaunchControl,
  setUserId,
}: {
  adminButtonClass: string;
  adminButtonGhostClass: string;
  adminInputClass: string;
  adminLabelClass: string;
  adminRole: "admin" | "support" | "moderator";
  adminUserId: string;
  debugBodyInput: string;
  debugHistory: DebugHistoryRow[];
  debugMethod: "GET" | "POST" | "PUT" | "PATCH";
  debugPath: string;
  debugQueryInput: string;
  debugResponse: unknown;
  deadLetters: DeadLetterRow[];
  health: string;
  launchControlReason: string;
  launchControlsSnapshot: LaunchControlsSnapshot | null;
  llmRuntimeHealthSnapshot: LlmRuntimeHealthSnapshot | null;
  onboardingActivationSnapshot: OnboardingActivationSnapshot | null;
  savedSearches: SavedSearchRecord[];
  relayCount: number | null;
  agentReliabilitySnapshot: AgentReliabilitySnapshot | null;
  agentOutcomesSnapshot: AgentOutcomesSnapshot | null;
  agentActionsSnapshot: AgentActionsSnapshot | null;
  agentWorkflowListSnapshot: AgentWorkflowListSnapshot | null;
  agentWorkflowDetailSnapshot: AgentWorkflowDetailSnapshot | null;
  scheduledTaskActionReason: string;
  scheduledTaskRuns: ScheduledTaskRunRecord[];
  scheduledTasks: ScheduledTaskRecord[];
  selectedScheduledTaskId: string;
  selectedWorkflowRunId: string;
  verificationRunsSnapshot: VerificationRunsSnapshot | null;
  threadId: string;
  userId: string;
  archiveScheduledTask: (taskId: string) => Promise<unknown>;
  executeDebugQuery: () => Promise<unknown>;
  loadDeadLetters: () => Promise<unknown>;
  loadAgentActionsSnapshot: () => Promise<unknown>;
  loadAgentReliabilitySnapshot: () => Promise<unknown>;
  loadAgentOutcomesSnapshot: () => Promise<unknown>;
  loadAgentWorkflowDetailSnapshot: (workflowRunId?: string) => Promise<unknown>;
  loadAgentWorkflowListSnapshot: () => Promise<unknown>;
  loadLaunchControlsSnapshot: () => Promise<unknown>;
  loadLlmRuntimeHealthSnapshot: () => Promise<unknown>;
  loadOnboardingActivationSnapshot: () => Promise<unknown>;
  loadSavedSearchesSnapshot: () => Promise<unknown>;
  loadScheduledTaskRuns: (taskId: string) => Promise<unknown>;
  loadScheduledTasksSnapshot: () => Promise<unknown>;
  loadSecurityPostureSnapshot: () => Promise<unknown>;
  loadVerificationRunsSnapshot: () => Promise<unknown>;
  pauseScheduledTask: (taskId: string) => Promise<unknown>;
  relayOutbox: () => Promise<unknown>;
  replayDeadLetter: (id: string) => Promise<unknown>;
  resumeScheduledTask: (taskId: string) => Promise<unknown>;
  runScheduledTaskNow: (taskId: string) => Promise<unknown>;
  securityPostureSnapshot: SecurityPostureSnapshot | null;
  setAdminRole: (value: "admin" | "support" | "moderator") => void;
  setAdminUserId: (value: string) => void;
  setDebugBodyInput: (value: string) => void;
  setDebugMethod: (value: "GET" | "POST" | "PUT" | "PATCH") => void;
  setDebugPath: (value: string) => void;
  setDebugQueryInput: (value: string) => void;
  setLaunchControlReason: (value: string) => void;
  setScheduledTaskActionReason: (value: string) => void;
  setSelectedScheduledTaskId: (value: string) => void;
  setSelectedWorkflowRunId: (value: string) => void;
  setThreadId: (value: string) => void;
  toggleLaunchControl: (
    field: "globalKillSwitch" | "enableNewIntents" | "inviteOnlyMode",
    nextValue: boolean,
  ) => Promise<unknown>;
  setUserId: (value: string) => void;
}) {
  const fillDebugPreset = ({
    method = "GET",
    path,
    body = "{}",
    query = "{}",
  }: {
    method?: "GET" | "POST" | "PUT" | "PATCH";
    path: string;
    body?: string;
    query?: string;
  }) => {
    setDebugMethod(method);
    setDebugPath(path);
    setDebugQueryInput(query);
    setDebugBodyInput(body);
  };

  const selectedTaskRunsPresetPath = selectedScheduledTaskId.trim()
    ? `/admin/scheduled-tasks/${selectedScheduledTaskId.trim()}/runs`
    : "/admin/scheduled-tasks/:taskId/runs";

  return (
    <section className="mt-4 space-y-4">
      <div className="grid gap-4 lg:grid-cols-[1.2fr_1fr]">
        <SystemControlsPanel
          adminButtonClass={adminButtonClass}
          health={health}
          loadDeadLetters={loadDeadLetters}
          relayCount={relayCount}
          relayOutbox={relayOutbox}
        />

        <Panel
          subtitle="Google sign-in sets your admin user id. Override only for impersonation or debugging."
          title="Context"
        >
          <label className={adminLabelClass}>
            admin user id (x-admin-user-id)
            <input
              className={adminInputClass}
              onChange={(event) => setAdminUserId(event.currentTarget.value)}
              value={adminUserId}
            />
          </label>
          <label className={adminLabelClass}>
            admin role (x-admin-role)
            <select
              className={adminInputClass}
              onChange={(event) =>
                setAdminRole(
                  event.currentTarget.value as
                    | "admin"
                    | "support"
                    | "moderator",
                )
              }
              value={adminRole}
            >
              <option value="admin">admin</option>
              <option value="support">support</option>
              <option value="moderator">moderator</option>
            </select>
          </label>
          <label className={adminLabelClass}>
            user id
            <input
              className={adminInputClass}
              onChange={(event) => setUserId(event.currentTarget.value)}
              value={userId}
            />
          </label>
          <label className={adminLabelClass}>
            thread id
            <input
              className={adminInputClass}
              onChange={(event) => setThreadId(event.currentTarget.value)}
              placeholder="agent thread uuid"
              value={threadId}
            />
          </label>
        </Panel>
      </div>

      <OnboardingActivationHealthPanel
        adminButtonClass={adminButtonClass}
        loadOnboardingActivationSnapshot={loadOnboardingActivationSnapshot}
        onboardingActivationSnapshot={onboardingActivationSnapshot}
      />
      <LlmRuntimeHealthPanel
        adminButtonClass={adminButtonClass}
        llmRuntimeHealthSnapshot={llmRuntimeHealthSnapshot}
        loadLlmRuntimeHealthSnapshot={loadLlmRuntimeHealthSnapshot}
      />
      <div className="grid gap-4 lg:grid-cols-2">
        <LaunchControlsPanel
          adminButtonClass={adminButtonClass}
          adminButtonGhostClass={adminButtonGhostClass}
          adminInputClass={adminInputClass}
          launchControlReason={launchControlReason}
          launchControlsSnapshot={launchControlsSnapshot}
          loadLaunchControlsSnapshot={loadLaunchControlsSnapshot}
          setLaunchControlReason={setLaunchControlReason}
          toggleLaunchControl={toggleLaunchControl}
        />
        <SecurityPosturePanel
          adminButtonClass={adminButtonClass}
          loadSecurityPostureSnapshot={loadSecurityPostureSnapshot}
          securityPostureSnapshot={securityPostureSnapshot}
        />
      </div>
      <ReliabilityPanels
        adminButtonClass={adminButtonClass}
        agentReliabilitySnapshot={agentReliabilitySnapshot}
        loadAgentReliabilitySnapshot={loadAgentReliabilitySnapshot}
        loadVerificationRunsSnapshot={loadVerificationRunsSnapshot}
        verificationRunsSnapshot={verificationRunsSnapshot}
      />
      <AgentOpsPanels
        adminButtonClass={adminButtonClass}
        agentActionsSnapshot={agentActionsSnapshot}
        agentOutcomesSnapshot={agentOutcomesSnapshot}
        agentWorkflowDetailSnapshot={agentWorkflowDetailSnapshot}
        agentWorkflowListSnapshot={agentWorkflowListSnapshot}
        loadAgentActionsSnapshot={loadAgentActionsSnapshot}
        loadAgentOutcomesSnapshot={loadAgentOutcomesSnapshot}
        loadAgentWorkflowDetailSnapshot={loadAgentWorkflowDetailSnapshot}
        loadAgentWorkflowListSnapshot={loadAgentWorkflowListSnapshot}
        selectedWorkflowRunId={selectedWorkflowRunId}
        setSelectedWorkflowRunId={setSelectedWorkflowRunId}
      />
      <ScheduledTaskOperatorPanel
        adminButtonClass={adminButtonClass}
        adminButtonGhostClass={adminButtonGhostClass}
        adminInputClass={adminInputClass}
        archiveScheduledTask={archiveScheduledTask}
        loadSavedSearchesSnapshot={loadSavedSearchesSnapshot}
        loadScheduledTaskRuns={loadScheduledTaskRuns}
        loadScheduledTasksSnapshot={loadScheduledTasksSnapshot}
        pauseScheduledTask={pauseScheduledTask}
        resumeScheduledTask={resumeScheduledTask}
        runScheduledTaskNow={runScheduledTaskNow}
        savedSearches={savedSearches}
        scheduledTaskActionReason={scheduledTaskActionReason}
        scheduledTaskRuns={scheduledTaskRuns}
        scheduledTasks={scheduledTasks}
        selectedScheduledTaskId={selectedScheduledTaskId}
        setScheduledTaskActionReason={setScheduledTaskActionReason}
        setSelectedScheduledTaskId={setSelectedScheduledTaskId}
        userId={userId}
      />

      <Panel
        subtitle="Replay failed jobs without touching Redis manually."
        title="Dead-letter Queue"
      >
        {deadLetters.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No dead-letter rows loaded.
          </p>
        ) : (
          <div className="space-y-2">
            {deadLetters.map((row) => (
              <article
                className="rounded-lg border border-border bg-muted px-3 py-3"
                key={row.id}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-foreground">
                    {row.queueName} / {row.jobName}
                  </p>
                  <button
                    className={adminButtonGhostClass}
                    onClick={() => {
                      replayDeadLetter(row.id).catch(() => {});
                    }}
                    type="button"
                  >
                    Replay
                  </button>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  attempts: {row.attempts} · createdAt: {row.createdAt}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {row.lastError}
                </p>
              </article>
            ))}
          </div>
        )}
      </Panel>

      <div className="grid gap-4 lg:grid-cols-[1.25fr_0.75fr]">
        <Panel
          className="border-dashed border-border/80 bg-muted/25"
          subtitle="Secondary escape hatch for routes without dedicated UI. Prefer the panels above, then use this for one-off inspection or payload experiments."
          title="Internal Query Helper"
        >
          <div className="grid gap-3 md:grid-cols-3">
            <label className={adminLabelClass}>
              method
              <select
                className={adminInputClass}
                onChange={(event) =>
                  setDebugMethod(
                    event.currentTarget.value as
                      | "GET"
                      | "POST"
                      | "PUT"
                      | "PATCH",
                  )
                }
                value={debugMethod}
              >
                <option value="GET">GET</option>
                <option value="POST">POST</option>
                <option value="PUT">PUT</option>
                <option value="PATCH">PATCH</option>
              </select>
            </label>
            <label className={`${adminLabelClass} md:col-span-2`}>
              path
              <input
                className={adminInputClass}
                onChange={(event) => setDebugPath(event.currentTarget.value)}
                placeholder="/admin/health"
                value={debugPath}
              />
            </label>
          </div>

          <div className="mt-3 grid gap-3 lg:grid-cols-2">
            <label className={adminLabelClass}>
              query json
              <textarea
                className={`${adminInputClass} min-h-24`}
                onChange={(event) =>
                  setDebugQueryInput(event.currentTarget.value)
                }
                value={debugQueryInput}
              />
            </label>
            <label className={adminLabelClass}>
              body json
              <textarea
                className={`${adminInputClass} min-h-24`}
                disabled={debugMethod === "GET"}
                onChange={(event) =>
                  setDebugBodyInput(event.currentTarget.value)
                }
                value={debugBodyInput}
              />
            </label>
          </div>

          <div className="mt-4">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Presets
            </p>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              <button
                className={adminButtonGhostClass}
                onClick={() => fillDebugPreset({ path: "/admin/health" })}
                type="button"
              >
                Health check
              </button>
              <button
                className={adminButtonGhostClass}
                onClick={() =>
                  fillDebugPreset({ path: "/admin/jobs/dead-letters" })
                }
                type="button"
              >
                Dead letters
              </button>
              <button
                className={adminButtonGhostClass}
                onClick={() =>
                  fillDebugPreset({
                    path: "/admin/ops/verification-runs",
                  })
                }
                type="button"
              >
                Verification runs
              </button>
              <button
                className={adminButtonGhostClass}
                onClick={() =>
                  fillDebugPreset({
                    path: "/admin/ops/agent-reliability",
                  })
                }
                type="button"
              >
                Agent reliability
              </button>
              <button
                className={adminButtonGhostClass}
                onClick={() =>
                  fillDebugPreset({
                    path: "/admin/ops/agent-outcomes",
                  })
                }
                type="button"
              >
                Agent outcomes
              </button>
              <button
                className={adminButtonGhostClass}
                onClick={() =>
                  fillDebugPreset({
                    path: "/admin/ops/agent-actions",
                  })
                }
                type="button"
              >
                Agent actions
              </button>
              <button
                className={adminButtonGhostClass}
                onClick={() =>
                  fillDebugPreset({ path: "/admin/security/posture" })
                }
                type="button"
              >
                Security posture
              </button>
              <button
                className={adminButtonGhostClass}
                onClick={() =>
                  fillDebugPreset({
                    path: "/admin/launch-controls",
                  })
                }
                type="button"
              >
                Launch controls
              </button>
              <button
                className={adminButtonGhostClass}
                disabled={!selectedScheduledTaskId.trim()}
                onClick={() =>
                  fillDebugPreset({
                    path: selectedTaskRunsPresetPath,
                  })
                }
                type="button"
              >
                Selected task runs
              </button>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              Keep payloads empty for simple GETs. For write routes, switch the
              method first and then edit only the body you need.
            </p>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <button
              className={adminButtonClass}
              onClick={() => {
                executeDebugQuery().catch(() => {});
              }}
              type="button"
            >
              Execute query
            </button>
            <button
              className={adminButtonGhostClass}
              onClick={() => {
                fillDebugPreset({ path: "/admin/health" });
              }}
              type="button"
            >
              Load health preset
            </button>
            <button
              className={adminButtonGhostClass}
              onClick={() => {
                fillDebugPreset({ path: "/admin/jobs/dead-letters" });
              }}
              type="button"
            >
              Load dead-letter preset
            </button>
          </div>

          <div className="mt-3">
            <JsonView
              emptyLabel="No debug response yet."
              value={debugResponse}
            />
          </div>
        </Panel>

        <Panel subtitle="Recent manual debug queries." title="Debug History">
          {debugHistory.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No debug queries executed yet.
            </p>
          ) : (
            <div className="space-y-2">
              {debugHistory.map((item) => (
                <article
                  className="rounded-lg border border-border bg-muted px-3 py-2"
                  key={item.id}
                >
                  <p className="text-xs font-semibold text-foreground">
                    {item.method} {item.path}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {item.at} · {item.success ? "ok" : "failed"}
                  </p>
                </article>
              ))}
            </div>
          )}
        </Panel>
      </div>
    </section>
  );
}
