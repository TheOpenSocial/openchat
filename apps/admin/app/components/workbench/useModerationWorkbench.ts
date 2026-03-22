import { useEffect, useMemo, useState } from "react";

import type { HttpMethod } from "@/app/lib/api";

import type {
  ModerationFlagRow,
  ModerationSettingsSnapshot,
  ModerationSummarySnapshot,
} from "./moderation-shared";

interface BannerSetter {
  (value: { tone: "info" | "error" | "success"; text: string } | null): void;
}

interface UseModerationWorkbenchOptions {
  activeTab: string;
  requestApi: <T>(
    method: HttpMethod,
    path: string,
    options?: {
      body?: Record<string, unknown>;
      query?: Record<string, string | number | boolean | undefined>;
      headers?: Record<string, string>;
    },
  ) => Promise<T>;
  runAction: <T>(
    key: string,
    operation: () => Promise<T>,
    successText: string | ((payload: T) => string),
    onSuccess?: (payload: T) => void,
  ) => Promise<T | null>;
  setBanner: BannerSetter;
}

export function useModerationWorkbench({
  activeTab,
  requestApi,
  runAction,
  setBanner,
}: UseModerationWorkbenchOptions) {
  const [reporterUserId, setReporterUserId] = useState(
    "00000000-0000-0000-0000-000000000000",
  );
  const [targetUserId, setTargetUserId] = useState(
    "00000000-0000-0000-0000-000000000000",
  );
  const [reportReason, setReportReason] = useState("abuse");
  const [reportDetails, setReportDetails] = useState("");
  const [blockerUserId, setBlockerUserId] = useState(
    "00000000-0000-0000-0000-000000000000",
  );
  const [blockedUserId, setBlockedUserId] = useState(
    "00000000-0000-0000-0000-000000000000",
  );
  const [moderationSnapshot, setModerationSnapshot] = useState<unknown>(null);
  const [moderationSummarySnapshot, setModerationSummarySnapshot] =
    useState<ModerationSummarySnapshot | null>(null);
  const [moderationSettingsSnapshot, setModerationSettingsSnapshot] =
    useState<ModerationSettingsSnapshot | null>(null);
  const [moderationQueueSnapshot, setModerationQueueSnapshot] =
    useState<unknown>(null);
  const [auditLogSnapshot, setAuditLogSnapshot] = useState<unknown>(null);
  const [moderationQueueLimit, setModerationQueueLimit] = useState(100);
  const [moderationQueueStatusQuery, setModerationQueueStatusQuery] = useState<
    "open" | "resolved" | "dismissed"
  >("open");
  const [moderationQueueEntityTypeQuery, setModerationQueueEntityTypeQuery] =
    useState("");
  const [moderationQueueReasonQuery, setModerationQueueReasonQuery] =
    useState("");
  const [auditLogLimit, setAuditLogLimit] = useState(100);
  const [agentRiskSnapshot, setAgentRiskSnapshot] = useState<unknown>(null);
  const [agentRiskLimit, setAgentRiskLimit] = useState(50);
  const [agentRiskStatusQuery, setAgentRiskStatusQuery] = useState<
    "open" | "resolved" | "dismissed"
  >("open");
  const [agentRiskDecisionQuery, setAgentRiskDecisionQuery] = useState("");
  const [triageFlagId, setTriageFlagId] = useState("");
  const [triageAction, setTriageAction] = useState<
    "resolve" | "reopen" | "escalate_strike" | "restrict_user"
  >("resolve");
  const [triageTargetUserId, setTriageTargetUserId] = useState("");
  const [triageReason, setTriageReason] = useState("");
  const [assignFlagId, setAssignFlagId] = useState("");
  const [assigneeUserId, setAssigneeUserId] = useState("");
  const [assignReason, setAssignReason] = useState("");

  const moderationQueueItems = useMemo(() => {
    if (!Array.isArray(moderationQueueSnapshot)) {
      return [];
    }
    return moderationQueueSnapshot as ModerationFlagRow[];
  }, [moderationQueueSnapshot]);

  const agentRiskItems = useMemo(() => {
    if (
      !agentRiskSnapshot ||
      typeof agentRiskSnapshot !== "object" ||
      !("items" in agentRiskSnapshot) ||
      !Array.isArray((agentRiskSnapshot as { items?: unknown }).items)
    ) {
      return [];
    }
    return (agentRiskSnapshot as { items: ModerationFlagRow[] }).items;
  }, [agentRiskSnapshot]);

  const createReport = () =>
    runAction(
      "Create report",
      () =>
        requestApi("POST", "/moderation/reports", {
          body: {
            reporterUserId: reporterUserId.trim(),
            targetUserId:
              targetUserId.trim().length > 0 ? targetUserId.trim() : null,
            reason: reportReason.trim(),
            ...(reportDetails.trim() ? { details: reportDetails.trim() } : {}),
          },
        }),
      "Moderation report created.",
      (payload) => setModerationSnapshot(payload),
    );

  const createBlock = () =>
    runAction(
      "Create block",
      () =>
        requestApi("POST", "/moderation/blocks", {
          body: {
            blockerUserId: blockerUserId.trim(),
            blockedUserId: blockedUserId.trim(),
          },
        }),
      "User block created.",
      (payload) => setModerationSnapshot(payload),
    );

  const loadModerationSummary = () =>
    runAction(
      "Load moderation summary",
      () =>
        requestApi<ModerationSummarySnapshot>(
          "GET",
          "/admin/moderation/summary",
        ),
      "Moderation summary loaded.",
      (payload) => setModerationSummarySnapshot(payload),
    );

  const loadModerationSettings = () =>
    runAction(
      "Load moderation settings",
      () =>
        requestApi<ModerationSettingsSnapshot>(
          "GET",
          "/admin/moderation/settings",
        ),
      "Moderation settings loaded.",
      (payload) => setModerationSettingsSnapshot(payload),
    );

  const loadModerationQueue = () =>
    runAction(
      "Load moderation queue",
      () =>
        requestApi("GET", "/admin/moderation/queue", {
          query: {
            limit: moderationQueueLimit,
            status: moderationQueueStatusQuery,
            entityType:
              moderationQueueEntityTypeQuery.trim().length > 0
                ? moderationQueueEntityTypeQuery.trim()
                : undefined,
            reasonContains:
              moderationQueueReasonQuery.trim().length > 0
                ? moderationQueueReasonQuery.trim()
                : undefined,
          },
        }),
      "Moderation queue snapshot loaded.",
      (payload) => setModerationQueueSnapshot(payload),
    );

  const loadAuditLogs = () =>
    runAction(
      "Load audit logs",
      () =>
        requestApi("GET", "/admin/audit-logs", {
          query: { limit: auditLogLimit },
        }),
      "Audit log snapshot loaded.",
      (payload) => setAuditLogSnapshot(payload),
    );

  const loadAgentRiskFlags = () =>
    runAction(
      "Load agent risk flags",
      () =>
        requestApi("GET", "/admin/moderation/agent-risk-flags", {
          query: {
            limit: agentRiskLimit,
            status: agentRiskStatusQuery,
            ...(agentRiskDecisionQuery.trim() === "review" ||
            agentRiskDecisionQuery.trim() === "blocked"
              ? {
                  decision: agentRiskDecisionQuery.trim() as
                    | "review"
                    | "blocked",
                }
              : {}),
          },
        }),
      "Agent risk flags loaded.",
      (payload) => setAgentRiskSnapshot(payload),
    );

  const triageAgentRiskFlag = () => {
    if (!triageFlagId.trim()) {
      setBanner({ tone: "error", text: "Provide a moderation flag id." });
      return Promise.resolve(null);
    }

    const body: Record<string, unknown> = { action: triageAction };
    if (triageReason.trim()) {
      body.reason = triageReason.trim();
    }
    if (triageTargetUserId.trim()) {
      body.targetUserId = triageTargetUserId.trim();
    }

    return runAction(
      "Triage moderation flag",
      () =>
        requestApi(
          "POST",
          `/admin/moderation/flags/${triageFlagId.trim()}/triage`,
          { body },
        ),
      "Flag triage applied.",
      () => {
        void loadAgentRiskFlags();
      },
    );
  };

  const primeTriageFromFlag = (flag: ModerationFlagRow) => {
    setTriageFlagId(flag.id);
    setAssignFlagId(flag.id);
    setTriageReason(flag.reason);
    setAssignReason(flag.assignmentNote ?? "");
    setAssigneeUserId(flag.assigneeUserId ?? "");
  };

  const assignAgentRiskFlag = () => {
    if (!assignFlagId.trim() || !assigneeUserId.trim()) {
      setBanner({
        tone: "error",
        text: "Provide flag id and assignee user id.",
      });
      return Promise.resolve(null);
    }

    return runAction(
      "Assign moderation flag",
      () =>
        requestApi(
          "POST",
          `/admin/moderation/flags/${assignFlagId.trim()}/assign`,
          {
            body: {
              assigneeUserId: assigneeUserId.trim(),
              ...(assignReason.trim() ? { reason: assignReason.trim() } : {}),
            },
          },
        ),
      "Assignment recorded.",
      () => {
        void loadAgentRiskFlags();
      },
    );
  };

  useEffect(() => {
    if (activeTab !== "moderation") {
      return;
    }
    if (!moderationSummarySnapshot) {
      void loadModerationSummary();
    }
    if (!moderationSettingsSnapshot) {
      void loadModerationSettings();
    }
  }, [activeTab, moderationSettingsSnapshot, moderationSummarySnapshot]);

  return {
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
    setModerationSnapshot,
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
  };
}
