"use client";

import { useEffect, useMemo, useState } from "react";

import {
  WorkspaceHeader,
  WorkspaceMutedPanel,
  WorkspacePanel,
} from "@/src/components/layout/workspace";
import { Button } from "@/src/components/ui/button";
import { useAppSession } from "@/src/features/app-shell/app-session";
import Link from "next/link";
import {
  api,
  type SavedSearchRecord,
  type ScheduledTaskRecord,
  type ScheduledTaskRunRecord,
} from "@/src/lib/api";

export function AutomationsScreen() {
  const { isDesignMock, session, setBanner } = useAppSession();
  const [savedSearches, setSavedSearches] = useState<SavedSearchRecord[]>([]);
  const [scheduledTasks, setScheduledTasks] = useState<ScheduledTaskRecord[]>(
    [],
  );
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [runs, setRuns] = useState<ScheduledTaskRunRecord[]>([]);
  const [loading, setLoading] = useState(true);

  const selectedTask = useMemo(
    () => scheduledTasks.find((task) => task.id === selectedTaskId) ?? null,
    [scheduledTasks, selectedTaskId],
  );

  useEffect(() => {
    if (!session) {
      return;
    }
    if (isDesignMock) {
      const mockSearch: SavedSearchRecord = {
        id: "saved_search_1",
        userId: session.userId,
        title: "Search: design",
        searchType: "activity_search",
        queryConfig: { q: "design", limit: 6 },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      const mockTask: ScheduledTaskRecord = {
        id: "scheduled_task_1",
        userId: session.userId,
        title: "Weekly saved-search briefing",
        description: "A preview automation.",
        taskType: "saved_search",
        status: "active",
        scheduleType: "weekly",
        scheduleConfig: { day: "thu", hour: 18 },
        taskConfig: { savedSearchId: mockSearch.id },
        nextRunAt: new Date(Date.now() + 2 * 60 * 60_000).toISOString(),
        lastRunAt: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      setSavedSearches([mockSearch]);
      setScheduledTasks([mockTask]);
      setSelectedTaskId(mockTask.id);
      setRuns([
        {
          id: "run_1",
          scheduledTaskId: mockTask.id,
          userId: session.userId,
          status: "queued",
          triggeredAt: new Date().toISOString(),
          startedAt: null,
          finishedAt: null,
          traceId: "trace_mock_1",
          resultPayload: null,
          errorMessage: null,
        },
      ]);
      setLoading(false);
      return;
    }

    setLoading(true);
    void Promise.all([
      api.listSavedSearches(session.userId, session.accessToken),
      api.listScheduledTasks(
        session.userId,
        { limit: 20 },
        session.accessToken,
      ),
    ])
      .then(([searches, tasks]) => {
        setSavedSearches(searches);
        setScheduledTasks(tasks);
        setSelectedTaskId(tasks[0]?.id ?? null);
      })
      .catch((error) => {
        setBanner({
          tone: "error",
          text: `Could not load automations: ${String(error)}`,
        });
      })
      .finally(() => setLoading(false));
  }, [isDesignMock, session, setBanner]);

  useEffect(() => {
    if (!session || !selectedTaskId || isDesignMock) {
      return;
    }
    void api
      .listScheduledTaskRuns(selectedTaskId, 8, session.accessToken)
      .then(setRuns)
      .catch((error) => {
        setBanner({
          tone: "error",
          text: `Could not load task runs: ${String(error)}`,
        });
      });
  }, [isDesignMock, selectedTaskId, session, setBanner]);

  const createSavedSearchQuick = async () => {
    if (!session) {
      return;
    }
    try {
      if (isDesignMock) {
        setBanner({ tone: "success", text: "Preview saved search created." });
        return;
      }
      const created = await api.createSavedSearch(
        session.userId,
        {
          title: "Search: tennis",
          searchType: "activity_search",
          queryConfig: { q: "tennis", limit: 6 },
        },
        session.accessToken,
      );
      setSavedSearches((current) => [created, ...current]);
      setBanner({ tone: "success", text: "Saved search created." });
    } catch (error) {
      setBanner({
        tone: "error",
        text: `Could not create saved search: ${String(error)}`,
      });
    }
  };

  const createAutomationQuick = async () => {
    if (!session) {
      return;
    }
    try {
      if (isDesignMock) {
        setBanner({ tone: "success", text: "Preview automation created." });
        return;
      }
      let savedSearch = savedSearches[0];
      if (!savedSearch) {
        savedSearch = await api.createSavedSearch(
          session.userId,
          {
            title: "Search: tennis",
            searchType: "activity_search",
            queryConfig: { q: "tennis", limit: 6 },
          },
          session.accessToken,
        );
        setSavedSearches((current) => [savedSearch!, ...current]);
      }

      const created = await api.createScheduledTask(
        session.userId,
        {
          title: "Weekly saved-search briefing",
          description: "Runs your top saved search and posts a briefing.",
          schedule: {
            kind: "weekly",
            days: ["thu"],
            hour: 18,
            minute: 0,
            timezone: "UTC",
          },
          task: {
            taskType: "saved_search",
            config: {
              savedSearchId: savedSearch.id,
              deliveryMode: "notification_and_agent_thread",
              maxResults: 5,
            },
          },
        },
        session.accessToken,
      );
      setScheduledTasks((current) => [created, ...current]);
      setSelectedTaskId(created.id);
      setBanner({ tone: "success", text: "Scheduled automation created." });
    } catch (error) {
      setBanner({
        tone: "error",
        text: `Could not create automation: ${String(error)}`,
      });
    }
  };

  const runNow = async () => {
    if (!session || !selectedTask) {
      return;
    }
    try {
      if (isDesignMock) {
        setBanner({ tone: "success", text: "Preview automation queued." });
        return;
      }
      await api.runScheduledTaskNow(selectedTask.id, session.accessToken);
      const nextRuns = await api.listScheduledTaskRuns(
        selectedTask.id,
        8,
        session.accessToken,
      );
      setRuns(nextRuns);
      setBanner({ tone: "success", text: "Automation queued to run now." });
    } catch (error) {
      setBanner({
        tone: "error",
        text: `Could not run automation: ${String(error)}`,
      });
    }
  };

  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_1fr]">
      <WorkspacePanel>
        <WorkspaceHeader
          description="Build repeatable discovery inputs without turning search into a feed."
          title="Saved searches"
        />
        <div className="mt-4 space-y-3">
          <div className="flex flex-wrap gap-2">
            <Button
              onClick={() => void createSavedSearchQuick()}
              type="button"
              variant="secondary"
            >
              New saved search
            </Button>
            <Button
              onClick={() => void createAutomationQuick()}
              type="button"
              variant="primary"
            >
              New automation
            </Button>
            <Link href="/saved-searches">
              <Button type="button" variant="secondary">
                Open saved searches
              </Button>
            </Link>
            <Link href="/scheduled-tasks">
              <Button type="button" variant="secondary">
                Open scheduled tasks
              </Button>
            </Link>
          </div>
          {loading ? (
            <p className="text-sm text-ash">Loading automations…</p>
          ) : (
            savedSearches.map((search) => (
              <WorkspaceMutedPanel key={search.id}>
                <p className="font-medium text-white/90">{search.title}</p>
                <p className="text-xs text-ash">{search.searchType}</p>
              </WorkspaceMutedPanel>
            ))
          )}
        </div>
      </WorkspacePanel>

      <WorkspacePanel>
        <WorkspaceHeader
          description="Queue discovery briefings and reminders into notifications and agent threads."
          title="Scheduled tasks"
        />
        <div className="mt-4 space-y-3">
          <Button
            disabled={!selectedTask}
            onClick={() => void runNow()}
            type="button"
            variant="primary"
          >
            Run now
          </Button>

          {scheduledTasks.map((task) => (
            <button
              className={`w-full rounded-2xl border px-3 py-2 text-left text-sm ${
                selectedTaskId === task.id
                  ? "border-amber-300/30 bg-amber-300/12 text-amber-50"
                  : "border-[hsl(var(--border))] text-slate-200"
              }`}
              key={task.id}
              onClick={() => setSelectedTaskId(task.id)}
              type="button"
            >
              <p className="font-semibold">{task.title}</p>
              <p className="text-xs text-ash">
                {task.taskType} · {task.status}
              </p>
            </button>
          ))}

          {selectedTask ? (
            <WorkspaceMutedPanel className="text-sm text-ash">
              {runs.length === 0
                ? "No runs yet."
                : runs.map((run) => (
                    <p key={run.id}>
                      {new Date(run.triggeredAt).toLocaleString()} ·{" "}
                      {run.status}
                    </p>
                  ))}
            </WorkspaceMutedPanel>
          ) : null}
        </div>
      </WorkspacePanel>
    </div>
  );
}
