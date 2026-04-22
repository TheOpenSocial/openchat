import { JsonView } from "@/app/components/JsonView";
import { Panel } from "@/app/components/Panel";
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

function formatRate(value: number | null) {
  if (value === null || Number.isNaN(value)) {
    return "n/a";
  }
  return `${(value * 100).toFixed(1)}%`;
}

function formatMs(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "n/a";
  }
  return `${Math.round(value)}ms`;
}

function formatSeconds(value: number | null) {
  if (value === null || Number.isNaN(value)) {
    return "n/a";
  }
  return `${value.toFixed(1)}s`;
}

function formatDateTime(value: string | null) {
  if (!value) {
    return "n/a";
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  return parsed.toLocaleString();
}

function readRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : null;
}

function readArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

export function SystemControlsPanel({
  adminButtonClass,
  health,
  relayCount,
  loadDeadLetters,
  relayOutbox,
}: {
  adminButtonClass: string;
  health: string;
  relayCount: number | null;
  loadDeadLetters: () => Promise<unknown>;
  relayOutbox: () => Promise<unknown>;
}) {
  return (
    <Panel
      subtitle="Live queue operations and system health."
      title="System Controls"
    >
      <div className="flex flex-wrap gap-2">
        <button
          className={adminButtonClass}
          onClick={loadDeadLetters}
          type="button"
        >
          Load dead letters
        </button>
        <button
          className={adminButtonClass}
          onClick={relayOutbox}
          type="button"
        >
          Relay outbox
        </button>
      </div>
      <p className="mt-3 text-xs text-muted-foreground">
        health: <span className="text-foreground">{health}</span>
      </p>
      <p className="text-xs text-muted-foreground">
        outbox processed:{" "}
        <span className="text-foreground">{relayCount ?? "n/a"}</span>
      </p>
    </Panel>
  );
}

export function OnboardingActivationHealthPanel({
  adminButtonClass,
  onboardingActivationSnapshot,
  loadOnboardingActivationSnapshot,
}: {
  adminButtonClass: string;
  onboardingActivationSnapshot: OnboardingActivationSnapshot | null;
  loadOnboardingActivationSnapshot: () => Promise<unknown>;
}) {
  return (
    <Panel
      subtitle="Server-side onboarding first-activation execution snapshot."
      title="Onboarding Activation Health"
    >
      <div className="flex flex-wrap gap-2">
        <button
          className={adminButtonClass}
          onClick={loadOnboardingActivationSnapshot}
          type="button"
        >
          Refresh activation snapshot
        </button>
      </div>
      {!onboardingActivationSnapshot ? (
        <p className="mt-3 text-sm text-muted-foreground">
          No activation snapshot loaded yet.
        </p>
      ) : (
        <div className="mt-3 space-y-1 text-xs text-muted-foreground">
          <p>
            window: last {onboardingActivationSnapshot.window.hours}h · started:{" "}
            {onboardingActivationSnapshot.counters.started} · succeeded:{" "}
            {onboardingActivationSnapshot.counters.succeeded} · failed:{" "}
            {onboardingActivationSnapshot.counters.failed} · processing:{" "}
            {onboardingActivationSnapshot.counters.processing}
          </p>
          <p>
            success:{" "}
            {formatRate(onboardingActivationSnapshot.metrics.successRate)} ·
            failure:{" "}
            {formatRate(onboardingActivationSnapshot.metrics.failureRate)} ·
            processing:{" "}
            {formatRate(onboardingActivationSnapshot.metrics.processingRate)} ·
            avg completion:{" "}
            {formatSeconds(
              onboardingActivationSnapshot.metrics.avgCompletionSeconds,
            )}
          </p>
        </div>
      )}
    </Panel>
  );
}

export function LlmRuntimeHealthPanel({
  adminButtonClass,
  llmRuntimeHealthSnapshot,
  loadLlmRuntimeHealthSnapshot,
}: {
  adminButtonClass: string;
  llmRuntimeHealthSnapshot: LlmRuntimeHealthSnapshot | null;
  loadLlmRuntimeHealthSnapshot: () => Promise<unknown>;
}) {
  return (
    <Panel
      subtitle="Primary runtime snapshot for onboarding + agentic LLM operations."
      title="LLM Runtime Health"
    >
      <div className="flex flex-wrap gap-2">
        <button
          className={adminButtonClass}
          onClick={loadLlmRuntimeHealthSnapshot}
          type="button"
        >
          Refresh runtime health
        </button>
      </div>
      {!llmRuntimeHealthSnapshot ? (
        <p className="mt-3 text-sm text-muted-foreground">
          No runtime snapshot loaded yet.
        </p>
      ) : (
        <div className="mt-3 space-y-1 text-xs text-muted-foreground">
          <p>
            onboarding calls: {llmRuntimeHealthSnapshot.onboarding.calls} ·
            fallback:{" "}
            {formatRate(llmRuntimeHealthSnapshot.onboarding.fallbackRate)} ·
            unavailable:{" "}
            {formatRate(llmRuntimeHealthSnapshot.onboarding.unavailableRate)} ·
            p95: {formatMs(llmRuntimeHealthSnapshot.onboarding.p95LatencyMs)}
          </p>
          <p>
            openai calls: {llmRuntimeHealthSnapshot.openai.calls} · error:{" "}
            {formatRate(llmRuntimeHealthSnapshot.openai.errorRate)} · avg
            latency: {formatMs(llmRuntimeHealthSnapshot.openai.avgLatencyMs)}
          </p>
          <p>
            circuits open:{" "}
            {llmRuntimeHealthSnapshot.budget.anyCircuitOpen
              ? `${llmRuntimeHealthSnapshot.budget.openCircuitCount}/${llmRuntimeHealthSnapshot.budget.clientCount}`
              : "0"}
          </p>
        </div>
      )}
    </Panel>
  );
}

