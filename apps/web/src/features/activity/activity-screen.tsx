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
  type InboxRequestRecord,
  type PendingIntentsSummaryResponse,
  type SavedSearchRecord,
  type ScheduledTaskRecord,
} from "@/src/lib/api";

type ActivityItem = {
  id: string;
  kind: "intent" | "request" | "task" | "search";
  title: string;
  detail: string;
  href: string;
  timestamp: string;
};

function createMockActivitySummary(userId: string): {
  pendingSummary: PendingIntentsSummaryResponse;
  requests: InboxRequestRecord[];
  tasks: ScheduledTaskRecord[];
  searches: SavedSearchRecord[];
} {
  const now = new Date();
  return {
    pendingSummary: {
      userId,
      activeIntentCount: 2,
      summaryText: "2 routing flows are active and being tracked.",
      intents: [
        {
          intentId: "intent_mock_activity_1",
          rawText: "Find three people for a small product dinner.",
          status: "routing",
          ageMinutes: 12,
          requests: {
            pending: 2,
            accepted: 1,
            rejected: 0,
            expired: 0,
            cancelled: 0,
          },
        },
        {
          intentId: "intent_mock_activity_2",
          rawText: "Reconnect with design peers after the launch.",
          status: "queued",
          ageMinutes: 34,
          requests: {
            pending: 1,
            accepted: 0,
            rejected: 0,
            expired: 0,
            cancelled: 0,
          },
        },
      ],
    },
    requests: [
      {
        id: "req_mock_activity_1",
        intentId: "intent_mock_activity_1",
        senderUserId: "user_maya",
        recipientUserId: userId,
        status: "pending",
        wave: 1,
        createdAt: now.toISOString(),
      },
    ],
    tasks: [
      {
        id: "task_mock_activity_1",
        userId,
        title: "Weekly saved-search briefing",
        description: "Preview automation for routing visibility.",
        taskType: "saved_search",
        status: "active",
        scheduleType: "weekly",
        scheduleConfig: { day: "thu", hour: 18 },
        taskConfig: { savedSearchId: "search_mock_activity_1" },
        nextRunAt: new Date(now.getTime() + 90 * 60_000).toISOString(),
        lastRunAt: null,
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
      },
    ],
    searches: [
      {
        id: "search_mock_activity_1",
        userId,
        title: "Search: design dinner",
        searchType: "activity_search",
        queryConfig: { q: "design dinner", limit: 6 },
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
      },
    ],
  };
}

