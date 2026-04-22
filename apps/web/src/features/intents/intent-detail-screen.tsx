"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import {
  WorkspaceHeader,
  WorkspaceList,
  WorkspaceListItem,
  WorkspaceMutedPanel,
  WorkspacePanel,
} from "@/src/components/layout/workspace";
import { Badge } from "@/src/components/ui/badge";
import { Button } from "@/src/components/ui/button";
import { useAppSession } from "@/src/features/app-shell/app-session";
import {
  api,
  type PendingIntentsSummaryResponse,
  type UserIntentExplanation,
} from "@/src/lib/api";

function createMockExplanation(intentId: string): UserIntentExplanation {
  return {
    intentId,
    status: "routing",
    summary:
      "This preview intent is being matched against high-signal people and timing rules.",
    factors: [
      "Shared product and design context",
      "Compatible availability this week",
      "Prefers concise 1:1 or small-group flow",
    ],
  };
}

export function IntentDetailScreen({ intentId }: { intentId: string }) {
  const { isDesignMock, session, setBanner } = useAppSession();
  const [loading, setLoading] = useState(true);
  const [explanation, setExplanation] = useState<UserIntentExplanation | null>(
    null,
  );
  const [pendingSummary, setPendingSummary] =
    useState<PendingIntentsSummaryResponse | null>(null);

  useEffect(() => {
    if (!session) {
      return;
    }

    const load = async () => {
      setLoading(true);
      try {
        if (isDesignMock) {
          const mock = createMockExplanation(intentId);
          setExplanation(mock);
          setPendingSummary({
            userId: session.userId,
            activeIntentCount: 1,
            summaryText: "1 routing flow is active.",
            intents: [
              {
                intentId,
                rawText: "Find people for a small dinner this week.",
                status: mock.status,
                ageMinutes: 14,
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
          return;
        }

        const [summary, detail] = await Promise.all([
          api.summarizePendingIntents(session.userId, 10, session.accessToken),
          api.getUserIntentExplanation(intentId, session.accessToken),
        ]);
        setPendingSummary(summary);
        setExplanation(detail);
      } catch (error) {
        setBanner({
          tone: "error",
          text: `Could not load intent detail: ${String(error)}`,
        });
      } finally {
        setLoading(false);
      }
    };

    void load();
  }, [intentId, isDesignMock, session, setBanner]);

  const activeIntent = useMemo(
    () =>
      pendingSummary?.intents.find((intent) => intent.intentId === intentId) ??
      null,
    [intentId, pendingSummary],
  );

  return (
    <div className="grid gap-4 xl:grid-cols-[1.05fr_0.95fr]">
      <WorkspacePanel>
        <WorkspaceHeader
          description="Inspect one intent, its live status, and the current downstream request counts."
          title="Intent detail"
        />

        {loading ? (
          <p className="mt-4 text-sm text-ash">Loading intent detail…</p>
        ) : (
          <div className="mt-4 space-y-4">
            <div className="flex flex-wrap gap-2">
              <Badge variant="primary">{intentId.slice(0, 10)}</Badge>
              <Badge>
                {activeIntent?.status ?? explanation?.status ?? "unknown"}
              </Badge>
              <Badge variant="success">
                requests {activeIntent?.requests.pending ?? 0}
              </Badge>
            </div>

            <WorkspaceMutedPanel>
              <p className="text-sm leading-6 text-ash">
                {activeIntent?.rawText ??
                  explanation?.summary ??
                  "No intent summary available."}
              </p>
            </WorkspaceMutedPanel>

            <div className="grid gap-3 sm:grid-cols-2">
              <WorkspaceMutedPanel>
                <p className="text-xs uppercase tracking-[0.22em] text-ash">
                  Pending
                </p>
                <p className="mt-1 text-lg font-semibold text-white">
                  {activeIntent?.requests.pending ?? 0}
                </p>
              </WorkspaceMutedPanel>
              <WorkspaceMutedPanel>
                <p className="text-xs uppercase tracking-[0.22em] text-ash">
                  Accepted
                </p>
                <p className="mt-1 text-lg font-semibold text-white">
                  {activeIntent?.requests.accepted ?? 0}
                </p>
              </WorkspaceMutedPanel>
              <WorkspaceMutedPanel>
                <p className="text-xs uppercase tracking-[0.22em] text-ash">
                  Rejected
                </p>
                <p className="mt-1 text-lg font-semibold text-white">
                  {activeIntent?.requests.rejected ?? 0}
                </p>
              </WorkspaceMutedPanel>
              <WorkspaceMutedPanel>
                <p className="text-xs uppercase tracking-[0.22em] text-ash">
                  Age
                </p>
                <p className="mt-1 text-lg font-semibold text-white">
                  {activeIntent ? `${activeIntent.ageMinutes}m` : "n/a"}
                </p>
              </WorkspaceMutedPanel>
            </div>
          </div>
        )}
      </WorkspacePanel>

      <div className="space-y-4">
        <WorkspacePanel>
          <WorkspaceHeader
            description="Deterministic factors behind the routing decision."
            title="Why this result"
          />
          <div className="mt-4">
            {explanation ? (
              <WorkspaceList>
                {explanation.factors.map((factor) => (
                  <WorkspaceListItem key={factor}>
                    <p className="text-sm leading-6 text-white/90">{factor}</p>
                  </WorkspaceListItem>
                ))}
              </WorkspaceList>
            ) : (
              <WorkspaceMutedPanel>
                <p className="text-sm leading-6 text-ash">
                  The reasoning will appear here once the backend explanation is
                  available.
                </p>
              </WorkspaceMutedPanel>
            )}
          </div>
        </WorkspacePanel>

        <WorkspacePanel>
          <WorkspaceHeader
            description="Use this route as the pivot point into the rest of the shell."
            title="Next actions"
          />
          <div className="mt-4 flex flex-wrap gap-2">
            <Link href="/activity">
              <Button type="button" variant="secondary">
                View activity
              </Button>
            </Link>
            <Link href="/requests">
              <Button type="button" variant="secondary">
                View requests
              </Button>
            </Link>
            <Link href="/discover">
              <Button type="button" variant="secondary">
                Back to discover
              </Button>
            </Link>
          </div>
        </WorkspacePanel>
      </div>
    </div>
  );
}
