import { useCallback, useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  api,
  type RecurringCircleRecord,
  type RecurringCircleSessionRecord,
} from "../../../lib/api";
import { mobileQueryKeys } from "../../../lib/query-client";
import {
  buildRecurringCircleItem,
  type RecurringCircleItem,
} from "../domain/recurring-item";

type UseRecurringCirclesArgs = {
  accessToken: string;
  userId: string;
};

type SessionMap = Record<string, RecurringCircleSessionRecord[]>;

type RecurringCirclesPayload = {
  circles: RecurringCircleRecord[];
  sessionsByCircleId: SessionMap;
};

export function useRecurringCircles({
  accessToken,
  userId,
}: UseRecurringCirclesArgs) {
  const queryClient = useQueryClient();
  const recurringQuery = useQuery({
    enabled: Boolean(accessToken && userId),
    queryFn: async (): Promise<RecurringCirclesPayload> => {
      const nextCircles = await api.listRecurringCircles(userId, accessToken);
      const sessionEntries: Array<
        readonly [string, RecurringCircleSessionRecord[]]
      > = await Promise.all(
        nextCircles.map(async (circle) => {
          try {
            const sessions = await api.listRecurringCircleSessions(
              circle.id,
              accessToken,
            );
            return [circle.id, sessions] as const;
          } catch {
            return [circle.id, [] as RecurringCircleSessionRecord[]] as const;
          }
        }),
      );

      return {
        circles: nextCircles,
        sessionsByCircleId: Object.fromEntries(sessionEntries) as SessionMap,
      };
    },
    queryKey: mobileQueryKeys.recurringCircles(userId),
  });

  const items = useMemo<RecurringCircleItem[]>(
    () =>
      (recurringQuery.data?.circles ?? []).map((circle) =>
        buildRecurringCircleItem(
          circle,
          recurringQuery.data?.sessionsByCircleId[circle.id] ?? [],
        ),
      ),
    [recurringQuery.data],
  );

  const refresh = useCallback(async () => {
    await recurringQuery.refetch();
  }, [recurringQuery]);

  const runNowMutation = useMutation({
    mutationFn: (circleId: string) =>
      api.runRecurringCircleSessionNow(circleId, accessToken),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: mobileQueryKeys.recurringCircles(userId),
      });
    },
  });

  const runNow = useCallback(
    async (circleId: string) => {
      await runNowMutation.mutateAsync(circleId);
    },
    [runNowMutation],
  );

  return {
    actingCircleId: runNowMutation.variables ?? null,
    error:
      (runNowMutation.error instanceof Error && runNowMutation.error.message) ||
      (recurringQuery.error instanceof Error && recurringQuery.error.message) ||
      null,
    items,
    loading: recurringQuery.isLoading && !recurringQuery.data,
    refresh,
    refreshing: recurringQuery.isRefetching,
    runNow,
  };
}
