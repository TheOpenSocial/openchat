import { useCallback, useEffect, useMemo, useState } from "react";

import { api, type ScheduledTaskRecord } from "../../../lib/api";
import {
  buildScheduledTaskItem,
  type ScheduledTaskItem,
} from "../domain/task-item";

type UseScheduledTasksArgs = {
  accessToken: string;
  userId: string;
};

export function useScheduledTasks({
  accessToken,
  userId,
}: UseScheduledTasksArgs) {
  const [scheduledTasks, setScheduledTasks] = useState<ScheduledTaskRecord[]>(
    [],
  );
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [actingTaskId, setActingTaskId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    setError(null);

    try {
      const nextTasks = await api.listScheduledTasks(
        userId,
        undefined,
        accessToken,
      );
      setScheduledTasks(nextTasks);
    } catch (nextError) {
      setError(
        nextError instanceof Error
          ? nextError.message
          : "Unable to load scheduled tasks right now.",
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [accessToken, userId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const runNow = useCallback(
    async (taskId: string) => {
      setActingTaskId(taskId);
      setError(null);

      try {
        await api.runScheduledTaskNow(taskId, accessToken);
        await refresh();
      } catch (nextError) {
        setError(
          nextError instanceof Error
            ? nextError.message
            : "Unable to run this task right now.",
        );
      } finally {
        setActingTaskId(null);
      }
    },
    [accessToken, refresh],
  );

  const pause = useCallback(
    async (taskId: string) => {
      setActingTaskId(taskId);
      setError(null);

      try {
        await api.pauseScheduledTask(taskId, accessToken);
        await refresh();
      } catch (nextError) {
        setError(
          nextError instanceof Error
            ? nextError.message
            : "Unable to pause this task.",
        );
      } finally {
        setActingTaskId(null);
      }
    },
    [accessToken, refresh],
  );

  const resume = useCallback(
    async (taskId: string) => {
      setActingTaskId(taskId);
      setError(null);

      try {
        await api.resumeScheduledTask(taskId, accessToken);
        await refresh();
      } catch (nextError) {
        setError(
          nextError instanceof Error
            ? nextError.message
            : "Unable to resume this task.",
        );
      } finally {
        setActingTaskId(null);
      }
    },
    [accessToken, refresh],
  );

  const archive = useCallback(
    async (taskId: string) => {
      setActingTaskId(taskId);
      setError(null);

      try {
        await api.archiveScheduledTask(taskId, accessToken);
        await refresh();
      } catch (nextError) {
        setError(
          nextError instanceof Error
            ? nextError.message
            : "Unable to archive this task.",
        );
      } finally {
        setActingTaskId(null);
      }
    },
    [accessToken, refresh],
  );

  const items = useMemo<ScheduledTaskItem[]>(
    () => scheduledTasks.map((task) => buildScheduledTaskItem(task)),
    [scheduledTasks],
  );

  return {
    actingTaskId,
    archive,
    error,
    items,
    loading,
    pause,
    refresh,
    refreshing,
    resume,
    runNow,
  };
}
