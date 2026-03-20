import {
  ForbiddenException,
  Injectable,
  ServiceUnavailableException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../database/prisma.service.js";

const SYSTEM_CONFIG_USER_ID = "00000000-0000-4000-8000-000000000000";
const CACHE_TTL_MS = 5_000;

const SETTING_KEYS = {
  globalKillSwitch: "launch.global_kill_switch",
  inviteOnlyMode: "launch.invite_only_mode",
  alphaCohortUserIds: "launch.alpha_cohort_user_ids",
  enableNewIntents: "launch.enable_new_intents",
  enableAgentFollowups: "launch.enable_agent_followups",
  enableGroupFormation: "launch.enable_group_formation",
  enablePushNotifications: "launch.enable_push_notifications",
  enablePersonalization: "launch.enable_personalization",
  enableDiscovery: "launch.enable_discovery",
  enableModerationStrictness: "launch.enable_moderation_strictness",
  enableAiParsing: "launch.enable_ai_parsing",
  enableRealtimeChat: "launch.enable_realtime_chat",
  enableScheduledTasks: "launch.enable_scheduled_tasks",
  enableSavedSearches: "launch.enable_saved_searches",
  enableRecurringBriefings: "launch.enable_recurring_briefings",
  enableRecurringCircles: "launch.enable_recurring_circles",
} as const;

export type LaunchAction =
  | "new_intents"
  | "agent_followups"
  | "group_formation"
  | "push_notifications"
  | "personalization"
  | "discovery"
  | "moderation_strictness"
  | "ai_parsing"
  | "realtime_chat"
  | "scheduled_tasks"
  | "saved_searches"
  | "recurring_briefings"
  | "recurring_circles";

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
  enableAiParsing: boolean;
  enableRealtimeChat: boolean;
  enableScheduledTasks: boolean;
  enableSavedSearches: boolean;
  enableRecurringBriefings: boolean;
  enableRecurringCircles: boolean;
  generatedAt: string;
}

@Injectable()
export class LaunchControlsService {
  private cachedSnapshot: LaunchControlsSnapshot | null = null;
  private cachedAtMs = 0;

  constructor(private readonly prisma: PrismaService) {}

  async getSnapshot(forceRefresh = false): Promise<LaunchControlsSnapshot> {
    const nowMs = Date.now();
    if (
      !forceRefresh &&
      this.cachedSnapshot &&
      nowMs - this.cachedAtMs < CACHE_TTL_MS
    ) {
      return this.cachedSnapshot;
    }

    const defaults = this.readDefaultSnapshot();
    const overrides = await this.readStoredOverrides();
    const snapshot: LaunchControlsSnapshot = {
      globalKillSwitch: overrides.globalKillSwitch ?? defaults.globalKillSwitch,
      inviteOnlyMode: overrides.inviteOnlyMode ?? defaults.inviteOnlyMode,
      alphaCohortUserIds:
        overrides.alphaCohortUserIds ?? defaults.alphaCohortUserIds,
      enableNewIntents: overrides.enableNewIntents ?? defaults.enableNewIntents,
      enableAgentFollowups:
        overrides.enableAgentFollowups ?? defaults.enableAgentFollowups,
      enableGroupFormation:
        overrides.enableGroupFormation ?? defaults.enableGroupFormation,
      enablePushNotifications:
        overrides.enablePushNotifications ?? defaults.enablePushNotifications,
      enablePersonalization:
        overrides.enablePersonalization ?? defaults.enablePersonalization,
      enableDiscovery: overrides.enableDiscovery ?? defaults.enableDiscovery,
      enableModerationStrictness:
        overrides.enableModerationStrictness ??
        defaults.enableModerationStrictness,
      enableAiParsing: overrides.enableAiParsing ?? defaults.enableAiParsing,
      enableRealtimeChat:
        overrides.enableRealtimeChat ?? defaults.enableRealtimeChat,
      enableScheduledTasks:
        overrides.enableScheduledTasks ?? defaults.enableScheduledTasks,
      enableSavedSearches:
        overrides.enableSavedSearches ?? defaults.enableSavedSearches,
      enableRecurringBriefings:
        overrides.enableRecurringBriefings ?? defaults.enableRecurringBriefings,
      enableRecurringCircles:
        overrides.enableRecurringCircles ?? defaults.enableRecurringCircles,
      generatedAt: new Date().toISOString(),
    };

    this.cachedSnapshot = snapshot;
    this.cachedAtMs = nowMs;
    return snapshot;
  }

