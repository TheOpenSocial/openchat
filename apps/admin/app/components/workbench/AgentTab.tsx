import { Panel } from "@/app/components/Panel";
import { JsonView } from "@/app/components/JsonView";

interface StreamEventRow {
  id: string;
  at: string;
  kind: string;
  payload: unknown;
}

export function AgentTab({
  actingUserId,
  adminButtonClass,
  adminButtonGhostClass,
  adminInputClass,
  adminLabelClass,
  agentMessage,
  agentTraceSnapshot,
  streamEvents,
  streamStatus,
  threadId,
  inspectAgentThread,
  loadPrimaryAgentThreadFromSession,
  postAgentMessage,
  runAgenticRespond,
  setActingUserId,
  setAgentMessage,
  setStreamEvents,
  setThreadId,
  startAgentStream,
  stopAgentStream,
}: {
  actingUserId: string;
  adminButtonClass: string;
  adminButtonGhostClass: string;
  adminInputClass: string;
  adminLabelClass: string;
  agentMessage: string;
  agentTraceSnapshot: unknown;
  streamEvents: StreamEventRow[];
  streamStatus: "idle" | "connecting" | "live" | "error";
  threadId: string;
  inspectAgentThread: () => Promise<unknown>;
  loadPrimaryAgentThreadFromSession: () => Promise<unknown>;
  postAgentMessage: () => Promise<unknown>;
  runAgenticRespond: () => Promise<unknown>;
  setActingUserId: (value: string) => void;
  setAgentMessage: (value: string) => void;
  setStreamEvents: (value: StreamEventRow[]) => void;
  setThreadId: (value: string) => void;
  startAgentStream: () => void;
  stopAgentStream: () => void;
}) {
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
        <Panel title="Thread Messages">
          <JsonView value={agentTraceSnapshot} />
        </Panel>
        <Panel title="Live Stream Events">
          {streamEvents.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No stream events captured. Start stream to begin tracing.
            </p>
          ) : (
            <div className="space-y-2">
              {streamEvents.map((event) => (
                <article
                  className="rounded-lg border border-border bg-muted px-3 py-2"
                  key={event.id}
                >
                  <p className="text-xs text-muted-foreground">
                    {event.at} · {event.kind}
                  </p>
                  <pre className="mt-1 max-h-28 overflow-auto text-xs text-foreground">
                    {JSON.stringify(event.payload, null, 2)}
                  </pre>
                </article>
              ))}
            </div>
          )}
        </Panel>
      </div>
    </section>
  );
}
