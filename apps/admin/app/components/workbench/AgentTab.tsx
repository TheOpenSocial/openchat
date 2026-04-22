import { Panel } from "@/app/components/Panel";
import { JsonView } from "@/app/components/JsonView";
import {
  type AgentActionsSnapshot,
  type AgentWorkflowDetailSnapshot,
  type AgentWorkflowListSnapshot,
} from "./workbench-config";

interface StreamEventRow {
  id: string;
  at: string;
  kind: string;
  payload: unknown;
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

function pickTraceEntries(snapshot: unknown): unknown[] {
  if (Array.isArray(snapshot)) {
    return snapshot;
  }
  const record = readRecord(snapshot);
  if (!record) {
    return [];
  }
  for (const key of [
    "messages",
    "items",
    "events",
    "turns",
    "trace",
    "rows",
    "data",
  ]) {
    const candidate = readArray(record[key]);
    if (candidate.length > 0) {
      return candidate;
    }
  }
  return [];
}

function describeTraceEntry(entry: unknown) {
  const record = readRecord(entry);
  const role =
    readString(record?.role) ??
    readString(record?.kind) ??
    readString(record?.type) ??
    readString(record?.action) ??
    "entry";
  const summary =
    readString(record?.summary) ??
    readString(record?.content) ??
    readString(record?.message) ??
    readString(record?.reason) ??
    readString(record?.text) ??
    null;
  const at =
    readString(record?.createdAt) ??
    readString(record?.at) ??
    readString(record?.timestamp) ??
    null;
  return {
    role,
    summary,
    at,
    tool:
      readString(record?.tool) ??
      readString(record?.name) ??
      readString(record?.topic) ??
      null,
    status:
      readString(record?.status) ??
      readString(record?.checkpointStatus) ??
      readString(record?.decision) ??
      null,
  };
}

export function AgentTab({
  actingUserId,
  agentActionsSnapshot,
  adminButtonClass,
  adminButtonGhostClass,
  adminInputClass,
  adminLabelClass,
  agentMessage,
  agentTraceSnapshot,
  agentWorkflowDetailSnapshot,
  agentWorkflowListSnapshot,
  loadAgentActionsSnapshot,
  loadAgentWorkflowDetailSnapshot,
  loadAgentWorkflowListSnapshot,
  selectedWorkflowRunId,
  streamEvents,
  streamStatus,
  threadId,
  inspectAgentThread,
  loadPrimaryAgentThreadFromSession,
  postAgentMessage,
  runAgenticRespond,
  setActingUserId,
  setAgentMessage,
  setSelectedWorkflowRunId,
  setStreamEvents,
  setThreadId,
  startAgentStream,
  stopAgentStream,
}: {
  actingUserId: string;
  agentActionsSnapshot: AgentActionsSnapshot | null;
  adminButtonClass: string;
  adminButtonGhostClass: string;
  adminInputClass: string;
  adminLabelClass: string;
  agentMessage: string;
  agentTraceSnapshot: unknown;
  agentWorkflowDetailSnapshot: AgentWorkflowDetailSnapshot | null;
  agentWorkflowListSnapshot: AgentWorkflowListSnapshot | null;
  loadAgentActionsSnapshot: () => Promise<unknown>;
  loadAgentWorkflowDetailSnapshot: (workflowRunId?: string) => Promise<unknown>;
  loadAgentWorkflowListSnapshot: () => Promise<unknown>;
  selectedWorkflowRunId: string;
  streamEvents: StreamEventRow[];
  streamStatus: "idle" | "connecting" | "live" | "error";
  threadId: string;
  inspectAgentThread: () => Promise<unknown>;
  loadPrimaryAgentThreadFromSession: () => Promise<unknown>;
  postAgentMessage: () => Promise<unknown>;
  runAgenticRespond: () => Promise<unknown>;
  setActingUserId: (value: string) => void;
  setAgentMessage: (value: string) => void;
  setSelectedWorkflowRunId: (value: string) => void;
  setStreamEvents: (value: StreamEventRow[]) => void;
  setThreadId: (value: string) => void;
  startAgentStream: () => void;
  stopAgentStream: () => void;
}) {
  const traceEntries = pickTraceEntries(agentTraceSnapshot);
  const primaryTraceEntry = traceEntries[0] ?? null;
  const primaryTraceDescriptor = primaryTraceEntry
    ? describeTraceEntry(primaryTraceEntry)
    : null;
  const notableTraceEntries = traceEntries.slice(0, 6).map((entry) => ({
    entry,
    ...describeTraceEntry(entry),
  }));
  const correlatedActions =
    agentActionsSnapshot?.items.filter((item) => item.threadId === threadId) ??
    [];

  return (
    <section className="mt-4 space-y-4">
      <Panel
        subtitle="Investigate agent-thread history, append test events, and observe SSE in real time."
        title="Agent Traces"
      >
        <div className="grid gap-3 md:grid-cols-2">
          <label className={adminLabelClass}>
            thread id
            <input
              className={adminInputClass}
              onChange={(event) => setThreadId(event.currentTarget.value)}
              value={threadId}
            />
          </label>
          <label className={adminLabelClass}>
            acting user id
            <input
              className={adminInputClass}
              onChange={(event) => setActingUserId(event.currentTarget.value)}
              value={actingUserId}
            />
          </label>
        </div>

        <label className={`${adminLabelClass} mt-3`}>
          inject message
          <textarea
            className={`${adminInputClass} min-h-24`}
            onChange={(event) => setAgentMessage(event.currentTarget.value)}
            value={agentMessage}
          />
        </label>

        <div className="mt-3 flex flex-wrap gap-2">
          <button
            className={adminButtonGhostClass}
            onClick={() => {
              void loadPrimaryAgentThreadFromSession();
            }}
            type="button"
          >
            Load my thread id
          </button>
          <button
            className={adminButtonClass}
            onClick={inspectAgentThread}
            type="button"
          >
            Inspect trace
          </button>
          <button
            className={adminButtonGhostClass}
            onClick={postAgentMessage}
            type="button"
          >
            Insert thread message
          </button>
          <button
            className={adminButtonClass}
            onClick={runAgenticRespond}
            type="button"
          >
            Run agentic respond
          </button>
          <button
            className={adminButtonGhostClass}
            onClick={() => {
              void loadAgentActionsSnapshot();
            }}
            type="button"
          >
            Load actions
          </button>
          <button
            className={adminButtonGhostClass}
            onClick={() => {
              void loadAgentWorkflowListSnapshot();
            }}
            type="button"
          >
            Load workflows
          </button>
          <button
            className={adminButtonGhostClass}
            onClick={startAgentStream}
            type="button"
          >
            Start live stream
          </button>
          <button
            className={adminButtonGhostClass}
            onClick={stopAgentStream}
            type="button"
          >
            Stop stream
          </button>
          <button
            className={adminButtonGhostClass}
            onClick={() => setStreamEvents([])}
            type="button"
          >
            Clear stream log
          </button>
          <span className="rounded-full border border-border px-3 py-2 text-xs text-foreground">
            stream: {streamStatus}
          </span>
        </div>
      </Panel>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel
          subtitle="Thread turns with status and checkpoint follow-through."
          title="Thread Follow-through"
        >
          {traceEntries.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No trace payload loaded yet. Inspect a thread to surface the turn
              timeline.
            </p>
          ) : (
            <div className="space-y-3">
              {primaryTraceEntry ? (
                <article className="rounded-lg border border-border bg-muted px-3 py-3">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">
                    Primary signal
                  </p>
                  <p className="mt-1 text-sm font-semibold text-foreground">
                    {primaryTraceDescriptor?.role ?? "entry"}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {primaryTraceDescriptor?.summary ??
                      "No summary on the leading entry."}
                  </p>
                </article>
              ) : null}
              <div className="space-y-2">
                {notableTraceEntries.map((row, index) => (
                  <details
                    className="rounded-lg border border-border bg-background px-3 py-3"
                    key={`${row.at ?? row.role}-${index}`}
                  >
                    <summary className="cursor-pointer list-none">
                      <p className="text-sm font-semibold text-foreground">
                        {row.role}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {row.at ?? "n/a"}
                        {row.status ? ` · ${row.status}` : ""}
                        {row.tool ? ` · ${row.tool}` : ""}
                      </p>
                    </summary>
                    {row.summary ? (
                      <p className="mt-2 text-xs text-muted-foreground">
                        {row.summary}
                      </p>
                    ) : null}
                    <div className="mt-2 rounded-md border border-border bg-muted px-3 py-2">
                      <JsonView value={row.entry} />
                    </div>
                  </details>
                ))}
              </div>
            </div>
          )}
        </Panel>
        <Panel
          subtitle="Raw trace payload and object-level drill-in."
          title="Thread Snapshot"
        >
          {agentTraceSnapshot ? (
            <JsonView value={agentTraceSnapshot} />
          ) : (
            <p className="text-sm text-muted-foreground">
              No thread snapshot loaded yet.
            </p>
          )}
        </Panel>
      </div>

      <Panel title="Live Stream Events">
        {streamEvents.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No stream events captured. Start stream to begin tracing.
          </p>
        ) : (
          <div className="space-y-2">
            {streamEvents.map((event) => (
              <details
                className="rounded-lg border border-border bg-muted px-3 py-2"
                key={event.id}
              >
                <summary className="cursor-pointer list-none">
                  <p className="text-xs text-muted-foreground">
                    {event.at} · {event.kind}
                  </p>
                </summary>
                <div className="mt-2">
                  <JsonView value={event.payload} />
                </div>
              </details>
            ))}
          </div>
        )}
      </Panel>

