import { JsonView } from "@/app/components/JsonView";
import { Panel } from "@/app/components/Panel";

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

interface OnboardingActivationSnapshot {
  window: {
    hours: number;
  };
  counters: {
    started: number;
    succeeded: number;
    failed: number;
    processing: number;
  };
  metrics: {
    successRate: number | null;
    failureRate: number | null;
    processingRate: number | null;
    avgCompletionSeconds: number | null;
  };
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
  onboardingActivationSnapshot,
  relayCount,
  threadId,
  userId,
  executeDebugQuery,
  loadDeadLetters,
  loadOnboardingActivationSnapshot,
  relayOutbox,
  replayDeadLetter,
  setAdminRole,
  setAdminUserId,
  setDebugBodyInput,
  setDebugMethod,
  setDebugPath,
  setDebugQueryInput,
  setThreadId,
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
  onboardingActivationSnapshot: OnboardingActivationSnapshot | null;
  relayCount: number | null;
  threadId: string;
  userId: string;
  executeDebugQuery: () => Promise<unknown>;
  loadDeadLetters: () => Promise<unknown>;
  loadOnboardingActivationSnapshot: () => Promise<unknown>;
  relayOutbox: () => Promise<unknown>;
  replayDeadLetter: (id: string) => Promise<unknown>;
  setAdminRole: (value: "admin" | "support" | "moderator") => void;
  setAdminUserId: (value: string) => void;
  setDebugBodyInput: (value: string) => void;
  setDebugMethod: (value: "GET" | "POST" | "PUT" | "PATCH") => void;
  setDebugPath: (value: string) => void;
  setDebugQueryInput: (value: string) => void;
  setThreadId: (value: string) => void;
  setUserId: (value: string) => void;
}) {
  return (
    <section className="mt-4 space-y-4">
      <div className="grid gap-4 lg:grid-cols-[1.2fr_1fr]">
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
              window: last {onboardingActivationSnapshot.window.hours}h ·
              started: {onboardingActivationSnapshot.counters.started} ·
              succeeded: {onboardingActivationSnapshot.counters.succeeded} ·
              failed: {onboardingActivationSnapshot.counters.failed} ·
              processing: {onboardingActivationSnapshot.counters.processing}
            </p>
            <p>
              success:{" "}
              {formatRate(onboardingActivationSnapshot.metrics.successRate)} ·
              failure:{" "}
              {formatRate(onboardingActivationSnapshot.metrics.failureRate)} ·
              processing:{" "}
              {formatRate(onboardingActivationSnapshot.metrics.processingRate)}{" "}
              · avg completion:{" "}
              {formatSeconds(
                onboardingActivationSnapshot.metrics.avgCompletionSeconds,
              )}
            </p>
          </div>
        )}
      </Panel>

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
          subtitle="Call any API route directly from admin with JSON query/body payloads."
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

          <div className="mt-3 flex flex-wrap gap-2">
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
                setDebugMethod("GET");
                setDebugPath("/admin/health");
                setDebugQueryInput("{}");
                setDebugBodyInput("{}");
              }}
              type="button"
            >
              Load health preset
            </button>
            <button
              className={adminButtonGhostClass}
              onClick={() => {
                setDebugMethod("GET");
                setDebugPath("/admin/jobs/dead-letters");
                setDebugQueryInput("{}");
                setDebugBodyInput("{}");
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

function formatRate(value: number | null) {
  if (value == null) {
    return "n/a";
  }
  return `${Math.round(value * 100)}%`;
}

function formatSeconds(value: number | null) {
  if (value == null) {
    return "n/a";
  }
  return `${Math.round(value)}s`;
}
