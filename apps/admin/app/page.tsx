"use client";

export const dynamic = "force-dynamic";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo } from "react";

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
import { useAdminLocale } from "./components/workbench/useAdminLocale";
import { useAdminHealthPolling } from "./components/workbench/useAdminHealthPolling";
import { usePolicyAdminActions } from "./components/workbench/usePolicyAdminActions";
import { buildWorkbenchTabProps } from "./components/workbench/buildWorkbenchTabProps";
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
import { t } from "./lib/i18n";

function AdminHomeContent() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { locale, setLocale } = useAdminLocale("en");
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

  useAdminHealthPolling({
    sessionHydrated,
    hasSignedInSession: Boolean(signedInSession),
    refreshHealth,
  });

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

  const {
    deactivateUser,
    restrictUser,
    inspectLifeGraph,
    explainPolicy,
    resetLearnedMemory,
  } = usePolicyAdminActions({
    requestApi,
    runAction,
    setBanner,
    userId,
    deactivateReason,
    restrictReason,
    policyContextInput,
    policyFlags,
    setModerationSnapshot: moderation.setModerationSnapshot,
    setLifeGraphSnapshot,
    setPolicyExplainSnapshot,
    setMemoryResetSnapshot,
  });

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

  const workbenchTabProps = buildWorkbenchTabProps({
    agentProps: {
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
    },
    chatsProps: {
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
    },
    intentsProps: {
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
    },
    moderationProps: {
      adminButtonClass,
      adminButtonGhostClass,
      adminInputClass,
      adminLabelClass,
      ...moderation,
    },
    overviewProps: {
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
    },
    personalizationProps: {
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
    },
    userInspectorProps: {
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
    },
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
        banner={banner}
        tabSubtitle={tabSubtitle}
        {...workbenchTabProps}
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
