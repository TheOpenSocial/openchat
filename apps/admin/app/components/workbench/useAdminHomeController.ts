"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo } from "react";

import {
  adminButtonClass,
  adminButtonDangerClass,
  adminButtonGhostClass,
  adminInputClass,
  adminLabelClass,
} from "../../lib/admin-ui";
import { buildWorkbenchTabProps } from "./buildWorkbenchTabProps";
import { tabConfig, tabSubtitle } from "./workbench-config";
import { useAdminApiActions } from "./useAdminApiActions";
import { useAgentStream } from "./useAgentStream";
import { useWorkbenchState } from "./useWorkbenchState";
import { useModerationWorkbench } from "./useModerationWorkbench";
import { useAdminSessionLifecycle } from "./useAdminSessionLifecycle";
import { useOpsSnapshotsActions } from "./useOpsSnapshotsActions";
import { useEntityInspectorActions } from "./useEntityInspectorActions";
import { useAgentDebugActions } from "./useAgentDebugActions";
import { useAdminLocale } from "./useAdminLocale";
import { useAdminHealthPolling } from "./useAdminHealthPolling";
import { usePolicyAdminActions } from "./usePolicyAdminActions";

export function useAdminHomeController() {
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
  }, [searchParams, setActiveTab]);

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
    [stopAgentStream],
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

  const sessionLabel =
    signedInSession?.displayName?.trim() ||
    signedInSession?.email?.trim() ||
    signedInSession?.userId.slice(0, 8) ||
    "";

  return {
    activeTab,
    banner,
    busyKey,
    locale,
    sessionHydrated,
    sessionLabel,
    signedInSession,
    signInError,
    startGoogleSignIn,
    setActiveTab,
    setLocale,
    signOut,
    summary,
    workbenchTabProps,
  };
}

export { tabConfig, tabSubtitle };