export function LaunchControlsPanel({
  adminButtonClass,
  adminButtonGhostClass,
  adminInputClass,
  launchControlReason,
  launchControlsSnapshot,
  loadLaunchControlsSnapshot,
  setLaunchControlReason,
  toggleLaunchControl,
}: {
  adminButtonClass: string;
  adminButtonGhostClass: string;
  adminInputClass: string;
  launchControlReason: string;
  launchControlsSnapshot: LaunchControlsSnapshot | null;
  loadLaunchControlsSnapshot: () => Promise<unknown>;
  setLaunchControlReason: (value: string) => void;
  toggleLaunchControl: (
    field: "globalKillSwitch" | "enableNewIntents" | "inviteOnlyMode",
    nextValue: boolean,
  ) => Promise<unknown>;
}) {
  return (
    <Panel
      subtitle="Launch-critical flags with audited operator mutations."
      title="Launch Controls"
    >
      <div className="flex flex-wrap gap-2">
        <button
          className={adminButtonClass}
          onClick={loadLaunchControlsSnapshot}
          type="button"
        >
          Refresh launch controls
        </button>
        {launchControlsSnapshot ? (
          <>
            <button
              className={adminButtonGhostClass}
              onClick={() =>
                void toggleLaunchControl(
                  "enableNewIntents",
                  !launchControlsSnapshot.enableNewIntents,
                )
              }
              type="button"
            >
              {launchControlsSnapshot.enableNewIntents
                ? "Disable new intents"
                : "Enable new intents"}
            </button>
            <button
              className={adminButtonGhostClass}
              onClick={() =>
                void toggleLaunchControl(
                  "inviteOnlyMode",
                  !launchControlsSnapshot.inviteOnlyMode,
                )
              }
              type="button"
            >
              {launchControlsSnapshot.inviteOnlyMode
                ? "Disable invite-only"
                : "Enable invite-only"}
            </button>
            <button
              className={adminButtonGhostClass}
              onClick={() =>
                void toggleLaunchControl(
                  "globalKillSwitch",
                  !launchControlsSnapshot.globalKillSwitch,
                )
              }
              type="button"
            >
              {launchControlsSnapshot.globalKillSwitch
                ? "Disable kill switch"
                : "Enable kill switch"}
            </button>
          </>
        ) : null}
      </div>
      <textarea
        className={`${adminInputClass} mt-3 min-h-20`}
        onChange={(event) => setLaunchControlReason(event.currentTarget.value)}
        value={launchControlReason}
      />
      {!launchControlsSnapshot ? (
        <p className="mt-3 text-sm text-muted-foreground">
          No launch-control snapshot loaded yet.
        </p>
      ) : (
        <div className="mt-3 space-y-1 text-xs text-muted-foreground">
          <p>
            kill switch: {String(launchControlsSnapshot.globalKillSwitch)} ·
            invite only: {String(launchControlsSnapshot.inviteOnlyMode)} · new
            intents: {String(launchControlsSnapshot.enableNewIntents)}
          </p>
          <p>
            realtime: {String(launchControlsSnapshot.enableRealtimeChat)} ·
            scheduled tasks:{" "}
            {String(launchControlsSnapshot.enableScheduledTasks)} · saved
            searches: {String(launchControlsSnapshot.enableSavedSearches)}
          </p>
          <p>
            alpha cohort size:{" "}
            {launchControlsSnapshot.alphaCohortUserIds.length}
          </p>
        </div>
      )}
    </Panel>
  );
}