  async getUserEligibility(userId: string) {
    const snapshot = await this.getSnapshot();
    const inAlphaCohort = snapshot.alphaCohortUserIds.includes(userId);

    const blockingReasons: string[] = [];
    if (snapshot.globalKillSwitch) {
      blockingReasons.push("global_kill_switch_enabled");
    }
    if (snapshot.inviteOnlyMode && !inAlphaCohort) {
      blockingReasons.push("invite_only_mode");
    }

    return {
      userId,
      eligible: blockingReasons.length === 0,
      blockingReasons,
      inAlphaCohort,
      controls: snapshot,
    };
  }

  async assertActionAllowed(action: LaunchAction, userId?: string) {
    const snapshot = await this.getSnapshot();
    if (snapshot.globalKillSwitch) {
      throw new ServiceUnavailableException("global kill switch is enabled");
    }

    if (!this.isActionEnabled(snapshot, action)) {
      throw new ServiceUnavailableException(
        `${action} is currently disabled by launch controls`,
      );
    }

    if (
      userId &&
      snapshot.inviteOnlyMode &&
      !snapshot.alphaCohortUserIds.includes(userId)
    ) {
      throw new ForbiddenException("user is not in the alpha cohort");
    }
  }

  async updateControls(input: {
    actorUserId?: string;
    reason?: string;
    globalKillSwitch?: boolean;
    inviteOnlyMode?: boolean;
    alphaCohortUserIds?: string[];
    enableNewIntents?: boolean;
    enableAgentFollowups?: boolean;
    enableGroupFormation?: boolean;
    enablePushNotifications?: boolean;
    enablePersonalization?: boolean;
    enableDiscovery?: boolean;
    enableModerationStrictness?: boolean;
    enableAiParsing?: boolean;
    enableRealtimeChat?: boolean;
    enableScheduledTasks?: boolean;
    enableSavedSearches?: boolean;
    enableRecurringBriefings?: boolean;
    enableRecurringCircles?: boolean;
  }) {
    const updates = [
      ["globalKillSwitch", input.globalKillSwitch],
      ["inviteOnlyMode", input.inviteOnlyMode],
      ["alphaCohortUserIds", input.alphaCohortUserIds],
      ["enableNewIntents", input.enableNewIntents],
      ["enableAgentFollowups", input.enableAgentFollowups],
      ["enableGroupFormation", input.enableGroupFormation],
      ["enablePushNotifications", input.enablePushNotifications],
      ["enablePersonalization", input.enablePersonalization],
      ["enableDiscovery", input.enableDiscovery],
      ["enableModerationStrictness", input.enableModerationStrictness],
      ["enableAiParsing", input.enableAiParsing],
      ["enableRealtimeChat", input.enableRealtimeChat],
      ["enableScheduledTasks", input.enableScheduledTasks],
      ["enableSavedSearches", input.enableSavedSearches],
      ["enableRecurringBriefings", input.enableRecurringBriefings],
      ["enableRecurringCircles", input.enableRecurringCircles],
    ] as const;

    const changed: Record<string, Prisma.InputJsonValue> = {};
    for (const [field, value] of updates) {
      if (value === undefined) {
        continue;
      }
      const key = SETTING_KEYS[field];
      await this.upsertSystemSetting(key, value);
      changed[field] = value as Prisma.InputJsonValue;
    }

    await this.prisma.auditLog.create({
      data: {
        actorUserId: input.actorUserId ?? null,
        actorType: "admin",
        action: "launch_controls.updated",
        entityType: "system",
        metadata: {
          reason: input.reason ?? null,
          changed,
        } as Prisma.InputJsonValue,
      },
    });

    return this.getSnapshot(true);
  }

