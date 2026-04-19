import { useCallback, useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api, type SavedSearchRecord } from "../../../lib/api";
import { mobileQueryKeys } from "../../../lib/query-client";
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
  const queryClient = useQueryClient();
  const savedSearchesQuery = useQuery({
    enabled: Boolean(accessToken && userId),
    queryFn: () => api.listSavedSearches(userId, accessToken),
    queryKey: mobileQueryKeys.savedSearches(userId),
  });

  const refresh = useCallback(async () => {
    await savedSearchesQuery.refetch();
  }, [savedSearchesQuery]);

  const removeMutation = useMutation({
    mutationFn: (searchId: string) =>
      api.deleteSavedSearch(searchId, accessToken),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: mobileQueryKeys.savedSearches(userId),
      });
    },
  });

  const remove = useCallback(
    async (searchId: string) => {
      await removeMutation.mutateAsync(searchId);
    },
    [removeMutation],
  );

  const items = useMemo<SavedSearchTaskItem[]>(
    () =>
      (savedSearchesQuery.data ?? []).map((search: SavedSearchRecord) =>
        buildSavedSearchTaskItem(search),
      ),
    [savedSearchesQuery.data],
  );

  return {
    deletingSearchId: removeMutation.variables ?? null,
    error:
      (removeMutation.error instanceof Error && removeMutation.error.message) ||
      (savedSearchesQuery.error instanceof Error &&
        savedSearchesQuery.error.message) ||
      null,
    items,
    loading: savedSearchesQuery.isLoading && !savedSearchesQuery.data,
    refresh,
    refreshing: savedSearchesQuery.isRefetching,
    remove,
  };
}
