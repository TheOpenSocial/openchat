import type { UserProfileDraft } from "../../types";

export type ProfilePreferences = {
  mode?: string;
  format?: string;
  style?: string;
  availability?: string;
  notifications?: string;
  autonomy?: string;
  memory?: string;
  reachability?: string;
};

export type ProfileContext = {
  reason?: string;
  sharedTopics: string[];
  lastInteraction?: string;
};

export type ProfileGraphSignal = {
  label: string;
  strength: string;
  kind: string;
};

export type ProfileGraphSummary = {
  nodeCount: number;
  edgeCount: number;
  topSignals: ProfileGraphSignal[];
  nodeGroups: Array<{
    kind: string;
    labels: string[];
  }>;
};

export type ProfileViewModel = {
  id: string;
  name: string;
  avatarUrl?: string;
  bio?: string;
  location?: string;
  interests: string[];
  preferences: ProfilePreferences;
  persona?: string;
  systemUnderstanding: string[];
  graph: ProfileGraphSummary;
  context?: ProfileContext;
};

function asObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function asString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((item) => asString(item))
    .filter((item): item is string => Boolean(item));
}

function asNumber(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }
  return value;
}

function titleCase(value: string): string {
  return value
    .split(/[_\s]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function preferenceLabel(
  value: string | undefined,
  fallback: string,
  map?: Record<string, string>,
) {
  if (!value) {
    return fallback;
  }
  return map?.[value] ?? titleCase(value);
}

function pickInterests(record: Record<string, unknown>): string[] {
  const direct = asStringArray(record.interests);
  if (direct.length > 0) {
    return direct;
  }
  const topicRecords = Array.isArray(record.topics) ? record.topics : [];
  const mapped = topicRecords
    .map((item) => asObject(item))
    .map((item) => (item ? asString(item.label) : undefined))
    .filter((item): item is string => Boolean(item));
  return mapped;
}

function derivePersona(
  mode: string | undefined,
  format: string | undefined,
  interests: string[],
): string | undefined {
  if (format?.toLowerCase().includes("group")) {
    return "Connector";
  }
  if (mode?.toLowerCase().includes("dating")) {
    return "Explorer";
  }
  if (interests.length >= 4) {
    return "Curator";
  }
  return "Builder";
}

function summarizeGraph(
  record: Record<string, unknown> | null,
): ProfileGraphSummary {
  const nodes = Array.isArray(record?.nodes) ? record.nodes : [];
  const edges = Array.isArray(record?.edges) ? record.edges : [];

  const topSignals = edges
    .map((item) => asObject(item))
    .filter((item): item is Record<string, unknown> => Boolean(item))
    .map((edge) => {
      const targetNode = asObject(edge.targetNode);
      const rawWeight = asNumber(edge.weight) ?? 0;

      return {
        label: asString(targetNode?.label) ?? "Unknown",
        strength:
          rawWeight >= 0.75
            ? "Strong"
            : rawWeight >= 0.45
              ? "Active"
              : rawWeight > 0
                ? "Emerging"
                : "Muted",
        kind: preferenceLabel(asString(edge.edgeType), "Signal"),
        weight: rawWeight,
      };
    })
    .sort((left, right) => right.weight - left.weight)
    .slice(0, 4)
    .map(({ kind, label, strength }) => ({
      kind,
      label,
      strength,
    }));

  const groupedNodes = new Map<string, string[]>();
  for (const item of nodes) {
    const node = asObject(item);
    if (!node) continue;
    const kind = preferenceLabel(asString(node.nodeType), "Signal");
    const label = asString(node.label);
    if (!label) continue;
    const existing = groupedNodes.get(kind) ?? [];
    if (!existing.includes(label)) {
      existing.push(label);
      groupedNodes.set(kind, existing);
    }
  }

  const nodeGroups = Array.from(groupedNodes.entries())
    .map(([kind, labels]) => ({
      kind,
      labels: labels.slice(0, 4),
    }))
    .sort((left, right) => right.labels.length - left.labels.length)
    .slice(0, 3);

  return {
    nodeCount: nodes.length,
    edgeCount: edges.length,
    topSignals,
    nodeGroups,
  };
}

export function normalizeSelfProfile(args: {
  userId: string;
  displayName: string;
  email?: string | null;
  draft: UserProfileDraft;
  profileRecord: Record<string, unknown> | null;
  trustRecord: Record<string, unknown> | null;
  lifeGraphRecord: Record<string, unknown> | null;
  globalRulesRecord: Record<string, unknown> | null;
}): ProfileViewModel {
  const profile = args.profileRecord ?? {};
  const trust = args.trustRecord ?? {};
  const lifeGraph = args.lifeGraphRecord ?? {};
  const globalRules = args.globalRulesRecord ?? {};
  const city = asString(profile.city) ?? args.draft.city ?? undefined;
  const country = asString(profile.country) ?? args.draft.country ?? undefined;
  const interests = pickInterests(profile);
  const finalInterests =
    interests.length > 0 ? interests : (args.draft.interests ?? []);
  const socialMode = asString(profile.socialMode) ?? args.draft.socialMode;
  const preferOneToOne =
    typeof profile.preferOneToOne === "boolean"
      ? profile.preferOneToOne
      : args.draft.socialMode === "one_to_one";
  const allowGroupInvites =
    typeof profile.allowGroupInvites === "boolean"
      ? profile.allowGroupInvites
      : args.draft.socialMode !== "one_to_one";

  const matchScore = asString(trust.matchingScore);
  const understanding = [
    finalInterests.length > 0
      ? `Interested in ${finalInterests.slice(0, 3).join(", ")}`
      : "Interests still being learned",
    `Prefers ${preferOneToOne ? "1:1 interactions" : "open interactions"}`,
    allowGroupInvites ? "Open to small groups" : "Focused on direct connection",
    asStringArray(lifeGraph.recentSignals).at(0),
    matchScore ? `Trust signal: ${matchScore}` : undefined,
  ].filter((item): item is string => Boolean(item));

  return {
    id: args.userId,
    name: asString(profile.displayName) ?? args.displayName,
    avatarUrl:
      asString(profile.avatarUrl) ??
      asString(profile.photoUrl) ??
      asString(profile.imageUrl),
    bio: asString(profile.bio) ?? args.draft.bio ?? args.email ?? undefined,
    location: [city, country].filter(Boolean).join(", ") || undefined,
    interests: finalInterests,
    preferences: {
      mode: socialMode,
      format: preferOneToOne ? "1:1" : allowGroupInvites ? "Both" : "1:1",
      style:
        socialMode === "group"
          ? "Planned"
          : socialMode === "either"
            ? "Balanced"
            : "Chill",
      availability:
        asString(profile.availability) ??
        asString(lifeGraph.availabilityHint) ??
        "Evenings and weekends",
      notifications: preferenceLabel(
        asString(globalRules.notificationMode) ??
          (args.draft.notificationMode === "digest" ? "digest" : "immediate"),
        "Live",
        {
          immediate: "Live",
          digest: "Digest",
          quiet: "Quiet",
        },
      ),
      autonomy: preferenceLabel(
        asString(globalRules.agentAutonomy),
        "Suggest Only",
        {
          manual: "Manual",
          suggest_only: "Suggest Only",
          auto_non_risky: "Auto Non-Risky",
        },
      ),
      memory: preferenceLabel(asString(globalRules.memoryMode), "Standard", {
        minimal: "Minimal",
        standard: "Standard",
        extended: "Extended",
      }),
      reachability: preferenceLabel(
        asString(globalRules.reachable),
        "Available Only",
        {
          always: "Always On",
          available_only: "Available Only",
          do_not_disturb: "Do Not Disturb",
        },
      ),
    },
    persona: derivePersona(
      socialMode,
      preferOneToOne ? "1:1" : allowGroupInvites ? "Both" : "1:1",
      finalInterests,
    ),
    systemUnderstanding: understanding,
    graph: summarizeGraph(args.lifeGraphRecord),
  };
}

export function normalizeOtherProfile(args: {
  targetUserId: string;
  profileRecord: Record<string, unknown> | null;
  trustRecord: Record<string, unknown> | null;
  contextReason?: string;
  sharedTopics?: string[];
  lastInteraction?: string;
}): ProfileViewModel {
  const profile = args.profileRecord ?? {};
  const trust = args.trustRecord ?? {};
  const city = asString(profile.city);
  const country = asString(profile.country);
  const interests = pickInterests(profile);
  const format = asString(profile.format) ?? asString(trust.interactionStyle);
  const mode = asString(profile.socialMode) ?? asString(trust.socialMode);
  const persona =
    asString(profile.persona) ?? derivePersona(mode, format, interests);

  const sharedTopics =
    args.sharedTopics && args.sharedTopics.length > 0
      ? args.sharedTopics
      : asStringArray(trust.sharedTopics);

  return {
    id: args.targetUserId,
    name:
      asString(profile.displayName) ??
      asString(profile.name) ??
      "OpenSocial member",
    avatarUrl:
      asString(profile.avatarUrl) ??
      asString(profile.photoUrl) ??
      asString(profile.imageUrl),
    bio: asString(profile.bio),
    location: [city, country].filter(Boolean).join(", ") || undefined,
    interests,
    preferences: {
      mode,
      format,
      style: asString(profile.style) ?? asString(trust.interactionTone),
      availability:
        asString(profile.availability) ?? asString(trust.availabilityHint),
    },
    persona,
    systemUnderstanding: [],
    graph: summarizeGraph(null),
    context: {
      reason:
        args.contextReason ??
        asString(trust.suggestedReason) ??
        "Suggested by OpenSocial",
      sharedTopics,
      lastInteraction:
        args.lastInteraction ?? asString(trust.lastInteractionSummary),
    },
  };
}
