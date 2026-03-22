import { JsonView } from "@/app/components/JsonView";
import { Panel } from "@/app/components/Panel";
import { ModerationAgentRiskPanel } from "./ModerationAgentRiskPanel";
import { ModerationOperationsPanels } from "./ModerationOperationsPanels";
import { ModerationSummaryPanel } from "./ModerationSummaryPanel";
import type {
  ModerationFlagRow,
  ModerationSettingsSnapshot,
  ModerationSummarySnapshot,
} from "./moderation-shared";

export function ModerationTab({
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
  auditLogLimit,
  auditLogSnapshot,
  blockedUserId,
  blockerUserId,
  createBlock,
  createReport,
  loadAgentRiskFlags,
  loadAuditLogs,
  loadModerationQueue,
  loadModerationSettings,
  loadModerationSummary,
  moderationQueueEntityTypeQuery,
  moderationQueueItems,
  moderationQueueLimit,
  moderationQueueReasonQuery,
  moderationQueueSnapshot,
  moderationQueueStatusQuery,
  moderationSettingsSnapshot,
  moderationSnapshot,
  moderationSummarySnapshot,
  primeTriageFromFlag,
  reportDetails,
  reportReason,
  reporterUserId,
  setAgentRiskDecisionQuery,
  setAgentRiskLimit,
  setAgentRiskStatusQuery,
  setAssignFlagId,
  setAssignReason,
  setAssigneeUserId,
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
  setTriageAction,
  setTriageFlagId,
  setTriageReason,
  setTriageTargetUserId,
  targetUserId,
  triageAction,
  triageAgentRiskFlag,
  triageFlagId,
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
  auditLogLimit: number;
  auditLogSnapshot: unknown;
  blockedUserId: string;
  blockerUserId: string;
  createBlock: () => Promise<unknown>;
  createReport: () => Promise<unknown>;
  loadAgentRiskFlags: () => Promise<unknown>;
  loadAuditLogs: () => Promise<unknown>;
  loadModerationQueue: () => Promise<unknown>;
  loadModerationSettings: () => Promise<unknown>;
  loadModerationSummary: () => Promise<unknown>;
  moderationQueueEntityTypeQuery: string;
  moderationQueueItems: ModerationFlagRow[];
  moderationQueueLimit: number;
  moderationQueueReasonQuery: string;
  moderationQueueSnapshot: unknown;
  moderationQueueStatusQuery: "open" | "resolved" | "dismissed";
  moderationSettingsSnapshot: ModerationSettingsSnapshot | null;
  moderationSnapshot: unknown;
  moderationSummarySnapshot: ModerationSummarySnapshot | null;
  primeTriageFromFlag: (flag: ModerationFlagRow) => void;
  reportDetails: string;
  reportReason: string;
  reporterUserId: string;
  setAgentRiskDecisionQuery: (value: string) => void;
  setAgentRiskLimit: (value: number) => void;
  setAgentRiskStatusQuery: (value: "open" | "resolved" | "dismissed") => void;
  setAssignFlagId: (value: string) => void;
  setAssignReason: (value: string) => void;
  setAssigneeUserId: (value: string) => void;
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
  setTriageAction: (
    value: "resolve" | "reopen" | "escalate_strike" | "restrict_user",
  ) => void;
  setTriageFlagId: (value: string) => void;
  setTriageReason: (value: string) => void;
  setTriageTargetUserId: (value: string) => void;
  targetUserId: string;
  triageAction: "resolve" | "reopen" | "escalate_strike" | "restrict_user";
  triageAgentRiskFlag: () => Promise<unknown>;
  triageFlagId: string;
  triageReason: string;
  triageTargetUserId: string;
}) {
  return (
    <section className="mt-4 space-y-4">
      <ModerationSummaryPanel
        adminButtonClass={adminButtonClass}
        adminButtonGhostClass={adminButtonGhostClass}
        loadModerationSettings={loadModerationSettings}
        loadModerationSummary={loadModerationSummary}
        moderationSettingsSnapshot={moderationSettingsSnapshot}
        moderationSummarySnapshot={moderationSummarySnapshot}
        primeTriageFromFlag={primeTriageFromFlag}
      />
      <ModerationOperationsPanels
        adminButtonClass={adminButtonClass}
        adminButtonGhostClass={adminButtonGhostClass}
        adminInputClass={adminInputClass}
        adminLabelClass={adminLabelClass}
        auditLogLimit={auditLogLimit}
        auditLogSnapshot={auditLogSnapshot}
        blockedUserId={blockedUserId}
        blockerUserId={blockerUserId}
        createBlock={createBlock}
        createReport={createReport}
        loadAuditLogs={loadAuditLogs}
        loadModerationQueue={loadModerationQueue}
        moderationQueueEntityTypeQuery={moderationQueueEntityTypeQuery}
        moderationQueueItems={moderationQueueItems}
        moderationQueueLimit={moderationQueueLimit}
        moderationQueueReasonQuery={moderationQueueReasonQuery}
        moderationQueueSnapshot={moderationQueueSnapshot}
        moderationQueueStatusQuery={moderationQueueStatusQuery}
        moderationSnapshot={moderationSnapshot}
        primeTriageFromFlag={primeTriageFromFlag}
        reportDetails={reportDetails}
        reportReason={reportReason}
        reporterUserId={reporterUserId}
        setAuditLogLimit={setAuditLogLimit}
        setBlockedUserId={setBlockedUserId}
        setBlockerUserId={setBlockerUserId}
        setModerationQueueEntityTypeQuery={setModerationQueueEntityTypeQuery}
        setModerationQueueLimit={setModerationQueueLimit}
        setModerationQueueReasonQuery={setModerationQueueReasonQuery}
        setModerationQueueSnapshot={setModerationQueueSnapshot}
        setModerationQueueStatusQuery={setModerationQueueStatusQuery}
        setReportDetails={setReportDetails}
        setReportReason={setReportReason}
        setReporterUserId={setReporterUserId}
        setTargetUserId={setTargetUserId}
        targetUserId={targetUserId}
      />
      <ModerationAgentRiskPanel
        adminButtonClass={adminButtonClass}
        adminButtonGhostClass={adminButtonGhostClass}
        adminInputClass={adminInputClass}
        adminLabelClass={adminLabelClass}
        agentRiskDecisionQuery={agentRiskDecisionQuery}
        agentRiskItems={agentRiskItems}
        agentRiskLimit={agentRiskLimit}
        agentRiskSnapshot={agentRiskSnapshot}
        agentRiskStatusQuery={agentRiskStatusQuery}
        assignAgentRiskFlag={assignAgentRiskFlag}
        assignFlagId={assignFlagId}
        assignReason={assignReason}
        assigneeUserId={assigneeUserId}
        loadAgentRiskFlags={loadAgentRiskFlags}
        primeTriageFromFlag={primeTriageFromFlag}
        setAgentRiskDecisionQuery={setAgentRiskDecisionQuery}
        setAgentRiskLimit={setAgentRiskLimit}
        setAgentRiskStatusQuery={setAgentRiskStatusQuery}
        setAssignFlagId={setAssignFlagId}
        setAssignReason={setAssignReason}
        setAssigneeUserId={setAssigneeUserId}
        setTriageAction={setTriageAction}
        setTriageFlagId={setTriageFlagId}
        setTriageReason={setTriageReason}
        setTriageTargetUserId={setTriageTargetUserId}
        triageAction={triageAction}
        triageAgentRiskFlag={triageAgentRiskFlag}
        triageFlagId={triageFlagId}
        triageReason={triageReason}
        triageTargetUserId={triageTargetUserId}
      />
    </section>
  );
}