export function ActivityScreen() {
  const { isDesignMock, session, setBanner } = useAppSession();
  const [loading, setLoading] = useState(true);
  const [pendingSummary, setPendingSummary] =
    useState<PendingIntentsSummaryResponse | null>(null);
  const [requests, setRequests] = useState<InboxRequestRecord[]>([]);
  const [tasks, setTasks] = useState<ScheduledTaskRecord[]>([]);
  const [searches, setSearches] = useState<SavedSearchRecord[]>([]);

  useEffect(() => {
    if (!session) {
      return;
    }

    const load = async () => {
      setLoading(true);
      try {
        if (isDesignMock) {
          const mock = createMockActivitySummary(session.userId);
          setPendingSummary(mock.pendingSummary);
          setRequests(mock.requests);
          setTasks(mock.tasks);
          setSearches(mock.searches);
          return;
        }

        const [summary, requestRows, taskRows, searchRows] = await Promise.all([
          api.summarizePendingIntents(session.userId, 8, session.accessToken),
          api.listPendingRequests(session.userId, session.accessToken),
          api.listScheduledTasks(
            session.userId,
            { limit: 6 },
            session.accessToken,
          ),
          api.listSavedSearches(session.userId, session.accessToken),
        ]);
        setPendingSummary(summary);
        setRequests(requestRows);
        setTasks(taskRows);
        setSearches(searchRows);
      } catch (error) {
        setBanner({
          tone: "error",
          text: `Could not load activity: ${String(error)}`,
        });
      } finally {
        setLoading(false);
      }
    };

    void load();
  }, [isDesignMock, session, setBanner]);

  const items = useMemo<ActivityItem[]>(() => {
    const result: ActivityItem[] = [];

    for (const intent of pendingSummary?.intents ?? []) {
      result.push({
        id: intent.intentId,
        kind: "intent",
        title: intent.rawText,
        detail: `${intent.status} · pending ${intent.requests.pending} · accepted ${intent.requests.accepted}`,
        href: `/intents/${intent.intentId}`,
        timestamp: new Date(
          Date.now() - intent.ageMinutes * 60_000,
        ).toISOString(),
      });
    }

    for (const request of requests) {
      result.push({
        id: request.id,
        kind: "request",
        title: `Request ${request.id.slice(0, 8)}`,
        detail: `${request.status} · sender ${request.senderUserId.slice(0, 8)} · wave ${request.wave}`,
        href: "/requests",
        timestamp: request.createdAt,
      });
    }

    for (const task of tasks) {
      result.push({
        id: task.id,
        kind: "task",
        title: task.title,
        detail: `${task.status} · ${task.scheduleType} · next ${
          task.nextRunAt ? new Date(task.nextRunAt).toLocaleString() : "none"
        }`,
        href: "/scheduled-tasks",
        timestamp: task.updatedAt,
      });
    }

    for (const search of searches) {
      result.push({
        id: search.id,
        kind: "search",
        title: search.title,
        detail: `${search.searchType} · saved search`,
        href: "/saved-searches",
        timestamp: search.updatedAt,
      });
    }

    return result.sort(
      (left, right) => Date.parse(right.timestamp) - Date.parse(left.timestamp),
    );
  }, [pendingSummary, requests, searches, tasks]);

  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_0.88fr]">
      <WorkspacePanel>
        <WorkspaceHeader
          actions={
            <Button
              onClick={() => window.location.reload()}
              type="button"
              variant="secondary"
            >
              Refresh
            </Button>
          }
          description="Recent routing, request, and automation signals without turning the app into a feed."
          title="Activity"
        />

        <div className="mt-4 flex flex-wrap gap-2">
          <Badge variant="success">
            active intents {pendingSummary?.activeIntentCount ?? 0}
          </Badge>
          <Badge>pending requests {requests.length}</Badge>
          <Badge>scheduled tasks {tasks.length}</Badge>
        </div>

        <p className="mt-3 text-sm leading-6 text-ash">
          {pendingSummary?.summaryText ??
            "Activity will show up here once routing and automation data are available."}
        </p>

        <div className="mt-4 flex flex-wrap gap-2">
          <Link href="/requests">
            <Button type="button" variant="secondary">
              Open requests
            </Button>
          </Link>
          <Link href="/connections">
            <Button type="button" variant="secondary">
              Open connections
            </Button>
          </Link>
          <Link href="/settings">
            <Button type="button" variant="secondary">
              Open settings
            </Button>
          </Link>
        </div>

        <div className="mt-5">
          {loading ? (
            <p className="text-sm text-ash">Loading activity…</p>
          ) : items.length === 0 ? (
            <WorkspaceMutedPanel>
              <p className="text-sm leading-6 text-ash">
                No recent activity yet. Start an intent or create a request to
                populate this view.
              </p>
            </WorkspaceMutedPanel>
          ) : (
            <WorkspaceList>
              {items.map((item) => (
                <WorkspaceListItem key={item.id}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-medium text-white/92">{item.title}</p>
                      <p className="mt-1 text-xs leading-5 text-ash">
                        {item.detail}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge>{item.kind}</Badge>
                      <Link href={item.href}>
                        <Button size="sm" type="button" variant="secondary">
                          Open
                        </Button>
                      </Link>
                    </div>
                  </div>
                </WorkspaceListItem>
              ))}
            </WorkspaceList>
          )}
        </div>
      </WorkspacePanel>

      <div className="space-y-4">
        <WorkspacePanel>
          <WorkspaceHeader
            description="Keep the routing loop visible without leaving the shell."
            title="Current queues"
          />
          <div className="mt-4 space-y-2">
            <WorkspaceMutedPanel>
              <p className="text-sm leading-6 text-ash">
                Active intents {pendingSummary?.activeIntentCount ?? 0}
              </p>
            </WorkspaceMutedPanel>
            <WorkspaceMutedPanel>
              <p className="text-sm leading-6 text-ash">
                Pending requests {requests.length}
              </p>
            </WorkspaceMutedPanel>
            <WorkspaceMutedPanel>
              <p className="text-sm leading-6 text-ash">
                Scheduled tasks {tasks.length}
              </p>
            </WorkspaceMutedPanel>
          </div>
        </WorkspacePanel>

        <WorkspacePanel>
          <WorkspaceHeader
            description="Jump into the rest of the surface from one place."
            title="Quick links"
          />
          <div className="mt-4 flex flex-wrap gap-2">
            <Link href="/home">
              <Button type="button" variant="secondary">
                Home
              </Button>
            </Link>
            <Link href="/discover">
              <Button type="button" variant="secondary">
                Discover
              </Button>
            </Link>
            <Link href="/automations">
              <Button type="button" variant="secondary">
                Automations
              </Button>
            </Link>
            <Link href="/saved-searches">
              <Button type="button" variant="secondary">
                Saved searches
              </Button>
            </Link>
            <Link href="/scheduled-tasks">
              <Button type="button" variant="secondary">
                Scheduled tasks
              </Button>
            </Link>
            <Link href="/profile">
              <Button type="button" variant="secondary">
                Profile
              </Button>
            </Link>
          </div>
        </WorkspacePanel>
      </div>
    </div>
  );
}
