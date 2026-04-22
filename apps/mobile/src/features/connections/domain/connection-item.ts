import type { ChatMetadataRecord } from "../../../lib/api";
import type { LocalChatThread } from "../../../store/chats-store";

export type ConnectionItem = {
  chatId: string;
  connectionId: string;
  connectionStatus: string;
  subtitle: string;
  targetUserId?: string;
  title: string;
  type: "dm" | "group";
  unreadCount: number;
};

function formatParticipants(
  participantCount: number | null,
  type: "dm" | "group",
) {
  if (participantCount == null) {
    return type === "group" ? "Group connection" : "Direct connection";
  }

  if (type === "dm") {
    return "1:1 connection";
  }

  return `${participantCount} participant${participantCount === 1 ? "" : "s"}`;
}

function deriveThreadSubtitle(thread: LocalChatThread) {
  const lastMessage = thread.messages.at(-1)?.body?.trim();
  if (lastMessage) {
    return lastMessage;
  }

  const participantLabel = formatParticipants(
    thread.participantCount,
    thread.type,
  );
  const statusLabel = thread.connectionStatus ?? "active";
  return `${participantLabel} · ${statusLabel}`;
}

export function buildConnectionItem(
  thread: LocalChatThread,
  currentUserId: string,
  metadata?: ChatMetadataRecord | null,
): ConnectionItem {
  const participantCount =
    typeof metadata?.participantCount === "number"
      ? metadata.participantCount
      : thread.participantCount;
  const connectionStatus =
    metadata?.connectionStatus ?? thread.connectionStatus ?? "active";
  const title =
    thread.title?.trim() ||
    (thread.type === "group" ? "Group connection" : "Direct connection");

  const targetUserId =
    thread.type === "dm"
      ? metadata?.participants.find(
          (participant) => participant.userId !== currentUserId,
        )?.userId
      : undefined;

  return {
    chatId: thread.id,
    connectionId: metadata?.connectionId ?? thread.connectionId,
    connectionStatus,
    subtitle: metadata
      ? `${formatParticipants(participantCount, thread.type)} · ${connectionStatus}`
      : deriveThreadSubtitle(thread),
    targetUserId,
    title,
    type: thread.type,
    unreadCount: thread.unreadCount,
  };
}
