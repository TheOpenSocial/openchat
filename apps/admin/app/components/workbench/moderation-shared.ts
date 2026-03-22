export interface ModerationFlagRow {
  id: string;
  entityType: string;
  entityId: string;
  reason: string;
  status: string;
  createdAt: string;
  assigneeUserId?: string | null;
  assignmentNote?: string | null;
  assignedAt?: string | null;
  lastDecision?: string | null;
  triageNote?: string | null;
  triagedByAdminUserId?: string | null;
  triagedAt?: string | null;
  latestRiskAudit?: {
    id: string;
    metadata: unknown;
    createdAt: string;
  } | null;
  latestAssignment?: {
    id: string;
    metadata: unknown;
    createdAt: string;
  } | null;
}

export interface ModerationReportRow {
  id: string;
  reporterUserId: string;
  targetUserId: string | null;
  reason: string;
  status: string;
  createdAt: string;
}

export interface ModerationSummarySnapshot {
  generatedAt: string;
  queue: {
    openFlags: number;
    agentRiskOpenFlags: number;
    reportsOpen: number;
  };
  actions24h: {
    reports24h: number;
    resolvedFlags24h: number;
    dismissedFlags24h: number;
  };
  enforcement: {
    blockedProfiles: number;
    suspendedUsers: number;
  };
  analytics: {
    avgTimeToAssignmentMinutes: number | null;
    avgTimeToDecisionMinutes: number | null;
    dismissalRate24h: number;
    repeatOffenders24h: number;
    topReasons: Array<{ reason: string; count: number }>;
  };
  recent: {
    flags: ModerationFlagRow[];
    reports: ModerationReportRow[];
  };
}

export interface ModerationSettingsSnapshot {
  provider: string;
  keys: {
    moderationProviderConfigured: boolean;
    openaiConfigured: boolean;
    customProviderConfigured: boolean;
  };
  toggles: {
    agentRiskEnabled: boolean;
    autoBlockTermsEnabled: boolean;
    strictMediaReview: boolean;
    userReportsEnabled: boolean;
  };
  thresholds: {
    moderationBacklogAlert: number;
    dbLatencyAlertMs: number;
    openAiErrorRateAlert: number;
  };
  policyModes: {
    agentBlockedDecisionLabel: string;
    agentReviewDecisionLabel: string;
  };
  surfaces: {
    profilePhotos: boolean;
    chatMessages: boolean;
    intents: boolean;
    agentThreads: boolean;
  };
}
