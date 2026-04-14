export type AdminTab =
  | "overview"
  | "users"
  | "intents"
  | "chats"
  | "moderation"
  | "personalization"
  | "agent";

export interface Banner {
  tone: "info" | "error" | "success";
  text: string;
}

export interface OnboardingActivationSnapshot {
  window: {
    hours: number;
    start: string;
    end: string;
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

export interface LlmRuntimeHealthSnapshot {
  generatedAt: string;
  onboarding: {
    calls: number;
    fallbackRate: number;
    unavailableRate: number;
    p95LatencyMs: number;
    byMode: {
      fast: {
        mode: "fast";
        calls: number;
        unavailable: number;
        unavailableRate: number;
        fallbacks: number;
        fallbackRate: number;
        avgLatencyMs: number;
        p95LatencyMs: number;
      } | null;
      rich: {
        mode: "rich";
        calls: number;
        unavailable: number;
        unavailableRate: number;
        fallbacks: number;
        fallbackRate: number;
        avgLatencyMs: number;
        p95LatencyMs: number;
      } | null;
    };
  };
  openai: {
    calls: number;
    errorRate: number;
    avgLatencyMs: number;
    operations: Array<{
      operation: string;
      calls: number;
      errors: number;
      errorRate: number;
      avgLatencyMs: number;
      p95LatencyMs: number;
      totalEstimatedCostUsd: number;
    }>;
  };
  budget: {
    clientCount: number;
    anyCircuitOpen: boolean;
    openCircuitCount: number;
  };
}

export interface LaunchControlsSnapshot {
  globalKillSwitch: boolean;
  inviteOnlyMode: boolean;
  alphaCohortUserIds: string[];
  enableNewIntents: boolean;
  enableAgentFollowups: boolean;
  enableGroupFormation: boolean;
  enablePushNotifications: boolean;
  enablePersonalization: boolean;
  enableDiscovery: boolean;
  enableModerationStrictness: boolean;
  enableModerationMessages: boolean;
  enableModerationAvatars: boolean;
  enableAiParsing: boolean;
  enableRealtimeChat: boolean;
  enableScheduledTasks: boolean;
  enableSavedSearches: boolean;
  enableRecurringBriefings: boolean;
  enableRecurringCircles: boolean;
  generatedAt: string;
}

export interface ProtocolQueueHealthSnapshot {
  generatedAt: string;
  summary: {
    appCount: number;
    queuedCount: number;
    retryingCount: number;
    deadLetteredCount: number;
    replayableCount: number;
  };
  apps: Array<{
    appId: string;
    appName: string | null;
    appStatus: string;
    queuedCount: number;
    retryingCount: number;
    deadLetteredCount: number;
    replayableCount: number;
    oldestQueuedAt: string | null;
    oldestRetryingAt: string | null;
    lastDeadLetteredAt: string | null;
  }>;
  deadLetterSample: Array<{
    deliveryId: string;
    appId: string;
    appName: string | null;
    subscriptionId: string;
    eventName: string;
    status: string;
    attemptCount: number;
    nextAttemptAt: string | null;
    lastAttemptAt: string | null;
    deliveredAt: string | null;
    responseStatusCode: number | null;
    errorMessage: string | null;
    createdAt: string;
    updatedAt: string;
  }>;
}

export interface SecurityPostureSnapshot {
  generatedAt: string;
  strictMode: boolean;
  strictStartupEnforcement: boolean;
  status: "healthy" | "watch" | "critical";
  environment: string;
  checks: Record<string, boolean>;
  violations: string[];
}

export interface VerificationRunsSnapshot {
  generatedAt: string;
  summary: {
    totalRuns: number;
    availableRuns: number;
    byStatus: {
      passed: number;
      failed: number;
      skipped: number;
    };
    byLane: {
      suite: number;
      verification: number;
      prodSmoke: number;
    };
    latestByLane: {
      suite: unknown | null;
      verification: unknown | null;
      prodSmoke: unknown | null;
    };
  };
  explainability: {
    summary: string;
    latestProblemRun: {
      runId: string;
      lane: string;
      status: string;
      canaryVerdict: string;
      blockedReasons: string[];
      stepId: string | null;
    } | null;
    laneCoverage: {
      suite: boolean;
      verification: boolean;
      prodSmoke: boolean;
    };
    allLanesHealthy: boolean;
    nextActions: Array<{
      id: string;
      label: string;
      endpoint: string;
      reason: string;
    }>;
  };
  runs: Array<{
    runId: string;
    lane: string;
    status: string;
    canaryVerdict: string;
    generatedAt: string;
  }>;
}

export interface AgentReliabilitySnapshot {
  generatedAt: string;
  canary: {
    verdict: "healthy" | "watch" | "critical";
    reasons: string[];
  };
  verification: {
    totalRuns: number;
    latest: {
      runId: string;
      status: string;
      canaryVerdict: string;
    } | null;
  };
  workflow: {
    totalRuns: number;
    topFailureStages: Array<{
      stage: string;
      status: string;
      count: number;
    }>;
  };
  explainability: {
    summary: string;
    nextActions: Array<{
      id: string;
      label: string;
      endpoint: string;
      reason: string;
    }>;
  };
}

export interface AgentOutcomesSnapshot {
  window: {
    days: number;
    start: string;
    end: string;
    followupEngagementHours: number;
  };
  summary: {
    totalActions: number;
    executedActions: number;
    deniedActions: number;
    failedActions: number;
  };
  toolAttempts: Array<{
    tool: string;
    attempted: number;
    executed: number;
    denied: number;
    failed: number;
  }>;
  introRequestAcceptance: {
    attempted: number;
    accepted: number;
    pending: number;
    rejected: number;
    cancelled: number;
    expired: number;
    settled: number;
    acceptanceRate: number | null;
    settledRate: number | null;
  };
  circleJoinConversion: {
    attempted: number;
    executed: number;
    converted: number;
    failed: number;
    conversionRate: number | null;
  };
  followupUsefulness: {
    scheduled: number;
    completedRuns: number;
    skippedRuns: number;
    failedRuns: number;
    engagedRuns: number;
    completionRate: number | null;
    usefulnessRate: number | null;
    engagementWindowHours: number;
  };
  explainability: {
    summary: string;
    topTool: {
      tool: string;
      attempted: number;
      executed: number;
      denied: number;
      failed: number;
    } | null;
    rates: {
      introAcceptanceRate: number | null;
      circleConversionRate: number | null;
      followupUsefulnessRate: number | null;
      followupCompletionRate: number | null;
    };
    nextActions: Array<{
      id: string;
      label: string;
      endpoint: string;
      reason: string;
    }>;
  };
}

export interface AgentActionsSnapshot {
  filters: {
    limit: number;
    tool: string | null;
    status: string | null;
    actorUserId: string | null;
    threadId: string | null;
    traceId: string | null;
  };
  explainability: {
    summary: string;
    statusCounts: {
      executed: number;
      denied: number;
      failed: number;
      pending: number;
      other: number;
    };
    primaryItem: {
      tool: string | null;
      status: string | null;
      checkpointStatus: string | null;
      checkpointDecisionReason: string | null;
    } | null;
    activeFilters: {
      limit: number;
      tool: string | null;
      status: string | null;
      actorUserId: string | null;
      threadId: string | null;
      traceId: string | null;
    };
    nextActions: Array<{
      id: string;
      label: string;
      endpoint: string;
      reason: string;
    }>;
  };
  items: Array<{
    id: string;
    actorUserId: string | null;
    threadId: string | null;
    createdAt: string;
    traceId: string | null;
    tool: string | null;
    status: string | null;
    role: string | null;
    reason: string | null;
    summary: string | null;
    input: unknown;
    output: unknown;
    thread: {
      title: string | null;
      createdAt: string;
    } | null;
    latestUserMessage: {
      id: string;
      content: string;
      createdAt: string;
    } | null;
    linkedCheckpoint: {
      id: string;
      actionType: string;
      tool: string | null;
      riskLevel: string | null;
      status: string;
      decisionReason: string | null;
      requestedByRole: string | null;
      createdAt: string;
      resolvedAt: string | null;
    } | null;
    relatedTraceEvents: Array<{
      id: string;
      action: string;
      entityType: string;
      entityId: string | null;
      createdAt: string;
      summary: string | null;
    }>;
    replayHint: string;
  }>;
}

export interface AgentWorkflowListSnapshot {
  generatedAt: string;
  summary: {
    totalRuns: number;
    runsWithCompletedStages: number;
    runsWithSideEffects: number;
    replayability: {
      replayable: number;
      partial: number;
      inspectOnly: number;
    };
    runsWithDedupedSideEffects: number;
    health: {
      healthy: number;
      watch: number;
      critical: number;
    };
    failureClasses: {
      none: number;
      llmOrSchema: number;
      moderationOrPolicy: number;
      matchingOrNegotiation: number;
      queueOrReplay: number;
      persistenceOrDedupe: number;
      notificationOrFollowup: number;
      latencyOrCapacity: number;
      observabilityGap: number;
    };
    topFailureStages: Array<{
      stage: string;
      status: "failed" | "blocked" | "degraded";
      count: number;
    }>;
    stageStatusCounts: {
      started: number;
      completed: number;
      skipped: number;
      blocked: number;
      degraded: number;
      failed: number;
      unknown: number;
    };
  };
  explainability: {
    summary: string;
    dominantFailureClass: {
      class: string;
      count: number;
    } | null;
    dominantFailureStage: {
      stage: string;
      status: string;
      count: number;
    } | null;
    healthCounts: {
      healthy: number;
      watch: number;
      critical: number;
    };
    nextActions: Array<{
      id: string;
      label: string;
      endpoint: string;
      reason: string;
    }>;
  };
  runs: Array<{
    workflowRunId: string;
    traceId: string | null;
    domain: string;
    replayability: "replayable" | "partial" | "inspect_only";
    health: "healthy" | "watch" | "critical";
    startedAt: string;
    completedAt: string | null;
    durationMs: number | null;
    stageStatusCounts: {
      started: number;
      completed: number;
      skipped: number;
      blocked: number;
      degraded: number;
      failed: number;
      unknown: number;
    };
    triage?: {
      summary?: string;
      nextActions?: Array<{
        id: string;
        label: string;
        endpoint: string;
        reason: string;
      }>;
    };
  }>;
}

export interface AgentWorkflowDetailSnapshot {
  generatedAt: string;
  run: unknown;
  trace: unknown;
  insights: unknown;
}

export interface SavedSearchRecord {
  id: string;
  userId: string;
  title: string;
  searchType: string;
  queryConfig: unknown;
  createdAt: string;
  updatedAt: string;
}

export interface ScheduledTaskRecord {
  id: string;
  userId: string;
  title: string;
  description: string | null;
  taskType: string;
  status: string;
  scheduleType: string;
  scheduleConfig: unknown;
  taskConfig: Record<string, unknown> | null;
  nextRunAt: string | null;
  lastRunAt: string | null;
  lastSuccessAt?: string | null;
  lastFailureAt?: string | null;
  lastFailureReason?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ScheduledTaskRunRecord {
  id: string;
  scheduledTaskId: string;
  userId: string;
  status: string;
  createdAt?: string;
  updatedAt?: string;
  triggeredAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  traceId: string | null;
  resultSummary?: string | null;
  resultPayload: unknown;
  createdNotificationId?: string | null;
  createdAgentMessageId?: string | null;
  errorMessage?: string | null;
}

export const tabConfig: Array<{
  id: AdminTab;
  label: string;
  subtitle: string;
}> = [
  {
    id: "overview",
    label: "Overview",
    subtitle:
      "Queue controls, health, dead-letter replay, and debug query helper",
  },
  {
    id: "users",
    label: "Users",
    subtitle: "Profile, trust, rules, sessions, inbox, and digest",
  },
  {
    id: "intents",
    label: "Intents",
    subtitle: "Inspect explanations and run follow-up superpowers",
  },
  {
    id: "chats",
    label: "Chats",
    subtitle: "Inspect metadata/sync and run stuck-flow repair actions",
  },
  {
    id: "moderation",
    label: "Moderation",
    subtitle:
      "Reports, blocks, queue, agent-thread risk flags (triage / assign)",
  },
  {
    id: "personalization",
    label: "Personalization",
    subtitle: "Inspect life graph and explain policy decisions",
  },
  {
    id: "agent",
    label: "Agent",
    subtitle: "Inspect thread traces with live SSE stream viewer",
  },
];

export function tabSubtitle(tab: AdminTab) {
  return tabConfig.find((entry) => entry.id === tab)?.subtitle ?? "";
}
