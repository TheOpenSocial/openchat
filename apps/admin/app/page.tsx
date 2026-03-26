"use client";

export const dynamic = "force-dynamic";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";

import { AdminShell } from "./components/AdminShell";
import { AdminSignIn } from "./components/AdminSignIn";
import { AppLoading } from "./components/AppLoading";
import { useAdminApiActions } from "./components/workbench/useAdminApiActions";
import { useAgentStream } from "./components/workbench/useAgentStream";
import { WorkbenchContent } from "./components/workbench/WorkbenchContent";
import { useWorkbenchState } from "./components/workbench/useWorkbenchState";
import { useModerationWorkbench } from "./components/workbench/useModerationWorkbench";
import { useAdminSessionLifecycle } from "./components/workbench/useAdminSessionLifecycle";
import { useOpsSnapshotsActions } from "./components/workbench/useOpsSnapshotsActions";
import { useEntityInspectorActions } from "./components/workbench/useEntityInspectorActions";
import { useAgentDebugActions } from "./components/workbench/useAgentDebugActions";
import { parseContextInput } from "./components/workbench/workbench-utils";
import {
  type AdminTab,
  tabConfig,
  tabSubtitle,
} from "./components/workbench/workbench-config";
import {
  adminButtonClass,
  adminButtonDangerClass,
  adminButtonGhostClass,
  adminInputClass,
  adminLabelClass,
} from "./lib/admin-ui";
import { type AppLocale, supportedLocales, t } from "./lib/i18n";

const ADMIN_LOCALE_STORAGE_KEY = "opensocial.admin.locale.v1";

