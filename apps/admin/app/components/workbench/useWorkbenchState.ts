"use client";

import { useRef, useState } from "react";
import { type HttpMethod } from "../../lib/api";
import {
  type AdminTab,
  type Banner,
  type LlmRuntimeHealthSnapshot,
  type OnboardingActivationSnapshot,
} from "./workbench-config";

const DEFAULT_UUID = "00000000-0000-0000-0000-000000000000";

export function useWorkbenchState() {
  const [activeTab, setActiveTab] = useState<AdminTab>("overview");
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [banner, setBanner] = useState<Banner | null>(null);

  const [health, setHealth] = useState("checking...");
  const [relayCount, setRelayCount] = useState<number | null>(null);
  const [onboardingActivationSnapshot, setOnboardingActivationSnapshot] =
    useState<OnboardingActivationSnapshot | null>(null);
  const [llmRuntimeHealthSnapshot, setLlmRuntimeHealthSnapshot] =
    useState<LlmRuntimeHealthSnapshot | null>(null);
  const [deadLetters, setDeadLetters] = useState<
    Array<{
      id: string;
      queueName: string;
      jobName: string;
      attempts: number;
      lastError: string;
      createdAt: string;
    }>
  >([]);
  const [adminUserId, setAdminUserId] = useState(DEFAULT_UUID);
  const [adminRole, setAdminRole] = useState<"admin" | "support" | "moderator">(
    "admin",
  );

  const [userId, setUserId] = useState(DEFAULT_UUID);
  const [intentId, setIntentId] = useState("");
  const [chatId, setChatId] = useState("");
  const [threadId, setThreadId] = useState("");
  const [revokeSessionId, setRevokeSessionId] = useState("");

  const [actingUserId, setActingUserId] = useState(DEFAULT_UUID);
  const [messageId, setMessageId] = useState("");
  const [moderatorUserId, setModeratorUserId] = useState(DEFAULT_UUID);
  const [hideReason, setHideReason] = useState("policy violation");
  const [syncAfter, setSyncAfter] = useState("");
  const [groupSizeTarget, setGroupSizeTarget] = useState(3);

  const [policyContextInput, setPolicyContextInput] = useState(
    '{"surface":"admin","source":"manual"}',
  );
  const [policyFlags, setPolicyFlags] = useState({
    safetyAllowed: true,
    hardRuleAllowed: true,
    productPolicyAllowed: true,
    overrideAllowed: true,
    learnedPreferenceAllowed: true,
    rankingAllowed: true,
  });

  const [agentMessage, setAgentMessage] = useState("Manual admin trace ping");

  const [debugMethod, setDebugMethod] = useState<HttpMethod>("GET");
  const [debugPath, setDebugPath] = useState("/admin/health");
  const [debugQueryInput, setDebugQueryInput] = useState("{}");
  const [debugBodyInput, setDebugBodyInput] = useState("{}");
  const [debugResponse, setDebugResponse] = useState<unknown>(null);
  const [debugHistory, setDebugHistory] = useState<
    Array<{
      id: string;
      at: string;
      method: HttpMethod;
      path: string;
      success: boolean;
    }>
  >([]);

  const [streamStatus, setStreamStatus] = useState<
    "idle" | "connecting" | "live" | "error"
  >("idle");
  const [streamEvents, setStreamEvents] = useState<
    Array<{ id: string; at: string; kind: string; payload: unknown }>
  >([]);
  const streamRef = useRef<EventSource | null>(null);

  const [profileSnapshot, setProfileSnapshot] = useState<unknown>(null);
  const [trustSnapshot, setTrustSnapshot] = useState<unknown>(null);
  const [ruleSnapshot, setRuleSnapshot] = useState<unknown>(null);
  const [interestSnapshot, setInterestSnapshot] = useState<unknown>(null);
  const [topicSnapshot, setTopicSnapshot] = useState<unknown>(null);
  const [availabilitySnapshot, setAvailabilitySnapshot] =
    useState<unknown>(null);
  const [photoSnapshot, setPhotoSnapshot] = useState<unknown>(null);
  const [sessionSnapshot, setSessionSnapshot] = useState<unknown>(null);
  const [inboxSnapshot, setInboxSnapshot] = useState<unknown>(null);
  const [recurringCircleSnapshot, setRecurringCircleSnapshot] =
    useState<unknown>(null);
  const [recurringCircleSessionSnapshot, setRecurringCircleSessionSnapshot] =
    useState<unknown>(null);
  const [savedSearchSnapshot, setSavedSearchSnapshot] = useState<unknown>(null);
  const [scheduledTaskSnapshot, setScheduledTaskSnapshot] =
    useState<unknown>(null);
  const [scheduledTaskRunsSnapshot, setScheduledTaskRunsSnapshot] =
    useState<unknown>(null);
  const [discoveryPassiveSnapshot, setDiscoveryPassiveSnapshot] =
    useState<unknown>(null);
  const [discoveryInboxSnapshot, setDiscoveryInboxSnapshot] =
    useState<unknown>(null);
  const [pendingIntentSummarySnapshot, setPendingIntentSummarySnapshot] =
    useState<unknown>(null);
  const [continuityIntentExplainSnapshot, setContinuityIntentExplainSnapshot] =
    useState<unknown>(null);
  const [searchQuery, setSearchQuery] = useState("tennis");
  const [searchSnapshot, setSearchSnapshot] = useState<unknown>(null);

  const [intentExplainSnapshot, setIntentExplainSnapshot] =
    useState<unknown>(null);
  const [intentUserExplainSnapshot, setIntentUserExplainSnapshot] =
    useState<unknown>(null);
  const [intentActionSnapshot, setIntentActionSnapshot] =
    useState<unknown>(null);

  const [chatMessagesSnapshot, setChatMessagesSnapshot] =
    useState<unknown>(null);
  const [chatMetadataSnapshot, setChatMetadataSnapshot] =
    useState<unknown>(null);
  const [chatSyncSnapshot, setChatSyncSnapshot] = useState<unknown>(null);

  const [deactivateReason, setDeactivateReason] =
    useState("support escalation");
  const [restrictReason, setRestrictReason] = useState("safety restriction");
  const [lifeGraphSnapshot, setLifeGraphSnapshot] = useState<unknown>(null);
  const [policyExplainSnapshot, setPolicyExplainSnapshot] =
    useState<unknown>(null);
  const [memoryResetSnapshot, setMemoryResetSnapshot] = useState<unknown>(null);
  const [agentTraceSnapshot, setAgentTraceSnapshot] = useState<unknown>(null);

  return {
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
  };
}
