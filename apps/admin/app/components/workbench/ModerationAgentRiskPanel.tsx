import { JsonView } from "@/app/components/JsonView";
import { Panel } from "@/app/components/Panel";

import type { ModerationFlagRow } from "./moderation-shared";

export function ModerationAgentRiskPanel({
  adminButtonClass,
  adminButtonGhostClass,
  adminInputClass,
  adminLabelClass,
  agentRiskDecisionQuery,
  agentRiskItems,
  agentRiskLimit,
  agentRiskSnapshot,
  agentRiskStatusQuery,
  assignAgentRiskFlag,
  assignFlagId,
  assignReason,
  assigneeUserId,
  loadAgentRiskFlags,
  primeTriageFromFlag,
  setAgentRiskDecisionQuery,
  setAgentRiskLimit,
  setAgentRiskStatusQuery,
  setAssignFlagId,
  setAssignReason,
  setAssigneeUserId,
  setTriageAction,
  setTriageDecisionId,
  setTriageFlagId,
  setTriageHumanReviewAction,
  setTriageReason,
  setTriageTargetUserId,
  submitDecisionReview,
  decisionReviewAction,
  decisionReviewId,
  decisionReviewNote,
  setDecisionReviewAction,
  setDecisionReviewId,
  setDecisionReviewNote,
  triageAction,
  triageDecisionId,
  triageAgentRiskFlag,
  triageFlagId,
  triageHumanReviewAction,
  triageReason,
  triageTargetUserId,
}: {
  adminButtonClass: string;
  adminButtonGhostClass: string;
  adminInputClass: string;
  adminLabelClass: string;
  agentRiskDecisionQuery: string;
  agentRiskItems: ModerationFlagRow[];
  agentRiskLimit: number;
  agentRiskSnapshot: unknown;
  agentRiskStatusQuery: "open" | "resolved" | "dismissed";
  assignAgentRiskFlag: () => Promise<unknown>;
  assignFlagId: string;
  assignReason: string;
  assigneeUserId: string;
  loadAgentRiskFlags: () => Promise<unknown>;
  primeTriageFromFlag: (flag: ModerationFlagRow) => void;
  setAgentRiskDecisionQuery: (value: string) => void;
  setAgentRiskLimit: (value: number) => void;
  setAgentRiskStatusQuery: (value: "open" | "resolved" | "dismissed") => void;
  setAssignFlagId: (value: string) => void;
  setAssignReason: (value: string) => void;
  setAssigneeUserId: (value: string) => void;
  setTriageAction: (
    value: "resolve" | "reopen" | "escalate_strike" | "restrict_user",
  ) => void;
  setTriageDecisionId: (value: string) => void;
  setTriageFlagId: (value: string) => void;
  setTriageHumanReviewAction: (
    value: "approve" | "reject" | "escalate",
  ) => void;
  setTriageReason: (value: string) => void;
  setTriageTargetUserId: (value: string) => void;
  submitDecisionReview: () => Promise<unknown>;
  decisionReviewAction: "approve" | "reject" | "escalate";
  decisionReviewId: string;
  decisionReviewNote: string;
  setDecisionReviewAction: (value: "approve" | "reject" | "escalate") => void;
  setDecisionReviewId: (value: string) => void;
  setDecisionReviewNote: (value: string) => void;
  triageAction: "resolve" | "reopen" | "escalate_strike" | "restrict_user";
  triageDecisionId: string;
  triageAgentRiskFlag: () => Promise<unknown>;
  triageFlagId: string;
  triageHumanReviewAction: "approve" | "reject" | "escalate";
  triageReason: string;
  triageTargetUserId: string;
}) {
  return (
    <Panel
      subtitle="Flags from conversational risk checks on agent threads; pair with audit action moderation.agent_risk_assessed."
      title="Agent thread risk flags"
    >
      <div className="grid gap-3 md:grid-cols-3">
        <label className={adminLabelClass}>
          limit
          <input
            className={adminInputClass}
            max={250}
            min={1}
            onChange={(event) =>
              setAgentRiskLimit(Number(event.currentTarget.value) || 50)
            }
            type="number"
            value={agentRiskLimit}
          />
        </label>
        <label className={adminLabelClass}>
          status
          <select
            className={adminInputClass}
            onChange={(event) =>
              setAgentRiskStatusQuery(
                event.currentTarget.value as "open" | "resolved" | "dismissed",
              )
            }
            value={agentRiskStatusQuery}
          >
            <option value="open">open</option>
            <option value="resolved">resolved</option>
            <option value="dismissed">dismissed</option>
          </select>
        </label>
        <label className={adminLabelClass}>
          decision filter (optional)
          <select
            className={adminInputClass}
            onChange={(event) =>
              setAgentRiskDecisionQuery(event.currentTarget.value)
            }
            value={agentRiskDecisionQuery}
          >
            <option value="">any</option>
            <option value="blocked">blocked</option>
            <option value="review">review</option>
          </select>
        </label>
      </div>
      <button
        className={`${adminButtonClass} mt-3`}
        onClick={() => void loadAgentRiskFlags()}
        type="button"
      >
        Load agent risk flags
      </button>
      <div className="mt-4 space-y-3">
        {agentRiskItems.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No agent risk flags loaded.
          </p>
        ) : (
          agentRiskItems.map((flag) => (
            <div
              className="rounded-lg border border-border bg-muted/40 p-4"
              key={flag.id}
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-foreground">
                    {flag.reason}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {flag.id} · thread {flag.entityId}
                  </p>
                </div>
                <span className="rounded-full border border-border px-3 py-1 text-xs uppercase tracking-wide text-muted-foreground">
                  {flag.status}
                </span>
              </div>
              {flag.latestAssignment ? (
                <p className="mt-2 text-xs text-muted-foreground">
                  Assigned: {JSON.stringify(flag.latestAssignment.metadata)}
                </p>
              ) : null}
              {flag.assigneeUserId ? (
                <p className="mt-2 text-xs text-muted-foreground">
                  Current assignee: {flag.assigneeUserId}
                </p>
              ) : null}
              {flag.assignmentNote ? (
                <p className="mt-2 text-xs text-muted-foreground">
                  Assignment note: {flag.assignmentNote}
                </p>
              ) : null}
              {flag.latestRiskAudit ? (
                <p className="mt-2 text-xs text-muted-foreground">
                  Risk audit: {JSON.stringify(flag.latestRiskAudit.metadata)}
                </p>
              ) : null}
              {flag.lastDecision ? (
                <p className="mt-2 text-xs text-muted-foreground">
                  Last decision: {flag.lastDecision}
                  {flag.triageNote ? ` · ${flag.triageNote}` : ""}
                </p>
              ) : null}
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
      <div className="mt-3 max-h-64 overflow-y-auto">
        <JsonView value={agentRiskSnapshot} />
      </div>
      <div className="mt-4 grid gap-3 border-t border-border pt-4 md:grid-cols-2">
        <div className="space-y-2">
          <p className="text-xs font-semibold text-muted-foreground">
            Triage flag
          </p>
          <label className={adminLabelClass}>
            flag id
            <input
              className={adminInputClass}
              onChange={(event) => setTriageFlagId(event.currentTarget.value)}
              value={triageFlagId}
            />
          </label>
          <label className={adminLabelClass}>
            action
            <select
              className={adminInputClass}
              onChange={(event) =>
                setTriageAction(
                  event.currentTarget.value as
                    | "resolve"
                    | "reopen"
                    | "escalate_strike"
                    | "restrict_user",
                )
              }
              value={triageAction}
            >
              <option value="resolve">resolve</option>
              <option value="reopen">reopen</option>
              <option value="escalate_strike">escalate_strike</option>
              <option value="restrict_user">restrict_user</option>
            </select>
          </label>
          <label className={adminLabelClass}>
            target user id (strike / restrict)
            <input
              className={adminInputClass}
              onChange={(event) =>
                setTriageTargetUserId(event.currentTarget.value)
              }
              value={triageTargetUserId}
            />
          </label>
          <label className={adminLabelClass}>
            reason (optional)
            <input
              className={adminInputClass}
              onChange={(event) => setTriageReason(event.currentTarget.value)}
              value={triageReason}
            />
          </label>
          <label className={adminLabelClass}>
            decision id (optional)
            <input
              className={adminInputClass}
              onChange={(event) =>
                setTriageDecisionId(event.currentTarget.value)
              }
              value={triageDecisionId}
            />
          </label>
          <label className={adminLabelClass}>
            human review action (decision id only)
            <select
              className={adminInputClass}
              onChange={(event) =>
                setTriageHumanReviewAction(
                  event.currentTarget.value as
                    | "approve"
                    | "reject"
                    | "escalate",
                )
              }
              value={triageHumanReviewAction}
            >
              <option value="approve">approve</option>
              <option value="reject">reject</option>
              <option value="escalate">escalate</option>
            </select>
          </label>
          <button
            className={adminButtonClass}
            onClick={() => void triageAgentRiskFlag()}
            type="button"
          >
            Apply triage
          </button>
        </div>
        <div className="space-y-2">
          <p className="text-xs font-semibold text-muted-foreground">
            Assign flag
          </p>
          <label className={adminLabelClass}>
            flag id
            <input
              className={adminInputClass}
              onChange={(event) => setAssignFlagId(event.currentTarget.value)}
              value={assignFlagId}
            />
          </label>
          <label className={adminLabelClass}>
            assignee user id
            <input
              className={adminInputClass}
              onChange={(event) => setAssigneeUserId(event.currentTarget.value)}
              value={assigneeUserId}
            />
          </label>
          <label className={adminLabelClass}>
            reason (optional)
            <input
              className={adminInputClass}
              onChange={(event) => setAssignReason(event.currentTarget.value)}
              value={assignReason}
            />
          </label>
          <button
            className={adminButtonClass}
            onClick={() => void assignAgentRiskFlag()}
            type="button"
          >
            Record assignment
          </button>
        </div>
        <div className="space-y-2">
          <p className="text-xs font-semibold text-muted-foreground">
            Direct decision review
          </p>
          <label className={adminLabelClass}>
            decision id
            <input
              className={adminInputClass}
              onChange={(event) =>
                setDecisionReviewId(event.currentTarget.value)
              }
              value={decisionReviewId}
            />
          </label>
          <label className={adminLabelClass}>
            action
            <select
              className={adminInputClass}
              onChange={(event) =>
                setDecisionReviewAction(
                  event.currentTarget.value as
                    | "approve"
                    | "reject"
                    | "escalate",
                )
              }
              value={decisionReviewAction}
            >
              <option value="approve">approve</option>
              <option value="reject">reject</option>
              <option value="escalate">escalate</option>
            </select>
          </label>
          <label className={adminLabelClass}>
            note (optional)
            <input
              className={adminInputClass}
              onChange={(event) =>
                setDecisionReviewNote(event.currentTarget.value)
              }
              value={decisionReviewNote}
            />
          </label>
          <button
            className={adminButtonClass}
            onClick={() => void submitDecisionReview()}
            type="button"
          >
            Submit decision review
          </button>
        </div>
      </div>
    </Panel>
  );
}