export function SecurityPosturePanel({
  adminButtonClass,
  securityPostureSnapshot,
  loadSecurityPostureSnapshot,
}: {
  adminButtonClass: string;
  securityPostureSnapshot: SecurityPostureSnapshot | null;
  loadSecurityPostureSnapshot: () => Promise<unknown>;
}) {
  return (
    <Panel
      subtitle="Runtime security posture and deployment compatibility checks."
      title="Security Posture"
    >
      <div className="flex flex-wrap gap-2">
        <button
          className={adminButtonClass}
          onClick={loadSecurityPostureSnapshot}
          type="button"
        >
          Refresh security posture
        </button>
      </div>
      {!securityPostureSnapshot ? (
        <p className="mt-3 text-sm text-muted-foreground">
          No security posture snapshot loaded yet.
        </p>
      ) : (
        <div className="mt-3 space-y-2 text-xs text-muted-foreground">
          <p>
            status:{" "}
            <span className="text-foreground">
              {securityPostureSnapshot.status}
            </span>
            {" · "}
            env:{" "}
            <span className="text-foreground">
              {securityPostureSnapshot.environment}
            </span>
          </p>
          <p>
            strict mode: {String(securityPostureSnapshot.strictMode)} · strict
            startup: {String(securityPostureSnapshot.strictStartupEnforcement)}
          </p>
          {securityPostureSnapshot.violations.length === 0 ? (
            <p className="text-foreground">No posture violations detected.</p>
          ) : (
            securityPostureSnapshot.violations.map((violation) => (
              <p key={violation}>{violation}</p>
            ))
          )}
        </div>
      )}
    </Panel>
  );
}

export function ReliabilityPanels({
  adminButtonClass,
  agentReliabilitySnapshot,
  loadAgentReliabilitySnapshot,
  loadVerificationRunsSnapshot,
  verificationRunsSnapshot,
}: {
  adminButtonClass: string;
  agentReliabilitySnapshot: AgentReliabilitySnapshot | null;
  loadAgentReliabilitySnapshot: () => Promise<unknown>;
  loadVerificationRunsSnapshot: () => Promise<unknown>;
  verificationRunsSnapshot: VerificationRunsSnapshot | null;
}) {
  const latestSuiteRun = readRecord(
    verificationRunsSnapshot?.summary.latestByLane.suite,
  );
  const latestVerificationRun = readRecord(
    verificationRunsSnapshot?.summary.latestByLane.verification,
  );
  const latestProdSmokeRun = readRecord(
    verificationRunsSnapshot?.summary.latestByLane.prodSmoke,
  );
  const latestLaneRuns: Array<{
    lane: "suite" | "verification" | "prod smoke";
    run: Record<string, unknown> | null;
  }> = [
    { lane: "suite", run: latestSuiteRun },
    { lane: "verification", run: latestVerificationRun },
    { lane: "prod smoke", run: latestProdSmokeRun },
  ];
  const recentRuns = readArray(verificationRunsSnapshot?.runs).slice(0, 5);

  return (
    <Panel
      subtitle="Verification evidence and workflow reliability with operator next steps."
      title="Reliability"
    >
      <div className="flex flex-wrap gap-2">
        <button
          className={adminButtonClass}
          onClick={loadAgentReliabilitySnapshot}
          type="button"
        >
          Refresh reliability
        </button>
        <button
          className={adminButtonClass}
          onClick={loadVerificationRunsSnapshot}
          type="button"
        >
          Refresh verification
        </button>
      </div>
      <div className="mt-3 space-y-3 text-xs text-muted-foreground">
        {!agentReliabilitySnapshot ? (
          <p>No reliability snapshot loaded yet.</p>
        ) : (
          <div className="space-y-2">
            <p>
              canary:{" "}
              <span className="text-foreground">
                {agentReliabilitySnapshot.canary.verdict}
              </span>
              {" · "}workflow runs:{" "}
              {agentReliabilitySnapshot.workflow.totalRuns}
            </p>
            <p>{agentReliabilitySnapshot.explainability.summary}</p>
            <div className="grid gap-2 md:grid-cols-2">
              <article className="rounded-lg border border-border bg-muted px-3 py-3">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  Canary reasons
                </p>
                {agentReliabilitySnapshot.canary.reasons.length === 0 ? (
                  <p className="mt-1 text-foreground">No canary reasons.</p>
                ) : (
                  <ul className="mt-1 space-y-1 text-foreground">
                    {agentReliabilitySnapshot.canary.reasons.map((reason) => (
                      <li key={reason}>{reason}</li>
                    ))}
                  </ul>
                )}
              </article>
              <article className="rounded-lg border border-border bg-muted px-3 py-3">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  Workflow failure focus
                </p>
                {agentReliabilitySnapshot.workflow.topFailureStages.length ===
                0 ? (
                  <p className="mt-1 text-foreground">
                    No dominant failure stage.
                  </p>
                ) : (
                  <ul className="mt-1 space-y-1 text-foreground">
                    {agentReliabilitySnapshot.workflow.topFailureStages
                      .slice(0, 3)
                      .map((stage) => (
                        <li key={`${stage.status}:${stage.stage}`}>
                          {stage.stage} · {stage.status} · {stage.count}
                        </li>
                      ))}
                  </ul>
                )}
              </article>
            </div>
            {agentReliabilitySnapshot.explainability.nextActions.map(
              (action) => (
                <p key={action.id}>
                  {action.label}: {action.reason}{" "}
                  <span className="text-muted-foreground">
                    ({action.endpoint})
                  </span>
                </p>
              ),
            )}
          </div>
        )}
        {!verificationRunsSnapshot ? (
          <p>No verification-run snapshot loaded yet.</p>
        ) : (
          <div className="space-y-2">
            <p>
              verification runs: {verificationRunsSnapshot.summary.totalRuns} ·
              healthy across lanes:{" "}
              {String(verificationRunsSnapshot.explainability.allLanesHealthy)}
            </p>
            <p>{verificationRunsSnapshot.explainability.summary}</p>
            {verificationRunsSnapshot.explainability.latestProblemRun ? (
              <p>
                latest problem:{" "}
                {verificationRunsSnapshot.explainability.latestProblemRun.lane}
                {" / "}
                {
                  verificationRunsSnapshot.explainability.latestProblemRun
                    .status
                }
              </p>
            ) : null}
            <div className="grid gap-2 md:grid-cols-3">
              {latestLaneRuns.map(({ lane, run }) => (
                <details
                  className="rounded-lg border border-border bg-muted px-3 py-3"
                  key={lane}
                >
                  <summary className="cursor-pointer text-foreground">
                    {lane}
                  </summary>
                  <div className="mt-2">
                    {run ? (
                      <JsonView value={run} />
                    ) : (
                      <p className="text-foreground">No lane snapshot.</p>
                    )}
                  </div>
                </details>
              ))}
            </div>
            <div className="space-y-2">
              {recentRuns.map((run, index) => {
                const runRecord = readRecord(run);
                return (
                  <article
                    className="rounded-lg border border-border bg-muted px-3 py-3"
                    key={readString(runRecord?.runId) ?? `${index}`}
                  >
                    <p className="text-foreground">
                      {readString(runRecord?.lane) ?? "lane"}
                      {" · "}
                      {readString(runRecord?.status) ?? "unknown"}
                    </p>
                    <p className="text-foreground/80">
                      verdict: {readString(runRecord?.canaryVerdict) ?? "n/a"}
                    </p>
                    <div className="mt-2">
                      <JsonView value={run} />
                    </div>
                  </article>
                );
              })}
            </div>
            <div className="space-y-1">
              {verificationRunsSnapshot.explainability.nextActions.map(
                (action) => (
                  <p key={action.id}>
                    {action.label}: {action.reason}{" "}
                    <span className="text-muted-foreground">
                      ({action.endpoint})
                    </span>
                  </p>
                ),
              )}
            </div>
          </div>
        )}
      </div>
    </Panel>
  );
}

