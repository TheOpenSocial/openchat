import { useCallback, useEffect, useMemo, useState } from "react";

import { api, type SavedSearchRecord } from "../../../lib/api";
import {
  buildSavedSearchTaskItem,
  type SavedSearchTaskItem,
} from "../domain/task-item";

type UseSavedSearchesArgs = {
  accessToken: string;
  userId: string;
};

export function useSavedSearches({
  accessToken,
  userId,
}: UseSavedSearchesArgs) {
  const [savedSearches, setSavedSearches] = useState<SavedSearchRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [deletingSearchId, setDeletingSearchId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    setError(null);

    try {
      const nextSavedSearches = await api.listSavedSearches(
        userId,
        accessToken,
      );
      setSavedSearches(nextSavedSearches);
    } catch (nextError) {
      setError(
        nextError instanceof Error
          ? nextError.message
          : "Unable to load saved searches right now.",
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [accessToken, userId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const remove = useCallback(
    async (searchId: string) => {
      setDeletingSearchId(searchId);
      setError(null);

      try {
        await api.deleteSavedSearch(searchId, accessToken);
        await refresh();
      } catch (nextError) {
        setError(
          nextError instanceof Error
            ? nextError.message
            : "Unable to delete this saved search.",
        );
      } finally {
        setDeletingSearchId(null);
      }
    },
    [accessToken, refresh],
  );

  const items = useMemo<SavedSearchTaskItem[]>(
    () => savedSearches.map((search) => buildSavedSearchTaskItem(search)),
    [savedSearches],
  );

  return {
    deletingSearchId,
    error,
    items,
    loading,
    refresh,
    refreshing,
    remove,
  };
}