      <div className="grid gap-4 lg:grid-cols-[0.95fr_1.05fr]">
        <Panel
          subtitle="Recent tool actions correlated to the current thread id."
          title="Correlated Actions"
        >
          {threadId.trim().length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Load or enter a thread id to correlate actions.
            </p>
          ) : correlatedActions.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No correlated actions loaded for this thread yet.
            </p>
          ) : (
            <div className="space-y-2">
              {correlatedActions.slice(0, 5).map((item) => (
                <article
                  className="rounded-lg border border-border bg-muted px-3 py-3"
                  key={item.id}
                >
                  <p className="text-sm font-semibold text-foreground">
                    {item.tool ?? "unknown tool"} · {item.status ?? "unknown"}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    trace {item.traceId ?? "n/a"} · actor{" "}
                    {item.actorUserId ?? "n/a"}
                  </p>
                  {item.summary ? (
                    <p className="mt-1 text-xs text-muted-foreground">
                      {item.summary}
                    </p>
                  ) : null}
                  <p className="mt-1 text-xs text-muted-foreground">
                    {item.replayHint}
                  </p>
                </article>
              ))}
            </div>
          )}
        </Panel>

        <Panel
          subtitle="Workflow runs and selected detail to correlate thread behavior with orchestration state."
          title="Workflow Correlation"
        >
          <div className="flex flex-wrap gap-2">
            <button
              className={adminButtonGhostClass}
              onClick={() => {
                void loadAgentWorkflowListSnapshot();
              }}
              type="button"
            >
              Refresh workflows
            </button>
            <button
              className={adminButtonGhostClass}
              disabled={!selectedWorkflowRunId.trim()}
              onClick={() => {
                void loadAgentWorkflowDetailSnapshot(selectedWorkflowRunId);
              }}
              type="button"
            >
              Load selected detail
            </button>
          </div>
          <label className={`${adminLabelClass} mt-3`}>
            selected workflow run id
            <input
              className={adminInputClass}
              onChange={(event) =>
                setSelectedWorkflowRunId(event.currentTarget.value)
              }
              placeholder="workflow run id"
              value={selectedWorkflowRunId}
            />
          </label>
          {!agentWorkflowListSnapshot ? (
            <p className="mt-3 text-sm text-muted-foreground">
              No workflow list loaded yet.
            </p>
          ) : (
            <div className="mt-3 space-y-2">
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
                    trace {run.traceId ?? "n/a"} · replayability{" "}
                    {run.replayability}
                  </p>
                  {run.triage?.summary ? (
                    <p className="mt-1 text-xs text-muted-foreground">
                      {run.triage.summary}
                    </p>
                  ) : null}
                </button>
              ))}
            </div>
          )}
          <div className="mt-3">
            <JsonView
              emptyLabel="No workflow detail loaded."
              value={agentWorkflowDetailSnapshot}
            />
          </div>
        </Panel>
      </div>
    </section>
  );
}