  private isActionEnabled(
    snapshot: LaunchControlsSnapshot,
    action: LaunchAction,
  ) {
    if (action === "new_intents") {
      return snapshot.enableNewIntents;
    }
    if (action === "agent_followups") {
      return snapshot.enableAgentFollowups;
    }
    if (action === "group_formation") {
      return snapshot.enableGroupFormation;
    }
    if (action === "push_notifications") {
      return snapshot.enablePushNotifications;
    }
    if (action === "personalization") {
      return snapshot.enablePersonalization;
    }
    if (action === "discovery") {
      return snapshot.enableDiscovery;
    }
    if (action === "moderation_strictness") {
      return snapshot.enableModerationStrictness;
    }
    if (action === "ai_parsing") {
      return snapshot.enableAiParsing;
    }
    if (action === "realtime_chat") {
      return snapshot.enableRealtimeChat;
    }
    if (action === "scheduled_tasks") {
      return snapshot.enableScheduledTasks;
    }
    if (action === "saved_searches") {
      return snapshot.enableSavedSearches;
    }
    if (action === "recurring_briefings") {
      return snapshot.enableRecurringBriefings;
    }
    return snapshot.enableRecurringCircles;
  }

  private async readStoredOverrides() {
    const rows = await this.prisma.userPreference.findMany({
      where: {
        userId: SYSTEM_CONFIG_USER_ID,
        key: {
          in: Object.values(SETTING_KEYS),
        },
      },
      select: {
        key: true,
        value: true,
      },
    });
    const byKey = new Map(rows.map((row) => [row.key, row.value]));

    const alphaListRaw = byKey.get(SETTING_KEYS.alphaCohortUserIds);
    const alphaCohortUserIds = this.readUuidArray(alphaListRaw);

    return {
      globalKillSwitch: this.readBoolean(
        byKey.get(SETTING_KEYS.globalKillSwitch),
      ),
      inviteOnlyMode: this.readBoolean(byKey.get(SETTING_KEYS.inviteOnlyMode)),
      alphaCohortUserIds:
        alphaCohortUserIds.length > 0 ? alphaCohortUserIds : undefined,
      enableNewIntents: this.readBoolean(
        byKey.get(SETTING_KEYS.enableNewIntents),
      ),
      enableAgentFollowups: this.readBoolean(
        byKey.get(SETTING_KEYS.enableAgentFollowups),
      ),
      enableGroupFormation: this.readBoolean(
        byKey.get(SETTING_KEYS.enableGroupFormation),
      ),
      enablePushNotifications: this.readBoolean(
        byKey.get(SETTING_KEYS.enablePushNotifications),
      ),
      enablePersonalization: this.readBoolean(
        byKey.get(SETTING_KEYS.enablePersonalization),
      ),
      enableDiscovery: this.readBoolean(
        byKey.get(SETTING_KEYS.enableDiscovery),
      ),
      enableModerationStrictness: this.readBoolean(
        byKey.get(SETTING_KEYS.enableModerationStrictness),
      ),
      enableAiParsing: this.readBoolean(
        byKey.get(SETTING_KEYS.enableAiParsing),
      ),
      enableRealtimeChat: this.readBoolean(
        byKey.get(SETTING_KEYS.enableRealtimeChat),
      ),
      enableScheduledTasks: this.readBoolean(
        byKey.get(SETTING_KEYS.enableScheduledTasks),
      ),
      enableSavedSearches: this.readBoolean(
        byKey.get(SETTING_KEYS.enableSavedSearches),
      ),
      enableRecurringBriefings: this.readBoolean(
        byKey.get(SETTING_KEYS.enableRecurringBriefings),
      ),
      enableRecurringCircles: this.readBoolean(
        byKey.get(SETTING_KEYS.enableRecurringCircles),
      ),
    };
  }