function AdminHomeContent() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [locale, setLocale] = useState<AppLocale>("en");
  const {
    DEFAULT_UUID,
    activeTab,
    setActiveTab,
    busyKey,
    setBusyKey,
    banner,
    setBanner,
    health,
    setHealth,
    relayCount,
    setRelayCount,
    onboardingActivationSnapshot,
    setOnboardingActivationSnapshot,
    llmRuntimeHealthSnapshot,
    setLlmRuntimeHealthSnapshot,
    deadLetters,
    setDeadLetters,
    adminUserId,
    setAdminUserId,
    adminRole,
    setAdminRole,
    userId,
    setUserId,
    intentId,
    setIntentId,
    chatId,
    setChatId,
    threadId,
    setThreadId,
    revokeSessionId,
    setRevokeSessionId,
    actingUserId,
    setActingUserId,
    messageId,
    setMessageId,
    moderatorUserId,
    setModeratorUserId,
    hideReason,
    setHideReason,
    syncAfter,
    setSyncAfter,
    groupSizeTarget,
    setGroupSizeTarget,
    policyContextInput,
    setPolicyContextInput,
    policyFlags,
    setPolicyFlags,
    agentMessage,
    setAgentMessage,
    debugMethod,
    setDebugMethod,
    debugPath,
    setDebugPath,
    debugQueryInput,
    setDebugQueryInput,
    debugBodyInput,
    setDebugBodyInput,
    debugResponse,
    setDebugResponse,
    debugHistory,
    setDebugHistory,
    streamStatus,
    setStreamStatus,
    streamEvents,
    setStreamEvents,
    streamRef,
    profileSnapshot,
    setProfileSnapshot,
    trustSnapshot,
    setTrustSnapshot,
    ruleSnapshot,
    setRuleSnapshot,
    interestSnapshot,
    setInterestSnapshot,
    topicSnapshot,
    setTopicSnapshot,
    availabilitySnapshot,
    setAvailabilitySnapshot,
    photoSnapshot,
    setPhotoSnapshot,
    sessionSnapshot,
    setSessionSnapshot,
    inboxSnapshot,
    setInboxSnapshot,
    recurringCircleSnapshot,
    setRecurringCircleSnapshot,
    recurringCircleSessionSnapshot,
    setRecurringCircleSessionSnapshot,
    savedSearchSnapshot,
    setSavedSearchSnapshot,
    scheduledTaskSnapshot,
    setScheduledTaskSnapshot,
    scheduledTaskRunsSnapshot,
    setScheduledTaskRunsSnapshot,
    discoveryPassiveSnapshot,
    setDiscoveryPassiveSnapshot,
    discoveryInboxSnapshot,
    setDiscoveryInboxSnapshot,
    pendingIntentSummarySnapshot,
    setPendingIntentSummarySnapshot,
    continuityIntentExplainSnapshot,
    setContinuityIntentExplainSnapshot,
    searchQuery,
    setSearchQuery,
    searchSnapshot,
    setSearchSnapshot,
    intentExplainSnapshot,
    setIntentExplainSnapshot,
    intentUserExplainSnapshot,
    setIntentUserExplainSnapshot,
    intentActionSnapshot,
    setIntentActionSnapshot,
    chatMessagesSnapshot,
    setChatMessagesSnapshot,
    chatMetadataSnapshot,
    setChatMetadataSnapshot,
    chatSyncSnapshot,
    setChatSyncSnapshot,
    deactivateReason,
    setDeactivateReason,
    restrictReason,
    setRestrictReason,
    lifeGraphSnapshot,
    setLifeGraphSnapshot,
    policyExplainSnapshot,
    setPolicyExplainSnapshot,
    memoryResetSnapshot,
    setMemoryResetSnapshot,
    agentTraceSnapshot,
    setAgentTraceSnapshot,
  } = useWorkbenchState();

  useEffect(() => {
    const tab = searchParams.get("tab");
    if (
      tab === "overview" ||
      tab === "users" ||
      tab === "intents" ||
      tab === "chats" ||
      tab === "moderation" ||
      tab === "personalization" ||
      tab === "agent"
    ) {
      setActiveTab(tab);
    }
  }, [searchParams]);

  useEffect(() => {
    const params = new URLSearchParams(searchParams.toString());
    if (params.get("tab") === activeTab) {
      return;
    }
    params.set("tab", activeTab);
    const next = params.toString();
    router.replace(next.length ? `${pathname}?${next}` : pathname, {
      scroll: false,
    });
  }, [activeTab, pathname, router, searchParams]);

  const summary = useMemo(
    () =>
      `health=${health} · deadLetters=${deadLetters.length} · relay=${relayCount ?? "n/a"}`,
    [deadLetters.length, health, relayCount],
  );

  const {
    sessionHydrated,
    signedInSession,
    signInError,
    signOut,
    startGoogleSignIn,
  } = useAdminSessionLifecycle({
    defaultAdminUserId: DEFAULT_UUID,
    setAdminUserId,
  });

  const { requestApi, requestApiNullable, runAction } = useAdminApiActions({
    accessToken: signedInSession?.accessToken,
    adminRole,
    adminUserId,
    setBusyKey,
    setBanner,
  });

  const {
    refreshHealth,
    loadDeadLetters,
    replayDeadLetter,
    relayOutbox,
    loadOnboardingActivationSnapshot,
    loadLlmRuntimeHealthSnapshot,
  } = useOpsSnapshotsActions({
    requestApi,
    runAction,
    setHealth,
    setDeadLetters,
    setRelayCount,
    setOnboardingActivationSnapshot,
    setLlmRuntimeHealthSnapshot,
  });

  const { startAgentStream, stopAgentStream } = useAgentStream({
    accessToken: signedInSession?.accessToken,
    setBanner,
    setStreamEvents,
    setStreamStatus,
    streamRef,
    threadId,
  });

  useEffect(
    () => () => {
      stopAgentStream();
    },
    [],
  );

  useEffect(() => {
    if (!signedInSession) {
      stopAgentStream();
    }
  }, [signedInSession, stopAgentStream]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    const stored = window.localStorage.getItem(ADMIN_LOCALE_STORAGE_KEY);
    if (stored && supportedLocales.includes(stored as AppLocale)) {
      setLocale(stored as AppLocale);
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    window.localStorage.setItem(ADMIN_LOCALE_STORAGE_KEY, locale);
  }, [locale]);

  useEffect(() => {
    if (!sessionHydrated || !signedInSession) {
      return;
    }

    refreshHealth().catch(() => {});
    const timer = setInterval(() => {
      refreshHealth().catch(() => {});
    }, 15_000);

    return () => clearInterval(timer);
  }, [refreshHealth, sessionHydrated, signedInSession]);

  const {
    inspectUser,
    sendDigest,
    summarizePendingIntents,
    runSearch,
    revokeSession,
    revokeAllSessions,
    inspectIntent,
    cancelIntent,
    retryIntent,
    widenIntent,
    convertIntent,
    inspectChat,
    syncChat,
    leaveChat,
    hideChatMessage,
    repairChatFlow,
  } = useEntityInspectorActions({
    requestApi,
    runAction,
    setBanner,
    userId,
    intentId,
    chatId,
    threadId,
    revokeSessionId,
    actingUserId,
    messageId,
    moderatorUserId,
    hideReason,
    syncAfter,
    groupSizeTarget,
    searchQuery,
    setProfileSnapshot,
    setTrustSnapshot,
    setRuleSnapshot,
    setInterestSnapshot,
    setTopicSnapshot,
    setAvailabilitySnapshot,
    setPhotoSnapshot,
    setSessionSnapshot,
    setInboxSnapshot,
    setRecurringCircleSnapshot,
    setRecurringCircleSessionSnapshot,
    setSavedSearchSnapshot,
    setScheduledTaskSnapshot,
    setScheduledTaskRunsSnapshot,
    setDiscoveryPassiveSnapshot,
    setDiscoveryInboxSnapshot,
    setPendingIntentSummarySnapshot,
    setContinuityIntentExplainSnapshot,
    setIntentActionSnapshot,
    setSearchSnapshot,
    setIntentExplainSnapshot,
    setIntentUserExplainSnapshot,
    setChatMessagesSnapshot,
    setChatMetadataSnapshot,
    setChatSyncSnapshot,
    setRelayCount,
  });

  const moderation = useModerationWorkbench({
    activeTab,
    requestApi,
    runAction,
    setBanner,
  });

  const deactivateUser = () => {
    if (!userId.trim()) {
      setBanner({ tone: "error", text: "Provide a user id." });
      return Promise.resolve(null);
    }

    return runAction(
      "Deactivate account",
      () =>
        requestApi("POST", `/admin/users/${userId.trim()}/deactivate`, {
          body: {
            reason: deactivateReason.trim(),
          },
        }),
      "Account deactivated.",
      (payload) => moderation.setModerationSnapshot(payload),
    );
  };

  const restrictUser = () => {
    if (!userId.trim()) {
      setBanner({ tone: "error", text: "Provide a user id." });
      return Promise.resolve(null);
    }

    return runAction(
      "Restrict account",
      () =>
        requestApi("POST", `/admin/users/${userId.trim()}/restrict`, {
          body: {
            reason: restrictReason.trim(),
          },
        }),
      "Account restriction applied.",
      (payload) => moderation.setModerationSnapshot(payload),
    );
  };

  const inspectLifeGraph = () =>
    runAction(
      "Inspect life graph",
      () => requestApi("GET", `/personalization/${userId.trim()}/life-graph`),
      "Life graph snapshot loaded.",
      (payload) => setLifeGraphSnapshot(payload),
    );

  const explainPolicy = () =>
    runAction(
      "Explain policy",
      async () => {
        const context = parseContextInput(policyContextInput);
        return requestApi(
          "POST",
          `/personalization/${userId.trim()}/policy/explain`,
          {
            body: {
              ...policyFlags,
              ...(context ? { context } : {}),
            },
          },
        );
      },
      "Policy explanation generated.",
      (payload) => setPolicyExplainSnapshot(payload),
    );

  const resetLearnedMemory = () =>
    runAction(
      "Reset learned memory",
      () =>
        requestApi("POST", `/privacy/${userId.trim()}/memory/reset`, {
          body: {
            actorUserId: userId.trim(),
            mode: "learned_memory",
            reason: "admin_panel_manual_reset",
          },
        }),
      "Learned memory reset completed.",
      (payload) => setMemoryResetSnapshot(payload),
    );

  const {
    inspectAgentThread,
    loadPrimaryAgentThreadFromSession,
    postAgentMessage,
    runAgenticRespond,
    executeDebugQuery,
  } = useAgentDebugActions({
    requestApi,
    requestApiNullable,
    runAction,
    setBanner,
    setBusyKey,
    threadId,
    setThreadId,
    actingUserId,
    agentMessage,
    debugMethod,
    debugPath,
    debugQueryInput,
    debugBodyInput,
    setAgentTraceSnapshot,
    setDebugResponse,
    setDebugHistory,
  });

  if (!sessionHydrated) {
    return <AppLoading label="Restoring session…" />;
  }

  if (!signedInSession) {
    return (
      <AdminSignIn errorText={signInError} onGoogleSignIn={startGoogleSignIn} />
    );
  }

  const sessionLabel =
    signedInSession.displayName?.trim() ||
    signedInSession.email?.trim() ||
    signedInSession.userId.slice(0, 8);

  return (
    <AdminShell
      activeId={activeTab}
      busyKey={busyKey}
      busyPrefixLabel={t("busyPrefix", locale)}
      navItems={tabConfig.map((tab) => ({ id: tab.id, label: tab.label }))}
      locale={locale}
      localeEnglishLabel={t("english", locale)}
      localeLabel={t("language", locale)}
      localeSpanishLabel={t("spanish", locale)}
      onNavigate={(id) => setActiveTab(id as AdminTab)}
      onLocaleChange={setLocale}
      onSignOut={signOut}
      operatorContextNote={t("operatorContextNote", locale)}
      readyLabel={t("ready", locale)}
      sessionLabel={sessionLabel}
      sessionTitle={
        signedInSession.email ??
        signedInSession.displayName ??
        signedInSession.userId
      }
      signOutLabel={t("signOut", locale)}
      activeDescription={tabSubtitle(activeTab)}
      subtitle="OpenSocial"
      summary={summary}
      title="Operations workbench"
    >
      <WorkbenchContent
        activeTab={activeTab}
        agentProps={{
          actingUserId,
          adminButtonClass,
          adminButtonGhostClass,
          adminInputClass,
          adminLabelClass,
          agentMessage,
          agentTraceSnapshot,
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
          streamEvents,
          streamStatus,
          threadId,
        }}
        banner={banner}
        chatsProps={{
          actingUserId,
          adminButtonClass,
          adminButtonDangerClass,
          adminButtonGhostClass,
          adminInputClass,
          adminLabelClass,
          chatId,
          chatMessagesSnapshot,
          chatMetadataSnapshot,
          chatSyncSnapshot,
          hideChatMessage,
          hideReason,
          inspectChat,
          leaveChat,
          messageId,
          moderatorUserId,
          repairChatFlow,
          setActingUserId,
          setChatId,
          setHideReason,
          setMessageId,
          setModeratorUserId,
          setSyncAfter,
          syncAfter,
          syncChat,
        }}
        intentsProps={{
          adminButtonClass,
          adminButtonGhostClass,
          adminInputClass,
          adminLabelClass,
          cancelIntent,
          convertIntent,
          groupSizeTarget,
          inspectIntent,
          intentActionSnapshot,
          intentExplainSnapshot,
          intentId,
          intentUserExplainSnapshot,
          retryIntent,
          setGroupSizeTarget,
          setIntentId,
          setThreadId,
          setUserId,
          threadId,
          userId,
          widenIntent,
        }}
        moderationProps={{
          adminButtonClass,
          adminButtonGhostClass,
          adminInputClass,
          adminLabelClass,
          agentRiskDecisionQuery: moderation.agentRiskDecisionQuery,
          agentRiskItems: moderation.agentRiskItems,
          agentRiskLimit: moderation.agentRiskLimit,
          agentRiskSnapshot: moderation.agentRiskSnapshot,
          agentRiskStatusQuery: moderation.agentRiskStatusQuery,
          assignAgentRiskFlag: moderation.assignAgentRiskFlag,
          assignFlagId: moderation.assignFlagId,
          assignReason: moderation.assignReason,
          assigneeUserId: moderation.assigneeUserId,
          auditLogLimit: moderation.auditLogLimit,
          auditLogSnapshot: moderation.auditLogSnapshot,
          blockedUserId: moderation.blockedUserId,
          blockerUserId: moderation.blockerUserId,
          createBlock: moderation.createBlock,
          createReport: moderation.createReport,
          loadAgentRiskFlags: moderation.loadAgentRiskFlags,
          loadAuditLogs: moderation.loadAuditLogs,
          loadModerationQueue: moderation.loadModerationQueue,
          loadModerationSettings: moderation.loadModerationSettings,
          loadModerationSummary: moderation.loadModerationSummary,
          moderationQueueEntityTypeQuery:
            moderation.moderationQueueEntityTypeQuery,
          moderationQueueItems: moderation.moderationQueueItems,
          moderationQueueLimit: moderation.moderationQueueLimit,
          moderationQueueReasonQuery: moderation.moderationQueueReasonQuery,
          moderationQueueSnapshot: moderation.moderationQueueSnapshot,
          moderationQueueStatusQuery: moderation.moderationQueueStatusQuery,
          moderationSettingsSnapshot: moderation.moderationSettingsSnapshot,
          moderationSnapshot: moderation.moderationSnapshot,
          moderationSummarySnapshot: moderation.moderationSummarySnapshot,
          primeTriageFromFlag: moderation.primeTriageFromFlag,
          reportDetails: moderation.reportDetails,
          reportReason: moderation.reportReason,
          reporterUserId: moderation.reporterUserId,
          setAgentRiskDecisionQuery: moderation.setAgentRiskDecisionQuery,
          setAgentRiskLimit: moderation.setAgentRiskLimit,
          setAgentRiskStatusQuery: moderation.setAgentRiskStatusQuery,
          setAssignFlagId: moderation.setAssignFlagId,
          setAssignReason: moderation.setAssignReason,
          setAssigneeUserId: moderation.setAssigneeUserId,
          setAuditLogLimit: moderation.setAuditLogLimit,
          setBlockedUserId: moderation.setBlockedUserId,
          setBlockerUserId: moderation.setBlockerUserId,
          setModerationQueueEntityTypeQuery:
            moderation.setModerationQueueEntityTypeQuery,
          setModerationQueueLimit: moderation.setModerationQueueLimit,
          setModerationQueueReasonQuery:
            moderation.setModerationQueueReasonQuery,
          setModerationQueueSnapshot: moderation.setModerationQueueSnapshot,
          setModerationQueueStatusQuery:
            moderation.setModerationQueueStatusQuery,
          setReportDetails: moderation.setReportDetails,
          setReportReason: moderation.setReportReason,
          setReporterUserId: moderation.setReporterUserId,
          setTargetUserId: moderation.setTargetUserId,
          setTriageAction: moderation.setTriageAction,
          setTriageFlagId: moderation.setTriageFlagId,
          setTriageReason: moderation.setTriageReason,
          setTriageTargetUserId: moderation.setTriageTargetUserId,
          targetUserId: moderation.targetUserId,
          triageAction: moderation.triageAction,
          triageAgentRiskFlag: moderation.triageAgentRiskFlag,
          triageFlagId: moderation.triageFlagId,
          triageReason: moderation.triageReason,
          triageTargetUserId: moderation.triageTargetUserId,
        }}
        overviewProps={{
          adminButtonClass,
          adminButtonGhostClass,
          adminInputClass,
          adminLabelClass,
          adminRole,
          adminUserId,
          deadLetters,
          debugBodyInput,
          debugHistory,
          debugMethod,
          debugPath,
          debugQueryInput,
          debugResponse,
          executeDebugQuery,
          health,
          llmRuntimeHealthSnapshot,
          loadDeadLetters,
          loadLlmRuntimeHealthSnapshot,
          loadOnboardingActivationSnapshot,
          onboardingActivationSnapshot,
          relayCount,
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
          threadId,
          userId,
        }}
        personalizationProps={{
          adminButtonClass,
          adminButtonGhostClass,
          adminInputClass,
          adminLabelClass,
          explainPolicy,
          inspectLifeGraph,
          lifeGraphSnapshot,
          memoryResetSnapshot,
          policyContextInput,
          policyExplainSnapshot,
          policyFlags,
          resetLearnedMemory,
          setPolicyContextInput,
          setPolicyFlags,
          setUserId,
          userId,
        }}
        tabSubtitle={tabSubtitle}
        userInspectorProps={{
          adminButtonClass,
          adminButtonDangerClass,
          adminButtonGhostClass,
          adminInputClass,
          adminLabelClass,
          availabilitySnapshot,
          continuityIntentExplainSnapshot,
          deactivateReason,
          deactivateUser,
          discoveryInboxSnapshot,
          discoveryPassiveSnapshot,
          inboxSnapshot,
          inspectUser,
          interestSnapshot,
          pendingIntentSummarySnapshot,
          photoSnapshot,
          profileSnapshot,
          recurringCircleSessionSnapshot,
          recurringCircleSnapshot,
          restrictReason,
          restrictUser,
          revokeAllSessions,
          revokeSession,
          revokeSessionId,
          ruleSnapshot,
          runSearch,
          savedSearchSnapshot,
          scheduledTaskRunsSnapshot,
          scheduledTaskSnapshot,
          searchQuery,
          searchSnapshot,
          sendDigest,
          sessionSnapshot,
          setDeactivateReason,
          setRestrictReason,
          setRevokeSessionId,
          setSearchQuery,
          setUserId,
          summarizePendingIntents,
          topicSnapshot,
          trustSnapshot,
          userId,
        }}
      />
    </AdminShell>
  );
}

export default function AdminHome() {
  return (
    <Suspense fallback={<AppLoading />}>
      <AdminHomeContent />
    </Suspense>
  );
}
