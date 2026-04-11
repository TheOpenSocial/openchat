"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import {
  WorkspaceHeader,
  WorkspaceMutedPanel,
  WorkspacePanel,
} from "@/src/components/layout/workspace";
import { Button } from "@/src/components/ui/button";
import { useAppSession } from "@/src/features/app-shell/app-session";
import {
  api,
  type SavedSearchRecord,
  type ScheduledTaskRecord,
  type ScheduledTaskRunRecord,
} from "@/src/lib/api";

export function ScheduledTasksScreen() {
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

    const load = async () => {
      setLoading(true);
      try {
        if (isDesignMock) {
          const mockSearch: SavedSearchRecord = {
            id: "saved_search_preview_1",
            userId: session.userId,
            title: "Search: design dinner",
            searchType: "activity_search",
            queryConfig: { q: "design dinner", limit: 6 },
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          };
          const mockTask: ScheduledTaskRecord = {
            id: "scheduled_task_preview_1",
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
              id: "run_preview_1",
              scheduledTaskId: mockTask.id,
              userId: session.userId,
              status: "queued",
              triggeredAt: new Date().toISOString(),
              startedAt: null,
              finishedAt: null,
              traceId: "trace_preview_1",
              resultPayload: null,
              errorMessage: null,
            },
          ]);
          return;
        }

        const [searches, tasks] = await Promise.all([
          api.listSavedSearches(session.userId, session.accessToken),
          api.listScheduledTasks(
            session.userId,
            { limit: 20 },
            session.accessToken,
          ),
        ]);
        setSavedSearches(searches);
        setScheduledTasks(tasks);
        setSelectedTaskId(tasks[0]?.id ?? null);
      } catch (error) {
        setBanner({
          tone: "error",
          text: `Could not load scheduled tasks: ${String(error)}`,
        });
      } finally {
        setLoading(false);
      }
    };

    void load();
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
      setBanner({ tone: "success", text: "Scheduled task created." });
    } catch (error) {
      setBanner({
        tone: "error",
        text: `Could not create scheduled task: ${String(error)}`,
      });
    }
  };

  const runNow = async () => {
    if (!session || !selectedTask) {
      return;
    }
    try {
      if (isDesignMock) {
        setBanner({ tone: "success", text: "Preview scheduled task queued." });
        return;
      }
      await api.runScheduledTaskNow(selectedTask.id, session.accessToken);
      const nextRuns = await api.listScheduledTaskRuns(
        selectedTask.id,
        8,
        session.accessToken,
      );
      setRuns(nextRuns);
      setBanner({ tone: "success", text: "Scheduled task queued to run now." });
    } catch (error) {
      setBanner({
        tone: "error",
        text: `Could not run scheduled task: ${String(error)}`,
      });
    }
  };

  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_0.95fr]">
      <WorkspacePanel>
        <WorkspaceHeader
          description="Run recurring social workflows on typed rails."
          title="Scheduled tasks"
        />
        <div className="mt-4 space-y-3">
          <div className="flex flex-wrap gap-2">
            <Button
              onClick={() => void createAutomationQuick()}
              type="button"
              variant="primary"
            >
              New scheduled task
            </Button>
            <Link href="/saved-searches">
              <Button type="button" variant="secondary">
                Open saved searches
              </Button>
            </Link>
          </div>

          {loading ? (
            <p className="text-sm text-ash">Loading scheduled tasks…</p>
          ) : scheduledTasks.length === 0 ? (
            <WorkspaceMutedPanel>
              <p className="text-sm leading-6 text-ash">
                No scheduled tasks yet. Create one to automate saved search or
                reminder delivery.
              </p>
            </WorkspaceMutedPanel>
          ) : (
            scheduledTasks.map((task) => (
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
            ))
          )}
        </div>
      </WorkspacePanel>

      <WorkspacePanel>
        <WorkspaceHeader
          description="Inspect the selected task and its recent executions."
          title="Runs"
        />
        <div className="mt-4 space-y-3">
          <Button
            disabled={!selectedTask}
            onClick={() => void runNow()}
            type="button"
            variant="secondary"
          >
            Run now
          </Button>
          {selectedTask ? (
            <>
              <WorkspaceMutedPanel>
                <p className="font-medium text-white/90">
                  {selectedTask.title}
                </p>
                <p className="mt-1 text-xs text-ash">
                  next run{" "}
                  {selectedTask.nextRunAt
                    ? new Date(selectedTask.nextRunAt).toLocaleString()
                    : "not scheduled"}
                </p>
              </WorkspaceMutedPanel>
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
            </>
          ) : (
            <WorkspaceMutedPanel>
              <p className="text-sm leading-6 text-ash">
                Select a scheduled task to inspect its recent runs.
              </p>
            </WorkspaceMutedPanel>
          )}
        </div>
      </WorkspacePanel>
    </div>
  );
}
