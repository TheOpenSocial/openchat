import { useCallback, useEffect, useMemo, useState } from "react";

import { api, type ChatMetadataRecord } from "../../../lib/api";
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
  const [metadataByChatId, setMetadataByChatId] = useState<
    Record<string, ChatMetadataRecord | null>
  >({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    setError(null);

    try {
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

      setMetadataByChatId(Object.fromEntries(nextMetadataEntries));
    } catch (nextError) {
      setError(
        nextError instanceof Error
          ? nextError.message
          : "Unable to load connections right now.",
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [accessToken, chats]);

  useEffect(() => {
    void refresh();
  }, [refresh, userId]);

  const items = useMemo<ConnectionItem[]>(
    () =>
      chats.map((thread) =>
        buildConnectionItem(thread, userId, metadataByChatId[thread.id]),
      ),
    [chats, metadataByChatId, userId],
  );

  return {
    error,
    items,
    loading,
    refresh,
    refreshing,
  };
}
