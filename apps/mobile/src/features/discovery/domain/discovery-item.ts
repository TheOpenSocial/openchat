import type {
  DiscoveryAgentRecommendationsResponse,
  DiscoveryGroupSuggestion,
  DiscoveryInboxSuggestionsResponse,
  DiscoveryReconnectSuggestion,
  DiscoveryUserSuggestion,
  PassiveDiscoveryResponse,
} from "../../../lib/api";

export type DiscoveryItemKind =
  | "briefing"
  | "tonight"
  | "group"
  | "reconnect"
  | "inbox";

export interface DiscoveryItem {
  id: string;
  kind: DiscoveryItemKind;
  title: string;
  body: string;
  meta: string;
  score: number;
  targetUserId?: string;
}

export interface DiscoverySection {
  id: string;
  title: string;
  description: string;
  items: DiscoveryItem[];
}

export interface DiscoveryFeedViewModel {
  headline: string;
  briefing: string | null;
  sections: DiscoverySection[];
}

function formatScore(score: number) {
  return `${Math.round(score * 100)}%`;
}

function mapTonightItem(user: DiscoveryUserSuggestion): DiscoveryItem {
  return {
    id: `tonight:${user.userId}`,
    kind: "tonight",
    title: user.displayName,
    body: user.reason,
    meta: formatScore(user.score),
    score: user.score,
    targetUserId: user.userId,
  };
}

function mapGroupItem(group: DiscoveryGroupSuggestion): DiscoveryItem {
  return {
    id: `group:${group.title}`,
    kind: "group",
    title: group.title,
    body: group.topic,
    meta: `${group.participantUserIds.length} people`,
    score: group.score,
  };
}

function mapReconnectItem(
  reconnect: DiscoveryReconnectSuggestion,
): DiscoveryItem {
  return {
    id: `reconnect:${reconnect.userId}`,
    kind: "reconnect",
    title: reconnect.displayName,
    body:
      reconnect.lastInteractionAt != null
        ? `${reconnect.interactionCount} past interactions`
        : "Worth revisiting",
    meta: `${reconnect.interactionCount}x`,
    score: reconnect.score,
    targetUserId: reconnect.userId,
  };
}

function mapInboxItem(
  title: string,
  reason: string,
  score: number,
): DiscoveryItem {
  return {
    id: `inbox:${title}`,
    kind: "inbox",
    title,
    body: reason,
    meta: formatScore(score),
    score,
  };
}

function buildSection(
  id: string,
  title: string,
  description: string,
  items: DiscoveryItem[],
): DiscoverySection {
  return {
    id,
    title,
    description,
    items: items.sort((left, right) => right.score - left.score),
  };
}

export function buildDiscoveryViewModel(input: {
  agentRecommendations: DiscoveryAgentRecommendationsResponse | null;
  inboxSuggestions: DiscoveryInboxSuggestionsResponse | null;
  passiveDiscovery: PassiveDiscoveryResponse | null;
}): DiscoveryFeedViewModel {
  const passive =
    input.agentRecommendations?.discovery ?? input.passiveDiscovery;
  const headline =
    input.agentRecommendations?.message?.trim() ||
    passive?.tonight.suggestions[0]?.reason?.trim() ||
    "Fresh people and groups to explore.";

  const briefing =
    input.agentRecommendations?.delivered === false
      ? "The agent briefing is not ready yet, but passive discovery is available."
      : (input.agentRecommendations?.message?.trim() ?? null);

  const sections: DiscoverySection[] = [];

  if (passive?.tonight.suggestions.length) {
    sections.push(
      buildSection(
        "tonight",
        "Tonight",
        "People and moments that look alive right now.",
        passive.tonight.suggestions.map(mapTonightItem),
      ),
    );
  }

  if (passive?.groups.groups.length) {
    sections.push(
      buildSection(
        "groups",
        "Groups",
        "Small circles and group ideas worth opening.",
        passive.groups.groups.map(mapGroupItem),
      ),
    );
  }

  if (passive?.reconnects.reconnects.length) {
    sections.push(
      buildSection(
        "reconnects",
        "Reconnects",
        "People with recent shared history.",
        passive.reconnects.reconnects.map(mapReconnectItem),
      ),
    );
  }

  if (input.inboxSuggestions?.suggestions.length) {
    sections.push(
      buildSection(
        "inbox-suggestions",
        "Inbox suggestions",
        "Soft leads the system thinks are worth nudging.",
        input.inboxSuggestions.suggestions.map((suggestion) =>
          mapInboxItem(suggestion.title, suggestion.reason, suggestion.score),
        ),
      ),
    );
  }

  return {
    briefing,
    headline,
    sections,
  };
}