export function AgentOpsPanels({
  adminButtonClass,
  agentActionsSnapshot,
  agentOutcomesSnapshot,
  agentWorkflowDetailSnapshot,
  agentWorkflowListSnapshot,
  loadAgentActionsSnapshot,
  loadAgentOutcomesSnapshot,
  loadAgentWorkflowDetailSnapshot,
  loadAgentWorkflowListSnapshot,
  selectedWorkflowRunId,
  setSelectedWorkflowRunId,
}: {
  adminButtonClass: string;
  agentActionsSnapshot: AgentActionsSnapshot | null;
  agentOutcomesSnapshot: AgentOutcomesSnapshot | null;
  agentWorkflowDetailSnapshot: AgentWorkflowDetailSnapshot | null;
  agentWorkflowListSnapshot: AgentWorkflowListSnapshot | null;
  loadAgentActionsSnapshot: () => Promise<unknown>;
  loadAgentOutcomesSnapshot: () => Promise<unknown>;
  loadAgentWorkflowDetailSnapshot: (workflowRunId?: string) => Promise<unknown>;
  loadAgentWorkflowListSnapshot: () => Promise<unknown>;
  selectedWorkflowRunId: string;
  setSelectedWorkflowRunId: (value: string) => void;
}) {
  const primaryAction =
    agentActionsSnapshot?.items.find((item) => item.status === "executed") ??
    agentActionsSnapshot?.items[0] ??
    null;

  return (
    <div className="space-y-4">
      <Panel
        subtitle="Outcome metrics and operator next steps for agent-social actions."
        title="Agent Outcomes"
      >
        <div className="flex flex-wrap gap-2">
          <button
            className={adminButtonClass}
            onClick={loadAgentOutcomesSnapshot}
            type="button"
          >
            Refresh outcomes
          </button>
        </div>
        {!agentOutcomesSnapshot ? (
          <p className="mt-3 text-sm text-muted-foreground">
            No agent-outcome snapshot loaded yet.
          </p>
        ) : (
          <div className="mt-3 space-y-3 text-xs text-muted-foreground">
            <p>
              actions: {agentOutcomesSnapshot.summary.totalActions} · executed:{" "}
              {agentOutcomesSnapshot.summary.executedActions} · denied:{" "}
              {agentOutcomesSnapshot.summary.deniedActions} · failed:{" "}
              {agentOutcomesSnapshot.summary.failedActions}
            </p>
            <p>{agentOutcomesSnapshot.explainability.summary}</p>
            <p>
              intro acceptance:{" "}
              {formatRate(
                agentOutcomesSnapshot.explainability.rates.introAcceptanceRate,
              )}{" "}
              · circle conversion:{" "}
              {formatRate(
                agentOutcomesSnapshot.explainability.rates.circleConversionRate,
              )}{" "}
              · follow-up usefulness:{" "}
              {formatRate(
                agentOutcomesSnapshot.explainability.rates
                  .followupUsefulnessRate,
              )}
            </p>
            <div className="grid gap-2 lg:grid-cols-[1.15fr_0.85fr]">
              <article className="rounded-lg border border-border bg-muted px-3 py-3">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  Follow-through signal
                </p>
                <p className="mt-1 text-foreground">
                  completed runs:{" "}
                  {agentOutcomesSnapshot.followupUsefulness.completedRuns} ·
                  engaged runs:{" "}
                  {agentOutcomesSnapshot.followupUsefulness.engagedRuns} ·
                  engagement window:{" "}
                  {
                    agentOutcomesSnapshot.followupUsefulness
                      .engagementWindowHours
                  }
                  h
                </p>
                <p className="mt-1 text-foreground">
                  completion rate:{" "}
                  {formatRate(
                    agentOutcomesSnapshot.followupUsefulness.completionRate,
                  )}{" "}
                  · usefulness rate:{" "}
                  {formatRate(
                    agentOutcomesSnapshot.followupUsefulness.usefulnessRate,
                  )}
                </p>
              </article>
              <article className="rounded-lg border border-border bg-muted px-3 py-3">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  Next actions
                </p>
                <div className="mt-1 space-y-1 text-foreground">
                  {agentOutcomesSnapshot.explainability.nextActions.map(
                    (action) => (
                      <p key={action.id}>
                        {action.label}: {action.reason}{" "}
                        <span className="text-muted-foreground">
                          ({action.endpoint})
                        </span>
                      </p>
                    ),
                  )}
                </div>
              </article>
            </div>
            {agentOutcomesSnapshot.explainability.topTool ? (
              <article className="rounded-lg border border-border bg-background px-3 py-3">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  Top tool
                </p>
                <p className="mt-1 text-foreground">
                  {agentOutcomesSnapshot.explainability.topTool.tool} ·
                  attempted{" "}
                  {agentOutcomesSnapshot.explainability.topTool.attempted} ·
                  executed{" "}
                  {agentOutcomesSnapshot.explainability.topTool.executed} ·
                  denied {agentOutcomesSnapshot.explainability.topTool.denied} ·
                  failed {agentOutcomesSnapshot.explainability.topTool.failed}
                </p>
              </article>
            ) : null}
            <div className="grid gap-2 md:grid-cols-2">
              {agentOutcomesSnapshot.toolAttempts.slice(0, 4).map((tool) => (
                <article
                  className="rounded-lg border border-border bg-muted px-3 py-3"
                  key={tool.tool}
                >
                  <p className="text-foreground">{tool.tool}</p>
                  <p className="mt-1 text-foreground/80">
                    attempted {tool.attempted} · executed {tool.executed} ·
                    denied {tool.denied} · failed {tool.failed}
                  </p>
                </article>
              ))}
            </div>
          </div>
        )}
      </Panel>

      <Panel
        subtitle="Recent tool actions with checkpoint status and trace context."
        title="Agent Actions"
      >
        <div className="flex flex-wrap gap-2">
          <button
            className={adminButtonClass}
            onClick={loadAgentActionsSnapshot}
            type="button"
          >
            Refresh actions
          </button>
        </div>
        {!agentActionsSnapshot ? (
          <p className="mt-3 text-sm text-muted-foreground">
            No agent-action snapshot loaded yet.
          </p>
        ) : (
          <div className="mt-3 space-y-3 text-xs text-muted-foreground">
            <p>{agentActionsSnapshot.explainability.summary}</p>
            <p>
              executed:{" "}
              {agentActionsSnapshot.explainability.statusCounts.executed}
              {" · "}denied:{" "}
              {agentActionsSnapshot.explainability.statusCounts.denied}
              {" · "}failed:{" "}
              {agentActionsSnapshot.explainability.statusCounts.failed}
              {" · "}pending:{" "}
              {agentActionsSnapshot.explainability.statusCounts.pending}
            </p>
            {primaryAction ? (
              <article className="rounded-lg border border-border bg-background px-3 py-3">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  Primary signal
                </p>
                <p className="mt-1 text-foreground">
                  {primaryAction.tool ?? "unknown tool"} ·{" "}
                  {primaryAction.status ?? "unknown status"}
                </p>
                {primaryAction.linkedCheckpoint?.status ? (
                  <p className="mt-1 text-foreground/80">
                    checkpoint: {primaryAction.linkedCheckpoint.status}
                    {primaryAction.linkedCheckpoint.decisionReason
                      ? ` · ${primaryAction.linkedCheckpoint.decisionReason}`
                      : ""}
                  </p>
                ) : null}
              </article>
            ) : null}
            {agentActionsSnapshot.items.length === 0 ? (
              <p>No agent actions matched the current default filter.</p>
            ) : (
              <div className="space-y-2">
                {agentActionsSnapshot.items.slice(0, 4).map((item) => (
                  <details
                    className="rounded-lg border border-border bg-muted px-3 py-3"
                    key={item.id}
                  >
                    <summary className="cursor-pointer list-none">
                      <p className="text-sm font-semibold text-foreground">
                        {item.tool ?? "unknown tool"} ·{" "}
                        {item.status ?? "unknown"}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        trace {item.traceId ?? "n/a"} · thread{" "}
                        {item.threadId ?? "n/a"}
                      </p>
                    </summary>
                    <div className="mt-3 grid gap-3 lg:grid-cols-2">
                      <div className="space-y-1">
                        {item.summary ? (
                          <p className="text-xs text-foreground">
                            {item.summary}
                          </p>
                        ) : null}
                        <p className="text-xs text-muted-foreground">
                          actor {item.actorUserId ?? "n/a"} · role{" "}
                          {item.role ?? "n/a"}
                        </p>
                        {item.latestUserMessage ? (
                          <p className="text-xs text-muted-foreground">
                            latest user message:{" "}
                            {item.latestUserMessage.content}
                          </p>
                        ) : null}
                        {item.linkedCheckpoint ? (
                          <p className="text-xs text-muted-foreground">
                            checkpoint {item.linkedCheckpoint.status}
                            {item.linkedCheckpoint.decisionReason
                              ? ` · ${item.linkedCheckpoint.decisionReason}`
                              : ""}
                          </p>
                        ) : null}
                        <p className="text-xs text-muted-foreground">
                          {item.replayHint}
                        </p>
                        {item.relatedTraceEvents.length > 0 ? (
                          <p className="text-xs text-muted-foreground">
                            related trace events:{" "}
                            {item.relatedTraceEvents.length}
                          </p>
                        ) : null}
                      </div>
                      <div className="space-y-2">
                        <details className="rounded-md border border-border bg-background px-3 py-2">
                          <summary className="cursor-pointer text-xs text-foreground">
                            input
                          </summary>
                          <JsonView value={item.input} />
                        </details>
                        <details className="rounded-md border border-border bg-background px-3 py-2">
                          <summary className="cursor-pointer text-xs text-foreground">
                            output
                          </summary>
                          <JsonView value={item.output} />
                        </details>
                      </div>
                    </div>
                  </details>
                ))}
              </div>
            )}
          </div>
        )}
      </Panel>

      <div className="grid gap-4 lg:grid-cols-[0.95fr_1.05fr]">
        <Panel
          subtitle="Workflow failure patterns and replayability with typed selection."
          title="Agent Workflows"
        >
          <div className="flex flex-wrap gap-2">
            <button
              className={adminButtonClass}
              onClick={loadAgentWorkflowListSnapshot}
              type="button"
            >
              Refresh workflows
            </button>
            <button
              className={adminButtonClass}
              disabled={!selectedWorkflowRunId.trim()}
              onClick={() =>
                void loadAgentWorkflowDetailSnapshot(selectedWorkflowRunId)
              }
              type="button"
            >
              Load selected detail
            </button>
          </div>
          {!agentWorkflowListSnapshot ? (
            <p className="mt-3 text-sm text-muted-foreground">
              No workflow snapshot loaded yet.
            </p>
          ) : (
            <div className="mt-3 space-y-3 text-xs text-muted-foreground">
              <p>{agentWorkflowListSnapshot.explainability.summary}</p>
              <p>
                total: {agentWorkflowListSnapshot.summary.totalRuns} · healthy:{" "}
                {agentWorkflowListSnapshot.summary.health.healthy} · watch:{" "}
                {agentWorkflowListSnapshot.summary.health.watch} · critical:{" "}
                {agentWorkflowListSnapshot.summary.health.critical}
              </p>
              <label className="block">
                <span className="mb-1 block text-xs text-muted-foreground">
                  workflow run
                </span>
                <select
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground"
                  onChange={(event) =>
                    setSelectedWorkflowRunId(event.currentTarget.value)
                  }
                  value={selectedWorkflowRunId}
                >
                  <option value="">Select workflow run</option>
                  {agentWorkflowListSnapshot.runs.map((run) => (
                    <option key={run.workflowRunId} value={run.workflowRunId}>
                      {run.domain} · {run.health} ·{" "}
                      {run.workflowRunId.slice(0, 8)}
                    </option>
                  ))}
                </select>
              </label>
              <div className="space-y-2">
                {agentWorkflowListSnapshot.runs.slice(0, 4).map((run) => (
                  <button
                    className="block w-full rounded-lg border border-border bg-muted px-3 py-3 text-left"
                    key={run.workflowRunId}
                    onClick={() => {
                      setSelectedWorkflowRunId(run.workflowRunId);
                      void loadAgentWorkflowDetailSnapshot(run.workflowRunId);
                    }}
                    type="button"
                  >
                    <p className="text-sm font-semibold text-foreground">
                      {run.domain} · {run.health}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      replayability {run.replayability} · duration{" "}
                      {formatMs(run.durationMs)}
                    </p>
                    {run.triage?.summary ? (
                      <p className="mt-1 text-xs text-muted-foreground">
                        {run.triage.summary}
                      </p>
                    ) : null}
                  </button>
                ))}
              </div>
            </div>
          )}
        </Panel>

        <Panel
          subtitle="Selected workflow detail payload for deeper triage without dropping to raw query mode."
          title="Workflow Detail"
        >
          {!agentWorkflowDetailSnapshot ? (
            <p className="text-sm text-muted-foreground">
              No workflow detail loaded yet.
            </p>
          ) : (
            <div className="space-y-3">
              <div className="space-y-1 text-xs text-muted-foreground">
                <p>
                  selected workflow:{" "}
                  <span className="text-foreground">
                    {selectedWorkflowRunId || "n/a"}
                  </span>
                </p>
              </div>
              <JsonView value={agentWorkflowDetailSnapshot} />
            </div>
          )}
        </Panel>
      </div>
    </div>
  );
}

