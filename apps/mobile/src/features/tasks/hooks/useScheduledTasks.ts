import { useCallback, useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api, type ScheduledTaskRecord } from "../../../lib/api";
import { mobileQueryKeys } from "../../../lib/query-client";
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
  const queryClient = useQueryClient();
  const tasksQuery = useQuery({
    enabled: Boolean(accessToken && userId),
    queryFn: () => api.listScheduledTasks(userId, undefined, accessToken),
    queryKey: mobileQueryKeys.scheduledTasks(userId),
  });

  const refresh = useCallback(async () => {
    await tasksQuery.refetch();
  }, [tasksQuery]);

  const runNowMutation = useMutation({
    mutationFn: (taskId: string) =>
      api.runScheduledTaskNow(taskId, accessToken),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: mobileQueryKeys.scheduledTasks(userId),
      });
    },
  });

  const pauseMutation = useMutation({
    mutationFn: (taskId: string) => api.pauseScheduledTask(taskId, accessToken),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: mobileQueryKeys.scheduledTasks(userId),
      });
    },
  });

  const resumeMutation = useMutation({
    mutationFn: (taskId: string) =>
      api.resumeScheduledTask(taskId, accessToken),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: mobileQueryKeys.scheduledTasks(userId),
      });
    },
  });

  const archiveMutation = useMutation({
    mutationFn: (taskId: string) =>
      api.archiveScheduledTask(taskId, accessToken),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: mobileQueryKeys.scheduledTasks(userId),
      });
    },
  });

  const runNow = useCallback(
    async (taskId: string) => {
      await runNowMutation.mutateAsync(taskId);
    },
    [runNowMutation],
  );

  const pause = useCallback(
    async (taskId: string) => {
      await pauseMutation.mutateAsync(taskId);
    },
    [pauseMutation],
  );

  const resume = useCallback(
    async (taskId: string) => {
      await resumeMutation.mutateAsync(taskId);
    },
    [resumeMutation],
  );

  const archive = useCallback(
    async (taskId: string) => {
      await archiveMutation.mutateAsync(taskId);
    },
    [archiveMutation],
  );

  const items = useMemo<ScheduledTaskItem[]>(
    () =>
      (tasksQuery.data ?? []).map((task: ScheduledTaskRecord) =>
        buildScheduledTaskItem(task),
      ),
    [tasksQuery.data],
  );

  const actingTaskId =
    runNowMutation.variables ??
    pauseMutation.variables ??
    resumeMutation.variables ??
    archiveMutation.variables ??
    null;
  const error =
    (runNowMutation.error instanceof Error && runNowMutation.error.message) ||
    (pauseMutation.error instanceof Error && pauseMutation.error.message) ||
    (resumeMutation.error instanceof Error && resumeMutation.error.message) ||
    (archiveMutation.error instanceof Error && archiveMutation.error.message) ||
    (tasksQuery.error instanceof Error && tasksQuery.error.message) ||
    null;

  return {
    actingTaskId,
    archive,
    error,
    items,
    loading: tasksQuery.isLoading && !tasksQuery.data,
    pause,
    refresh,
    refreshing: tasksQuery.isRefetching,
    resume,
    runNow,
  };
}
