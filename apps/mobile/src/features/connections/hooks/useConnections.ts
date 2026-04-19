import { useCallback, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";

import { api, type ChatMetadataRecord } from "../../../lib/api";
import { mobileQueryKeys } from "../../../lib/query-client";
import { useChatsStore } from "../../../store/chats-store";
import {
  buildConnectionItem,
  type ConnectionItem,
} from "../domain/connection-item";

type UseConnectionsArgs = {
  accessToken: string;
  userId: string;
};

export function useConnections({ accessToken, userId }: UseConnectionsArgs) {
  const chats = useChatsStore((store) => store.chats);
  const connectionsQuery = useQuery({
    enabled: Boolean(accessToken && userId),
    queryFn: async () => {
      const nextMetadataEntries = await Promise.all(
        chats.map(async (thread) => {
          try {
            const metadata = await api.getChatMetadata(thread.id, accessToken);
            return [thread.id, metadata] as const;
          } catch {
            return [thread.id, null] as const;
          }
        }),
      );

      return Object.fromEntries(nextMetadataEntries) as Record<
        string,
        ChatMetadataRecord | null
      >;
    },
    queryKey: [
      ...mobileQueryKeys.connections(userId),
      chats.map((chat) => chat.id),
    ],
  });

  const refresh = useCallback(async () => {
    await connectionsQuery.refetch();
  }, [connectionsQuery]);

  const items = useMemo<ConnectionItem[]>(
    () =>
      chats.map((thread) =>
        buildConnectionItem(thread, userId, connectionsQuery.data?.[thread.id]),
      ),
    [chats, connectionsQuery.data, userId],
  );

  return {
    error:
      connectionsQuery.error instanceof Error
        ? connectionsQuery.error.message
        : null,
    items,
    loading: connectionsQuery.isLoading && !connectionsQuery.data,
    refresh,
    refreshing: connectionsQuery.isRefetching,
  };
}