export function ScheduledTaskOperatorPanel({
  adminButtonClass,
  adminButtonGhostClass,
  adminInputClass,
  userId,
  savedSearches,
  scheduledTaskActionReason,
  scheduledTaskRuns,
  scheduledTasks,
  selectedScheduledTaskId,
  loadSavedSearchesSnapshot,
  loadScheduledTaskRuns,
  loadScheduledTasksSnapshot,
  setScheduledTaskActionReason,
  setSelectedScheduledTaskId,
  archiveScheduledTask,
  pauseScheduledTask,
  resumeScheduledTask,
  runScheduledTaskNow,
}: {
  adminButtonClass: string;
  adminButtonGhostClass: string;
  adminInputClass: string;
  userId: string;
  savedSearches: SavedSearchRecord[];
  scheduledTaskActionReason: string;
  scheduledTaskRuns: ScheduledTaskRunRecord[];
  scheduledTasks: ScheduledTaskRecord[];
  selectedScheduledTaskId: string;
  loadSavedSearchesSnapshot: () => Promise<unknown>;
  loadScheduledTaskRuns: (taskId: string) => Promise<unknown>;
  loadScheduledTasksSnapshot: () => Promise<unknown>;
  setScheduledTaskActionReason: (value: string) => void;
  setSelectedScheduledTaskId: (value: string) => void;
  archiveScheduledTask: (taskId: string) => Promise<unknown>;
  pauseScheduledTask: (taskId: string) => Promise<unknown>;
  resumeScheduledTask: (taskId: string) => Promise<unknown>;
  runScheduledTaskNow: (taskId: string) => Promise<unknown>;
}) {
  const selectedTask =
    scheduledTasks.find((task) => task.id === selectedScheduledTaskId) ?? null;
  const visibleScheduledTasks = scheduledTasks.filter((task) =>
    userId.trim() ? task.userId === userId.trim() : true,
  );
  const selectedTaskConfig =
    selectedTask &&
    selectedTask.taskConfig &&
    typeof selectedTask.taskConfig === "object"
      ? selectedTask.taskConfig
      : null;
  const relatedSavedSearch =
    selectedTask &&
    selectedTaskConfig &&
    typeof selectedTaskConfig.savedSearchId === "string"
      ? (savedSearches.find(
          (search) => search.id === selectedTaskConfig.savedSearchId,
        ) ?? null)
      : null;

  return (
    <Panel
      subtitle="Operate recurring automation with typed task state instead of the generic query helper."
      title="Scheduled Tasks"
    >
      <div className="flex flex-wrap gap-2">
        <button
          className={adminButtonClass}
          onClick={loadScheduledTasksSnapshot}
          type="button"
        >
          Refresh admin tasks
        </button>
        <button
          className={adminButtonClass}
          onClick={loadSavedSearchesSnapshot}
          type="button"
        >
          Refresh saved searches
        </button>
        {selectedTask ? (
          <button
            className={adminButtonGhostClass}
            onClick={() => void loadScheduledTaskRuns(selectedTask.id)}
            type="button"
          >
            Refresh runs
          </button>
        ) : null}
      </div>

      <textarea
        className={`${adminInputClass} mt-3 min-h-20`}
        onChange={(event) =>
          setScheduledTaskActionReason(event.currentTarget.value)
        }
        value={scheduledTaskActionReason}
      />

      <div className="mt-3 grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">
            operator user scope:{" "}
            <span className="text-foreground">{userId}</span>
          </p>
          {visibleScheduledTasks.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No scheduled tasks matched the current user scope.
            </p>
          ) : (
            visibleScheduledTasks.map((task) => (
              <button
                className={`w-full rounded-lg border px-3 py-3 text-left ${
                  selectedScheduledTaskId === task.id
                    ? "border-foreground/40 bg-muted"
                    : "border-border bg-background"
                }`}
                key={task.id}
                onClick={() => {
                  setSelectedScheduledTaskId(task.id);
                  void loadScheduledTaskRuns(task.id);
                }}
                type="button"
              >
                <p className="text-sm font-semibold text-foreground">
                  {task.title}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {task.taskType} · {task.status} · next run{" "}
                  {formatDateTime(task.nextRunAt)}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  user {task.userId}
                </p>
              </button>
            ))
          )}
        </div>

        <div className="space-y-3">
          {!selectedTask ? (
            <p className="text-sm text-muted-foreground">
              Select a task to inspect runs and operate on it.
            </p>
          ) : (
            <>
              <div className="space-y-1 text-xs text-muted-foreground">
                <p>
                  <span className="text-foreground">{selectedTask.title}</span>
                  {" · "}
                  {selectedTask.status}
                </p>
                <p>
                  schedule: {selectedTask.scheduleType} · next run{" "}
                  {formatDateTime(selectedTask.nextRunAt)} · last run{" "}
                  {formatDateTime(selectedTask.lastRunAt)}
                </p>
                {selectedTask.description ? (
                  <p>{selectedTask.description}</p>
                ) : null}
                {relatedSavedSearch ? (
                  <p>
                    saved search:{" "}
                    <span className="text-foreground">
                      {relatedSavedSearch.title}
                    </span>
                    {" · "}
                    {relatedSavedSearch.searchType}
                  </p>
                ) : selectedTaskConfig &&
                  typeof selectedTaskConfig.savedSearchId === "string" ? (
                  <p>
                    saved search id:{" "}
                    <span className="text-foreground">
                      {selectedTaskConfig.savedSearchId}
                    </span>
                  </p>
                ) : null}
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  className={adminButtonGhostClass}
                  onClick={() => void runScheduledTaskNow(selectedTask.id)}
                  type="button"
                >
                  Run now
                </button>
                {selectedTask.status === "paused" ? (
                  <button
                    className={adminButtonGhostClass}
                    onClick={() => void resumeScheduledTask(selectedTask.id)}
                    type="button"
                  >
                    Resume
                  </button>
                ) : (
                  <button
                    className={adminButtonGhostClass}
                    onClick={() => void pauseScheduledTask(selectedTask.id)}
                    type="button"
                  >
                    Pause
                  </button>
                )}
                {selectedTask.status !== "archived" ? (
                  <button
                    className={adminButtonGhostClass}
                    onClick={() => void archiveScheduledTask(selectedTask.id)}
                    type="button"
                  >
                    Archive
                  </button>
                ) : null}
              </div>

              <div className="space-y-2">
                <p className="text-xs text-muted-foreground">
                  recent runs: {scheduledTaskRuns.length}
                </p>
                {scheduledTaskRuns.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No run snapshot loaded for this task yet.
                  </p>
                ) : (
                  scheduledTaskRuns.map((run) => (
                    <article
                      className="rounded-lg border border-border bg-muted px-3 py-3"
                      key={run.id}
                    >
                      <p className="text-sm font-semibold text-foreground">
                        {run.status}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        triggered {formatDateTime(run.triggeredAt)} · started{" "}
                        {formatDateTime(run.startedAt)} · finished{" "}
                        {formatDateTime(run.finishedAt)}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        trace {run.traceId}
                      </p>
                      {run.errorMessage ? (
                        <p className="mt-1 text-xs text-muted-foreground">
                          error: {run.errorMessage}
                        </p>
                      ) : null}
                    </article>
                  ))
                )}
              </div>
            </>
          )}

          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">
              saved searches: {savedSearches.length}
            </p>
            {savedSearches.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No saved-search snapshot loaded for the selected user yet.
              </p>
            ) : (
              savedSearches.slice(0, 4).map((search) => (
                <article
                  className="rounded-lg border border-border bg-background px-3 py-3"
                  key={search.id}
                >
                  <p className="text-sm font-semibold text-foreground">
                    {search.title}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {search.searchType} · updated{" "}
                    {formatDateTime(search.updatedAt)}
                  </p>
                </article>
              ))
            )}
          </div>
        </div>
      </div>
    </Panel>
  );
}
