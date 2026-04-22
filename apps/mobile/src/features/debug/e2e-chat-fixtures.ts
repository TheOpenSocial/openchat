import type { LocalChatThread } from "../../screens/home/domain/types";

function isoAtMinutesAgo(minutesAgo: number) {
  return new Date(Date.now() - minutesAgo * 60_000).toISOString();
}

export function buildE2EChatThreads(currentUserId: string): LocalChatThread[] {
  const chatId = "e2e-chat-thread";
  const peerUserId = "e2e-peer-user";

  return [
    {
      id: chatId,
      connectionId: "e2e-connection-thread",
      title: "Maestro Thread",
      type: "dm",
      highWatermark: isoAtMinutesAgo(2),
      unreadCount: 1,
      participantCount: 2,
      connectionStatus: "connected",
      messages: [
        {
          id: "e2e-msg-root",
          chatId,
          senderUserId: peerUserId,
          body: "Hey, I saw your profile and liked the energy here.",
          createdAt: isoAtMinutesAgo(8),
          status: {
            state: "read",
            deliveredCount: 1,
            readCount: 1,
            pendingCount: 0,
          },
        },
        {
          id: "e2e-msg-reply-1",
          chatId,
          senderUserId: currentUserId,
          body: "Thanks. I am up for a calm conversation first.",
          createdAt: isoAtMinutesAgo(5),
          replyToMessageId: "e2e-msg-root",
          status: {
            state: "read",
            deliveredCount: 1,
            readCount: 1,
            pendingCount: 0,
          },
        },
        {
          id: "e2e-msg-reply-2",
          chatId,
          senderUserId: peerUserId,
          body: "Perfect. Want to continue this later today?",
          createdAt: isoAtMinutesAgo(2),
          replyToMessageId: "e2e-msg-root",
          status: {
            state: "delivered",
            deliveredCount: 1,
            readCount: 0,
            pendingCount: 0,
          },
        },
      ],
    },
  ];
}
