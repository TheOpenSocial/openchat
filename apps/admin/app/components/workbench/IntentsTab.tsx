import { JsonView } from "@/app/components/JsonView";
import { Panel } from "@/app/components/Panel";

export function IntentsTab({
  adminButtonClass,
  adminButtonGhostClass,
  adminInputClass,
  adminLabelClass,
  groupSizeTarget,
  intentActionSnapshot,
  intentExplainSnapshot,
  intentId,
  intentUserExplainSnapshot,
  threadId,
  userId,
  cancelIntent,
  convertIntent,
  inspectIntent,
  retryIntent,
  setGroupSizeTarget,
  setIntentId,
  setThreadId,
  setUserId,
  widenIntent,
}: {
  adminButtonClass: string;
  adminButtonGhostClass: string;
  adminInputClass: string;
  adminLabelClass: string;
  groupSizeTarget: number;
  intentActionSnapshot: unknown;
  intentExplainSnapshot: unknown;
  intentId: string;
  intentUserExplainSnapshot: unknown;
  threadId: string;
  userId: string;
  cancelIntent: () => Promise<unknown>;
  convertIntent: (mode: "group" | "one_to_one") => Promise<unknown>;
  inspectIntent: () => Promise<unknown>;
  retryIntent: () => Promise<unknown>;
  setGroupSizeTarget: (value: number) => void;
  setIntentId: (value: string) => void;
  setThreadId: (value: string) => void;
  setUserId: (value: string) => void;
  widenIntent: () => Promise<unknown>;
}) {
  return (
    <section className="mt-4 space-y-4">
      <Panel
        subtitle="Run intent follow-up superpowers without direct DB edits."
        title="Intent Controls"
      >
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <label className={adminLabelClass}>
            intent id
            <input
              className={adminInputClass}
              onChange={(event) => setIntentId(event.currentTarget.value)}
              placeholder="intent uuid"
              value={intentId}
            />
          </label>
          <label className={adminLabelClass}>
            user id (cancel)
            <input
              className={adminInputClass}
              onChange={(event) => setUserId(event.currentTarget.value)}
              value={userId}
            />
          </label>
          <label className={adminLabelClass}>
            agent thread id (optional)
            <input
              className={adminInputClass}
              onChange={(event) => setThreadId(event.currentTarget.value)}
              value={threadId}
            />
          </label>
          <label className={adminLabelClass}>
            group size target (2-4)
            <input
              className={adminInputClass}
              max={4}
              min={2}
              onChange={(event) =>
                setGroupSizeTarget(Number(event.currentTarget.value))
              }
              type="number"
              value={groupSizeTarget}
            />
          </label>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            className={adminButtonClass}
            onClick={inspectIntent}
            type="button"
          >
            Inspect explanations
          </button>
          <button
            className={adminButtonGhostClass}
            onClick={cancelIntent}
            type="button"
          >
            Force-cancel intent
          </button>
          <button
            className={adminButtonGhostClass}
            onClick={retryIntent}
            type="button"
          >
            Retry routing
          </button>
          <button
            className={adminButtonGhostClass}
            onClick={widenIntent}
            type="button"
          >
            Widen filters
          </button>
          <button
            className={adminButtonGhostClass}
            onClick={() => {
              convertIntent("group").catch(() => {});
            }}
            type="button"
          >
            Convert to group
          </button>
          <button
            className={adminButtonGhostClass}
            onClick={() => {
              convertIntent("one_to_one").catch(() => {});
            }}
            type="button"
          >
            Convert to 1:1
          </button>
        </div>
      </Panel>

      <div className="grid gap-4 lg:grid-cols-3">
        <Panel title="Admin Explanation">
          <JsonView value={intentExplainSnapshot} />
        </Panel>
        <Panel title="User-facing Explanation">
          <JsonView value={intentUserExplainSnapshot} />
        </Panel>
        <Panel title="Last Action Result">
          <JsonView value={intentActionSnapshot} />
        </Panel>
      </div>
    </section>
  );
}