  private readDefaultSnapshot(): Omit<LaunchControlsSnapshot, "generatedAt"> {
    return {
      globalKillSwitch: this.readBooleanFromEnv(
        "FEATURE_GLOBAL_KILL_SWITCH",
        false,
      ),
      inviteOnlyMode: this.readBooleanFromEnv(
        "FEATURE_INVITE_ONLY_MODE",
        false,
      ),
      alphaCohortUserIds: this.readCsvUuidEnv("FEATURE_ALPHA_COHORT_USER_IDS"),
      enableNewIntents: this.readBooleanFromEnv(
        "FEATURE_ENABLE_NEW_INTENTS",
        true,
      ),
      enableAgentFollowups: this.readBooleanFromEnv(
        "FEATURE_ENABLE_AGENT_FOLLOWUPS",
        true,
      ),
      enableGroupFormation: this.readBooleanFromEnv(
        "FEATURE_ENABLE_GROUP_FORMATION",
        true,
      ),
      enablePushNotifications: this.readBooleanFromEnv(
        "FEATURE_ENABLE_PUSH_NOTIFICATIONS",
        true,
      ),
      enablePersonalization: this.readBooleanFromEnv(
        "FEATURE_ENABLE_PERSONALIZATION",
        true,
      ),
      enableDiscovery: this.readBooleanFromEnv(
        "FEATURE_ENABLE_DISCOVERY",
        true,
      ),
      enableModerationStrictness: this.readBooleanFromEnv(
        "FEATURE_ENABLE_MODERATION_STRICTNESS",
        false,
      ),
      enableAiParsing: this.readBooleanFromEnv(
        "FEATURE_ENABLE_AI_PARSING",
        true,
      ),
      enableRealtimeChat: this.readBooleanFromEnv(
        "FEATURE_ENABLE_REALTIME_CHAT",
        true,
      ),
      enableScheduledTasks: this.readBooleanFromEnv(
        "FEATURE_ENABLE_SCHEDULED_TASKS",
        false,
      ),
      enableSavedSearches: this.readBooleanFromEnv(
        "FEATURE_ENABLE_SAVED_SEARCHES",
        false,
      ),
      enableRecurringBriefings: this.readBooleanFromEnv(
        "FEATURE_ENABLE_RECURRING_BRIEFINGS",
        false,
      ),
      enableRecurringCircles: this.readBooleanFromEnv(
        "FEATURE_ENABLE_RECURRING_CIRCLES",
        false,
      ),
    };
  }

  private readBoolean(value: unknown): boolean | undefined {
    if (typeof value === "boolean") {
      return value;
    }
    return undefined;
  }

  private readUuidArray(value: unknown): string[] {
    if (!Array.isArray(value)) {
      return [];
    }
    return value.filter((item): item is string => typeof item === "string");
  }

  private readBooleanFromEnv(name: string, fallback: boolean) {
    const value = process.env[name];
    if (value === undefined) {
      return fallback;
    }
    const normalized = value.trim().toLowerCase();
    if (normalized === "true" || normalized === "1" || normalized === "yes") {
      return true;
    }
    if (normalized === "false" || normalized === "0" || normalized === "no") {
      return false;
    }
    return fallback;
  }

  private readCsvUuidEnv(name: string) {
    const raw = process.env[name] ?? "";
    return raw
      .split(",")
      .map((item) => item.trim())
      .filter((item) => item.length > 0);
  }

  private async upsertSystemSetting(key: string, value: unknown) {
    const existing = await this.prisma.userPreference.findFirst({
      where: {
        userId: SYSTEM_CONFIG_USER_ID,
        key,
      },
      orderBy: { updatedAt: "desc" },
    });
    const jsonValue = value as Prisma.InputJsonValue;
    if (existing) {
      await this.prisma.userPreference.update({
        where: { id: existing.id },
        data: { value: jsonValue },
      });
      return;
    }
    await this.prisma.userPreference.create({
      data: {
        userId: SYSTEM_CONFIG_USER_ID,
        key,
        value: jsonValue,
      },
    });
  }
}
