"use client";

import { useEffect, useState } from "react";

import {
  WorkspaceHeader,
  WorkspaceMutedPanel,
  WorkspacePanel,
} from "@/src/components/layout/workspace";
import { Button } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";
import { useAppSession } from "@/src/features/app-shell/app-session";
import {
  api,
  type DiscoveryInboxSuggestionsResponse,
  type PassiveDiscoveryResponse,
  type PendingIntentsSummaryResponse,
  type SearchSnapshotResponse,
  type UserIntentExplanation,
} from "@/src/lib/api";

export function DiscoverScreen() {
  const { isDesignMock, session, setBanner } = useAppSession();
  const [discoveryBusy, setDiscoveryBusy] = useState(false);
  const [passiveDiscovery, setPassiveDiscovery] =
    useState<PassiveDiscoveryResponse | null>(null);
  const [inboxSuggestions, setInboxSuggestions] =
    useState<DiscoveryInboxSuggestionsResponse | null>(null);
  const [pendingSummary, setPendingSummary] =
    useState<PendingIntentsSummaryResponse | null>(null);
  const [selectedIntentId, setSelectedIntentId] = useState<string | null>(null);
  const [explanation, setExplanation] = useState<UserIntentExplanation | null>(
    null,
  );
  const [searchQuery, setSearchQuery] = useState("");
  const [searchSnapshot, setSearchSnapshot] =
    useState<SearchSnapshotResponse | null>(null);
  const [searchBusy, setSearchBusy] = useState(false);

  useEffect(() => {
    if (!session) {
      return;
    }

    const load = async () => {
      setDiscoveryBusy(true);
      try {
        if (isDesignMock) {
          setPassiveDiscovery({
            userId: session.userId,
            generatedAt: new Date().toISOString(),
            tonight: {
              suggestions: [
                {
                  userId: "u1",
                  displayName: "Maya",
                  score: 0.93,
                  reason: "Shared design interest",
                },
                {
                  userId: "u2",
                  displayName: "Jordan",
                  score: 0.86,
                  reason: "Nearby tonight",
                },
              ],
              seedTopics: ["Design", "AI"],
            },
            activeIntentsOrUsers: { items: [] },
            groups: {
              groups: [
                {
                  title: "Friday founder dinner",
                  topic: "Startups",
                  participantUserIds: ["u1", "u2", "u3"],
                  score: 0.79,
                },
              ],
            },
            reconnects: {
              reconnects: [
                {
                  userId: "u4",
                  displayName: "Sofia",
                  interactionCount: 4,
                  lastInteractionAt: new Date().toISOString(),
                  score: 0.81,
                },
              ],
            },
          });
          setInboxSuggestions({
            userId: session.userId,
            generatedAt: new Date().toISOString(),
            pendingRequestCount: 2,
            suggestions: [
              {
                title: "Reply to Maya’s dinner request",
                reason: "Strong timing overlap",
                score: 0.82,
              },
            ],
          });
          setPendingSummary({
            userId: session.userId,
            activeIntentCount: 1,
            summaryText: "1 active intent.",
            intents: [
              {
                intentId: "intent_mock_1",
                rawText: "Find people for design dinner this week.",
                status: "routing",
                ageMinutes: 11,
                requests: {
                  pending: 2,
                  accepted: 1,
                  rejected: 0,
                  expired: 0,
                  cancelled: 0,
                },
              },
            ],
          });
          setSelectedIntentId("intent_mock_1");
          setExplanation({
            intentId: "intent_mock_1",
            status: "routing",
            summary:
              "We prioritized design-adjacent people who are free this week and usually accept 1:1 plans.",
            factors: [
              "Shared design interest",
              "Available this week",
              "Prefers 1:1",
            ],
          });
          return;
        }

        const [passive, inbox, pending] = await Promise.all([
          api.getPassiveDiscovery(session.userId, 4, session.accessToken),
          api.getDiscoveryInboxSuggestions(
            session.userId,
            4,
            session.accessToken,
          ),
          api.summarizePendingIntents(session.userId, 8, session.accessToken),
        ]);
        setPassiveDiscovery(passive);
        setInboxSuggestions(inbox);
        setPendingSummary(pending);
        setSelectedIntentId(pending.intents[0]?.intentId ?? null);
      } catch (error) {
        setBanner({
          tone: "error",
          text: `Could not load discovery: ${String(error)}`,
        });
      } finally {
        setDiscoveryBusy(false);
      }
    };

    void load();
  }, [isDesignMock, session, setBanner]);

  useEffect(() => {
    if (!session || !selectedIntentId || isDesignMock) {
      return;
    }
    void api
      .getUserIntentExplanation(selectedIntentId, session.accessToken)
      .then(setExplanation)
      .catch((error) => {
        setBanner({
          tone: "error",
          text: `Could not load routing explanation: ${String(error)}`,
        });
      });
  }, [isDesignMock, selectedIntentId, session, setBanner]);

  const runSearch = async () => {
    if (!session || !searchQuery.trim()) {
      return;
    }
    if (isDesignMock) {
      setSearchSnapshot({
        userId: session.userId,
        query: searchQuery,
        generatedAt: new Date().toISOString(),
        users: [
          {
            userId: "usr_mock_1",
            displayName: "Avery",
            city: "San Francisco",
            country: "US",
            moderationState: "clean",
            score: 0.89,
          },
        ],
        topics: [{ label: searchQuery, count: 4, score: 0.72 }],
        activities: [],
        groups: [],
      });
      return;
    }

    setSearchBusy(true);
    try {
      const result = await api.search(
        session.userId,
        searchQuery.trim(),
        6,
        session.accessToken,
      );
      setSearchSnapshot(result);
    } catch (error) {
      setBanner({
        tone: "error",
        text: `Could not run search: ${String(error)}`,
      });
    } finally {
      setSearchBusy(false);
    }
  };

  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <WorkspacePanel>
        <WorkspaceHeader
          description="Sparse, high-signal people, groups, and reconnect prompts."
          title="Passive discovery"
        />
        <div className="mt-4 space-y-4">
          <Button
            disabled={discoveryBusy}
            onClick={() => {
              if (session) {
                setSelectedIntentId(
                  pendingSummary?.intents[0]?.intentId ?? null,
                );
              }
            }}
            type="button"
            variant="secondary"
          >
            {discoveryBusy ? "Refreshing…" : "Refresh snapshot"}
          </Button>
          <div className="space-y-2">
            {(passiveDiscovery?.tonight.suggestions ?? []).map((item) => (
              <WorkspaceMutedPanel key={item.userId}>
                <p className="font-medium text-white/90">{item.displayName}</p>
                <p className="text-xs text-ash">{item.reason}</p>
              </WorkspaceMutedPanel>
            ))}
          </div>
          <WorkspaceMutedPanel>
            <p className="font-medium text-white/90">Continuity prompt</p>
            <p className="mt-1 text-sm text-ash">
              {inboxSuggestions?.suggestions[0]?.title ??
                "No continuity prompt yet."}
            </p>
          </WorkspaceMutedPanel>
        </div>
      </WorkspacePanel>

      <WorkspacePanel>
        <WorkspaceHeader
          description="Support discovery without turning the app into a feed."
          title="Search and routing explanation"
        />
        <div className="mt-4 space-y-4">
          <div className="flex gap-2">
            <Input
              onChange={(event) => setSearchQuery(event.currentTarget.value)}
              placeholder="tennis, startups, design"
              value={searchQuery}
            />
            <Button
              disabled={searchBusy || !searchQuery.trim()}
              onClick={() => {
                void runSearch();
              }}
              type="button"
              variant="primary"
            >
              {searchBusy ? "…" : "Search"}
            </Button>
          </div>

          {searchSnapshot ? (
            <WorkspaceMutedPanel className="text-sm text-ash">
              users {searchSnapshot.users.length} · topics{" "}
              {searchSnapshot.topics.length} · groups{" "}
              {searchSnapshot.groups.length}
            </WorkspaceMutedPanel>
          ) : null}

          <div className="flex flex-wrap gap-2">
            {pendingSummary?.intents.map((intent) => (
              <Button
                key={intent.intentId}
                onClick={() => setSelectedIntentId(intent.intentId)}
                size="sm"
                type="button"
                variant={
                  selectedIntentId === intent.intentId ? "primary" : "secondary"
                }
              >
                {intent.rawText.slice(0, 24)}
              </Button>
            ))}
          </div>

          <WorkspaceMutedPanel>
            <p className="font-medium text-white/90">Why this routing result</p>
            <p className="mt-2 text-sm text-ash">
              {explanation?.summary ??
                "Choose an active intent to inspect deterministic reasoning."}
            </p>
            <div className="mt-2 space-y-1 text-xs text-white/80">
              {explanation?.factors.map((factor) => (
                <p key={factor}>{factor}</p>
              ))}
            </div>
          </WorkspaceMutedPanel>
        </div>
      </WorkspacePanel>
    </div>
  );
}
