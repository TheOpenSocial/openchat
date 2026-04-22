import { useCallback, useEffect, useMemo, useState } from "react";

import {
  api,
  type RecurringCircleRecord,
  type RecurringCircleSessionRecord,
} from "../../../lib/api";
import {
  buildRecurringCircleItem,
  type RecurringCircleItem,
} from "../domain/recurring-item";

type UseRecurringCirclesArgs = {
  accessToken: string;
  userId: string;
};

type SessionMap = Record<string, RecurringCircleSessionRecord[]>;

export function useRecurringCircles({
  accessToken,
  userId,
}: UseRecurringCirclesArgs) {
  const [circles, setCircles] = useState<RecurringCircleRecord[]>([]);
  const [sessionsByCircleId, setSessionsByCircleId] = useState<SessionMap>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actingCircleId, setActingCircleId] = useState<string | null>(null);

  const hydrate = useCallback(
    async (mode: "initial" | "refresh") => {
      if (mode === "initial") {
        setLoading(true);
      } else {
        setRefreshing(true);
      }
      setError(null);

      try {
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

        setCircles(nextCircles);
        setSessionsByCircleId(Object.fromEntries(sessionEntries) as SessionMap);
      } catch (nextError) {
        setError(
          nextError instanceof Error
            ? nextError.message
            : "Unable to load recurring circles right now.",
        );
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [accessToken, userId],
  );

  useEffect(() => {
    void hydrate("initial");
  }, [hydrate]);

  const items = useMemo<RecurringCircleItem[]>(
    () =>
      circles.map((circle) =>
        buildRecurringCircleItem(circle, sessionsByCircleId[circle.id] ?? []),
      ),
    [circles, sessionsByCircleId],
  );

  const runNow = useCallback(
    async (circleId: string) => {
      setActingCircleId(circleId);
      setError(null);
      try {
        await api.runRecurringCircleSessionNow(circleId, accessToken);
        await hydrate("refresh");
      } catch (nextError) {
        setError(
          nextError instanceof Error
            ? nextError.message
            : "Unable to run this circle right now.",
        );
      } finally {
        setActingCircleId(null);
      }
    },
    [accessToken, hydrate],
  );

  return {
    actingCircleId,
    error,
    items,
    loading,
    refresh: () => hydrate("refresh"),
    refreshing,
    runNow,
  };
}
