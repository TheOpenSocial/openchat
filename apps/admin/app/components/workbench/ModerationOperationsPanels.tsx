import { JsonView } from "@/app/components/JsonView";
import { Panel } from "@/app/components/Panel";

import type { ModerationFlagRow } from "./moderation-shared";

export function ModerationOperationsPanels({
  adminButtonClass,
  adminButtonGhostClass,
  adminInputClass,
  adminLabelClass,
  auditLogLimit,
  auditLogSnapshot,
  blockedUserId,
  blockerUserId,
  createBlock,
  createReport,
  loadAuditLogs,
  loadModerationQueue,
  moderationQueueEntityTypeQuery,
  moderationQueueItems,
  moderationQueueLimit,
  moderationQueueReasonQuery,
  moderationQueueSnapshot,
  moderationQueueStatusQuery,
  moderationSnapshot,
  primeTriageFromFlag,
  reportDetails,
  reportReason,
  reporterUserId,
  setAuditLogLimit,
  setBlockedUserId,
  setBlockerUserId,
  setModerationQueueEntityTypeQuery,
  setModerationQueueLimit,
  setModerationQueueReasonQuery,
  setModerationQueueSnapshot,
  setModerationQueueStatusQuery,
  setReportDetails,
  setReportReason,
  setReporterUserId,
  setTargetUserId,
  targetUserId,
}: {
  adminButtonClass: string;
  adminButtonGhostClass: string;
  adminInputClass: string;
  adminLabelClass: string;
  auditLogLimit: number;
  auditLogSnapshot: unknown;
  blockedUserId: string;
  blockerUserId: string;
  createBlock: () => Promise<unknown>;
  createReport: () => Promise<unknown>;
  loadAuditLogs: () => Promise<unknown>;
  loadModerationQueue: () => Promise<unknown>;
  moderationQueueEntityTypeQuery: string;
  moderationQueueItems: ModerationFlagRow[];
  moderationQueueLimit: number;
  moderationQueueReasonQuery: string;
  moderationQueueSnapshot: unknown;
  moderationQueueStatusQuery: "open" | "resolved" | "dismissed";
  moderationSnapshot: unknown;
  primeTriageFromFlag: (flag: ModerationFlagRow) => void;
  reportDetails: string;
  reportReason: string;
  reporterUserId: string;
  setAuditLogLimit: (value: number) => void;
  setBlockedUserId: (value: string) => void;
  setBlockerUserId: (value: string) => void;
  setModerationQueueEntityTypeQuery: (value: string) => void;
  setModerationQueueLimit: (value: number) => void;
  setModerationQueueReasonQuery: (value: string) => void;
  setModerationQueueSnapshot: (value: unknown) => void;
  setModerationQueueStatusQuery: (
    value: "open" | "resolved" | "dismissed",
  ) => void;
  setReportDetails: (value: string) => void;
  setReportReason: (value: string) => void;
  setReporterUserId: (value: string) => void;
  setTargetUserId: (value: string) => void;
  targetUserId: string;
}) {
  return (
    <>
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel subtitle="Create moderation report records." title="Report User">
          <div className="grid gap-3 md:grid-cols-2">
            <label className={adminLabelClass}>
              reporter user id
              <input
                className={adminInputClass}
                onChange={(event) =>
                  setReporterUserId(event.currentTarget.value)
                }
                value={reporterUserId}
              />
            </label>
            <label className={adminLabelClass}>
              target user id (optional)
              <input
                className={adminInputClass}
                onChange={(event) => setTargetUserId(event.currentTarget.value)}
                value={targetUserId}
              />
            </label>
          </div>
          <label className={`${adminLabelClass} mt-3`}>
            reason
            <input
              className={adminInputClass}
              onChange={(event) => setReportReason(event.currentTarget.value)}
              value={reportReason}
            />
          </label>
          <label className={`${adminLabelClass} mt-3`}>
            details
            <textarea
              className={`${adminInputClass} min-h-24`}
              onChange={(event) => setReportDetails(event.currentTarget.value)}
              value={reportDetails}
            />
          </label>
          <button
            className={`${adminButtonClass} mt-3`}
            onClick={createReport}
            type="button"
          >
            Create report
          </button>
        </Panel>

        <Panel
          subtitle="Block relationships for safety enforcement."
          title="Block User"
        >
          <div className="grid gap-3 md:grid-cols-2">
            <label className={adminLabelClass}>
              blocker user id
              <input
                className={adminInputClass}
                onChange={(event) =>
                  setBlockerUserId(event.currentTarget.value)
                }
                value={blockerUserId}
              />
            </label>
            <label className={adminLabelClass}>
              blocked user id
              <input
                className={adminInputClass}
                onChange={(event) =>
                  setBlockedUserId(event.currentTarget.value)
                }
                value={blockedUserId}
              />
            </label>
          </div>
          <button
            className={`${adminButtonClass} mt-3`}
            onClick={createBlock}
            type="button"
          >
            Create block
          </button>
        </Panel>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Panel title="Moderation Result">
          <JsonView value={moderationSnapshot} />
        </Panel>
        <Panel
          subtitle="Filter open or resolved items and drill into flagged content quickly."
          title="Moderation Queue"
        >
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <label className={adminLabelClass}>
              limit
              <input
                className={adminInputClass}
                max={250}
                min={1}
                onChange={(event) =>
                  setModerationQueueLimit(
                    Number(event.currentTarget.value) || 100,
                  )
                }
                type="number"
                value={moderationQueueLimit}
              />
            </label>
            <label className={adminLabelClass}>
              status
              <select
                className={adminInputClass}
                onChange={(event) =>
                  setModerationQueueStatusQuery(
                    event.currentTarget.value as
                      | "open"
                      | "resolved"
                      | "dismissed",
                  )
                }
                value={moderationQueueStatusQuery}
              >
                <option value="open">open</option>
                <option value="resolved">resolved</option>
                <option value="dismissed">dismissed</option>
              </select>
            </label>
            <label className={adminLabelClass}>
              entity type (optional)
              <input
                className={adminInputClass}
                onChange={(event) =>
                  setModerationQueueEntityTypeQuery(event.currentTarget.value)
                }
                placeholder="agent_thread"
                value={moderationQueueEntityTypeQuery}
              />
            </label>
            <label className={adminLabelClass}>
              reason contains
              <input
                className={adminInputClass}
                onChange={(event) =>
                  setModerationQueueReasonQuery(event.currentTarget.value)
                }
                placeholder="threat"
                value={moderationQueueReasonQuery}
              />
            </label>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              className={adminButtonClass}
              onClick={loadModerationQueue}
              type="button"
            >
              Load moderation queue
            </button>
            <button
              className={adminButtonGhostClass}
              onClick={() => setModerationQueueSnapshot(null)}
              type="button"
            >
              Clear
            </button>
          </div>
          <div className="mt-4 space-y-3">
            {moderationQueueItems.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No moderation queue items loaded.
              </p>
            ) : (
              moderationQueueItems.map((flag) => (
                <div
                  className="rounded-lg border border-border bg-muted/40 p-4"
                  key={flag.id}
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-foreground">
                        {flag.entityType}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {flag.id} · {flag.entityId}
                      </p>
                    </div>
                    <span className="rounded-full border border-border px-3 py-1 text-xs uppercase tracking-wide text-muted-foreground">
                      {flag.status}
                    </span>
                  </div>
                  <p className="mt-3 text-sm text-foreground">{flag.reason}</p>
                  <div className="mt-2 space-y-1 text-xs text-muted-foreground">
                    {flag.queuePriority ? (
                      <p>Priority: {flag.queuePriority}</p>
                    ) : null}
                    {flag.slaBand ? <p>SLA band: {flag.slaBand}</p> : null}
                    {typeof flag.ageMinutes === "number" ? (
                      <p>Age: {flag.ageMinutes} min</p>
                    ) : null}
                    {flag.assigneeUserId ? (
                      <p>Assignee: {flag.assigneeUserId}</p>
                    ) : null}
                    {flag.assignmentNote ? (
                      <p>Assignment note: {flag.assignmentNote}</p>
                    ) : null}
                    {flag.lastDecision ? (
                      <p>Last decision: {flag.lastDecision}</p>
                    ) : null}
                    {flag.triageNote ? (
                      <p>Triage note: {flag.triageNote}</p>
                    ) : null}
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      className={adminButtonGhostClass}
                      onClick={() => primeTriageFromFlag(flag)}
                      type="button"
                    >
                      Use in triage
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
          <div className="mt-4">
            <JsonView value={moderationQueueSnapshot} />
          </div>
        </Panel>
        <Panel subtitle="Load from /api/admin/audit-logs." title="Audit Logs">
          <label className={adminLabelClass}>
            limit
            <input
              className={adminInputClass}
              max={250}
              min={1}
              onChange={(event) =>
                setAuditLogLimit(Number(event.currentTarget.value) || 100)
              }
              type="number"
              value={auditLogLimit}
            />
          </label>
          <button
            className={`${adminButtonClass} mt-3`}
            onClick={loadAuditLogs}
            type="button"
          >
            Load audit logs
          </button>
          <div className="mt-3">
            <JsonView value={auditLogSnapshot} />
          </div>
        </Panel>
      </div>
    </>
  );
}
