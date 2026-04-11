"use client";

import { useEffect, useMemo, useState } from "react";
import {
  createChatReplyExcerpt,
  parseChatMessageBody,
  type ChatReplyReference,
} from "@opensocial/types";

import { ChatBubble } from "@/src/components/ChatBubble";
import {
  WorkspaceHeader,
  WorkspaceList,
  WorkspaceListItem,
  WorkspaceMutedPanel,
  WorkspacePanel,
} from "@/src/components/layout/workspace";
import { Button } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";
import { useAppSession } from "@/src/features/app-shell/app-session";
import {
  api,
  type ChatMessageRecord,
  type ChatMetadataRecord,
  type ChatThreadDetailRecord,
} from "@/src/lib/api";
import { WEB_DESIGN_CHATS } from "@/src/mocks/web-design-fixtures";

interface ChatThread {
  id: string;
  connectionId: string;
  title: string;
  messages: ChatMessageRecord[];
}

const CHAT_STORAGE_KEY = "opensocial.web.chat_threads.v1";

function normalizeMessageBody(body: string) {
  return parseChatMessageBody(body).body;
}

function formatVisibleMessageBody(body: string) {
  const normalized = normalizeMessageBody(body);
  if (normalized === "[deleted]") {
    return "Message deleted";
  }
  if (normalized === "[hidden by moderation]") {
    return "Message hidden";
  }
  return normalized;
}

function buildReplyReference(message: ChatMessageRecord | null | undefined) {
  if (!message) {
    return null;
  }
  const excerpt = createChatReplyExcerpt(normalizeMessageBody(message.body));
  if (!excerpt) {
    return null;
  }
  return {
    messageId: message.id,
    excerpt,
  } satisfies ChatReplyReference;
}

function formatPresenceLabel(
  presence: ChatMetadataRecord["participants"][number]["presence"] | null,
) {
  if (!presence) {
    return null;
  }
  if (presence.online) {
    return "Online now";
  }
  if (!presence.lastSeenAt) {
    return null;
  }

  const parsedLastSeen = Date.parse(presence.lastSeenAt);
  if (Number.isNaN(parsedLastSeen)) {
    return null;
  }
  const elapsedMs = Date.now() - parsedLastSeen;
  const elapsedMinutes = Math.max(1, Math.floor(elapsedMs / 60_000));
  if (elapsedMinutes < 60) {
    return `Last seen ${elapsedMinutes}m ago`;
  }
  const elapsedHours = Math.floor(elapsedMinutes / 60);
  if (elapsedHours < 24) {
    return `Last seen ${elapsedHours}h ago`;
  }
  const elapsedDays = Math.floor(elapsedHours / 24);
  return `Last seen ${elapsedDays}d ago`;
}

export function ChatsScreen() {
  const { isDesignMock, isOnline, session, setBanner } = useAppSession();
  const [chatThreads, setChatThreads] = useState<ChatThread[]>([]);
  const [selectedChatId, setSelectedChatId] = useState<string | null>(null);
  const [selectedChatMetadata, setSelectedChatMetadata] =
    useState<ChatMetadataRecord | null>(null);
  const [chatDraft, setChatDraft] = useState("");
  const [chatBusy, setChatBusy] = useState(false);
  const [messageBusy, setMessageBusy] = useState(false);
  const [pendingReply, setPendingReply] = useState<ChatReplyReference | null>(
    null,
  );
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [threadRootMessageId, setThreadRootMessageId] = useState<string | null>(
    null,
  );
  const reactionOptions = ["👍", "🔥", "😂"];

  useEffect(() => {
    if (isDesignMock) {
      setChatThreads(WEB_DESIGN_CHATS);
      setSelectedChatId(WEB_DESIGN_CHATS[0]?.id ?? null);
      setThreadRootMessageId(null);
      return;
    }
    if (typeof window === "undefined") {
      return;
    }
    const raw = window.localStorage.getItem(CHAT_STORAGE_KEY);
    if (!raw) {
      return;
    }
    try {
      const parsed = JSON.parse(raw) as ChatThread[];
      setChatThreads(parsed);
      setSelectedChatId(parsed[0]?.id ?? null);
      setThreadRootMessageId(null);
    } catch {
      window.localStorage.removeItem(CHAT_STORAGE_KEY);
    }
  }, [isDesignMock]);

  useEffect(() => {
    if (isDesignMock || typeof window === "undefined") {
      return;
    }
    window.localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(chatThreads));
  }, [chatThreads, isDesignMock]);

  const selectedChat = useMemo(
    () => chatThreads.find((thread) => thread.id === selectedChatId) ?? null,
    [chatThreads, selectedChatId],
  );
  const [threadSummaries, setThreadSummaries] = useState<
    Map<string, { rootMessageId: string; replyCount: number }>
  >(new Map());
  const [threadDetail, setThreadDetail] =
    useState<ChatThreadDetailRecord | null>(null);
  const selectedChatMessageById = useMemo(() => {
    if (!selectedChat) {
      return new Map<string, ChatMessageRecord>();
    }
    return new Map(
      selectedChat.messages.map((message) => [message.id, message]),
    );
  }, [selectedChat]);
  const editingMessage = editingMessageId
    ? (selectedChatMessageById.get(editingMessageId) ?? null)
    : null;
  const threadRootMessage = threadDetail?.thread.rootMessage ?? null;
  const threadEntries = threadDetail?.entries ?? [];
  const selectedChatPresence = useMemo(() => {
    if (
      !selectedChatMetadata ||
      !session ||
      selectedChatMetadata.type !== "dm"
    ) {
      return null;
    }
    return (
      selectedChatMetadata.participants.find(
        (participant) => participant.userId !== session.userId,
      )?.presence ?? null
    );
  }, [selectedChatMetadata, session]);

  useEffect(() => {
    if (!session || isDesignMock || !selectedChatId) {
      setSelectedChatMetadata(null);
      return;
    }

    let cancelled = false;
    void api
      .getChatMetadata(selectedChatId, session.accessToken)
      .then((metadata) => {
        if (!cancelled) {
          setSelectedChatMetadata(metadata);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setSelectedChatMetadata(null);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [isDesignMock, selectedChatId, session]);

  useEffect(() => {
    if (!session || isDesignMock || !selectedChat) {
      setThreadSummaries(new Map());
      return;
    }

    let cancelled = false;
    void api
      .listChatThreads(selectedChat.id, session.accessToken)
      .then((response) => {
        if (cancelled) {
          return;
        }
        setThreadSummaries(
          new Map(
            response.threads.map((thread) => [
              thread.rootMessage.id,
              {
                rootMessageId: thread.rootMessage.id,
                replyCount: thread.replyCount,
              },
            ]),
          ),
        );
      })
      .catch(() => {
        if (!cancelled) {
          setThreadSummaries(new Map());
        }
      });

    return () => {
      cancelled = true;
    };
  }, [isDesignMock, selectedChat, session]);

  useEffect(() => {
    if (!session || isDesignMock || !selectedChat || !threadRootMessageId) {
      setThreadDetail(null);
      return;
    }

    let cancelled = false;
    void api
      .getChatThread(selectedChat.id, threadRootMessageId, session.accessToken)
      .then((response) => {
        if (!cancelled) {
          setThreadDetail(response);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setThreadDetail(null);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [isDesignMock, selectedChat, session, threadRootMessageId]);

  const createChatSandbox = async () => {
    if (!session) {
      return;
    }
    setPendingReply(null);
    setEditingMessageId(null);
    setThreadRootMessageId(null);
    setChatDraft("");
    if (isDesignMock) {
      const marker = Date.now().toString(36);
      const thread: ChatThread = {
        id: `mock_chat_${marker}`,
        connectionId: `mock_conn_${marker}`,
        title: `Preview thread ${marker.slice(-4)}`,
        messages: [],
      };
      setChatThreads((current) => [thread, ...current]);
      setSelectedChatId(thread.id);
      return;
    }

    setChatBusy(true);
    try {
      const connection = await api.createConnection(
        session.userId,
        "dm",
        session.accessToken,
      );
      const connectionId = String(connection.id);
      const chat = await api.createChat(
        connectionId,
        "dm",
        session.accessToken,
      );
      const thread: ChatThread = {
        id: chat.id,
        connectionId,
        title: `Thread ${chat.id.slice(0, 6)}`,
        messages: [],
      };
      setChatThreads((current) => [thread, ...current]);
      setSelectedChatId(thread.id);
    } catch (error) {
      setBanner({
        tone: "error",
        text: `Could not create chat sandbox: ${String(error)}`,
      });
    } finally {
      setChatBusy(false);
    }
  };

  const openChat = async (chatId: string) => {
    if (!session) {
      return;
    }
    setPendingReply(null);
    setEditingMessageId(null);
    setThreadRootMessageId(null);
    setChatDraft("");
    setSelectedChatId(chatId);
    if (isDesignMock) {
      return;
    }
    try {
      const messages = await api.listChatMessages(chatId, session.accessToken);
      setChatThreads((current) =>
        current.map((thread) =>
          thread.id === chatId
            ? { ...thread, messages: messages.reverse() }
            : thread,
        ),
      );
    } catch (error) {
      setBanner({
        tone: "error",
        text: `Could not load messages: ${String(error)}`,
      });
    }
  };

  const sendChatMessage = async () => {
    if (!session || !selectedChat || !chatDraft.trim() || messageBusy) {
      return;
    }
    const normalizedBody = chatDraft.trim();
    const replyToMessageId = pendingReply?.messageId;
    const editingId = editingMessageId;

    setMessageBusy(true);
    try {
      if (editingId) {
        if (isDesignMock) {
          setChatThreads((current) =>
            current.map((thread) =>
              thread.id === selectedChat.id
                ? {
                    ...thread,
                    messages: thread.messages.map((message) =>
                      message.id === editingId
                        ? {
                            ...message,
                            body: normalizedBody,
                            editedAt: new Date().toISOString(),
                          }
                        : message,
                    ),
                  }
                : thread,
            ),
          );
        } else {
          const updated = await api.editChatMessage(
            selectedChat.id,
            editingId,
            session.userId,
            normalizedBody,
            session.accessToken,
          );
          setChatThreads((current) =>
            current.map((thread) =>
              thread.id === selectedChat.id
                ? {
                    ...thread,
                    messages: thread.messages.map((message) =>
                      message.id === editingId
                        ? { ...message, ...updated }
                        : message,
                    ),
                  }
                : thread,
            ),
          );
        }
        setEditingMessageId(null);
        setChatDraft("");
      } else {
        if (isDesignMock) {
          setChatThreads((current) =>
            current.map((thread) =>
              thread.id === selectedChat.id
                ? {
                    ...thread,
                    messages: [
                      ...thread.messages,
                      {
                        id: `mock_msg_${Date.now().toString(36)}`,
                        chatId: thread.id,
                        senderUserId: session.userId,
                        body: normalizedBody,
                        createdAt: new Date().toISOString(),
                        ...(replyToMessageId ? { replyToMessageId } : {}),
                      },
                    ],
                  }
                : thread,
            ),
          );
        } else {
          const message = await api.createChatMessage(
            selectedChat.id,
            session.userId,
            normalizedBody,
            session.accessToken,
            {
              ...(replyToMessageId ? { replyToMessageId } : {}),
            },
          );
          setChatThreads((current) =>
            current.map((thread) =>
              thread.id === selectedChat.id
                ? { ...thread, messages: [...thread.messages, message] }
                : thread,
            ),
          );
        }
        setPendingReply(null);
        setChatDraft("");
      }
    } catch (error) {
      setBanner({
        tone: "error",
        text: `Could not save message: ${String(error)}`,
      });
    } finally {
      setMessageBusy(false);
    }
  };

  useEffect(() => {
    if (!session || isDesignMock || !selectedChat) {
      return;
    }

    const unreadIncoming = selectedChat.messages.filter(
      (message) =>
        message.senderUserId !== session.userId &&
        message.status?.state !== "read",
    );
    if (unreadIncoming.length === 0) {
      return;
    }

    void Promise.all(
      unreadIncoming.map((message) =>
        api.markChatMessageRead(
          selectedChat.id,
          message.id,
          session.userId,
          session.accessToken,
        ),
      ),
    )
      .then(() => {
        setChatThreads((current) =>
          current.map((thread) =>
            thread.id === selectedChat.id
              ? {
                  ...thread,
                  messages: thread.messages.map((message) =>
                    message.senderUserId === session.userId
                      ? message
                      : {
                          ...message,
                          status: {
                            state: "read",
                            deliveredCount: message.status?.deliveredCount ?? 1,
                            readCount: Math.max(
                              1,
                              message.status?.readCount ?? 0,
                            ),
                            pendingCount: 0,
                          },
                        },
                  ),
                }
              : thread,
          ),
        );
      })
      .catch(() => {});
  }, [isDesignMock, selectedChat, session]);

  const reactToMessage = async (messageId: string, emoji: string) => {
    if (!session || !selectedChat) {
      return;
    }
    try {
      const reaction = await api.createChatMessageReaction(
        selectedChat.id,
        messageId,
        session.userId,
        emoji,
        session.accessToken,
      );
      setChatThreads((current) =>
        current.map((thread) =>
          thread.id === selectedChat.id
            ? {
                ...thread,
                messages: thread.messages.map((message) =>
                  message.id === messageId
                    ? {
                        ...message,
                        reactions: [
                          ...(message.reactions ?? []).filter(
                            (candidate) =>
                              !(
                                candidate.userId === reaction.userId &&
                                candidate.emoji === reaction.emoji
                              ),
                          ),
                          reaction,
                        ],
                      }
                    : message,
                ),
              }
            : thread,
        ),
      );
    } catch (error) {
      setBanner({
        tone: "error",
        text: `Could not react to message: ${String(error)}`,
      });
    }
  };

  const deleteOwnMessage = async (messageId: string) => {
    if (!session || !selectedChat) {
      return;
    }
    try {
      const deleted = await api.softDeleteChatMessage(
        selectedChat.id,
        messageId,
        session.userId,
        session.accessToken,
      );
      setChatThreads((current) =>
        current.map((thread) =>
          thread.id === selectedChat.id
            ? {
                ...thread,
                messages: thread.messages.map((message) =>
                  message.id === messageId
                    ? { ...message, ...deleted }
                    : message,
                ),
              }
            : thread,
        ),
      );
    } catch (error) {
      setBanner({
        tone: "error",
        text: `Could not delete message: ${String(error)}`,
      });
    }
  };

  const startReply = (message: ChatMessageRecord) => {
    const reply = buildReplyReference(message);
    if (!reply) {
      return;
    }
    setEditingMessageId(null);
    setPendingReply(reply);
  };

  const startEdit = (message: ChatMessageRecord) => {
    if (message.senderUserId !== session?.userId) {
      return;
    }
    const normalizedBody = normalizeMessageBody(message.body);
    if (
      normalizedBody === "[deleted]" ||
      normalizedBody === "[hidden by moderation]"
    ) {
      return;
    }
    setPendingReply(null);
    setEditingMessageId(message.id);
    setChatDraft(normalizedBody);
  };

  const cancelComposerMode = () => {
    setPendingReply(null);
    setEditingMessageId(null);
    setChatDraft("");
  };

  return (
    <div className="grid gap-4 xl:grid-cols-[320px_1fr]">
      <WorkspacePanel>
        <WorkspaceHeader
          description="Private threads open after explicit connection. Reconnect and resume from here."
          title="Chats"
        />
        <div className="mt-4">
          <Button
            className="w-full"
            disabled={chatBusy}
            onClick={() => {
              void createChatSandbox();
            }}
            type="button"
            variant="primary"
          >
            {chatBusy ? "Creating…" : "Create chat sandbox"}
          </Button>

          <div className="mt-4">
            <WorkspaceList>
              {chatThreads.map((thread) => (
                <WorkspaceListItem key={thread.id}>
                  <button
                    className={`w-full rounded-[calc(var(--radius)-2px)] px-0 text-left text-sm ${
                      selectedChat?.id === thread.id
                        ? "text-white"
                        : "text-white/78"
                    }`}
                    onClick={() => {
                      void openChat(thread.id);
                    }}
                    type="button"
                  >
                    <p className="font-semibold">{thread.title}</p>
                    <p className="mt-1 text-xs leading-5 text-ash">
                      {thread.messages.length} message
                      {thread.messages.length === 1 ? "" : "s"}
                    </p>
                  </button>
                </WorkspaceListItem>
              ))}
            </WorkspaceList>
          </div>
        </div>
      </WorkspacePanel>

      <WorkspacePanel>
        <WorkspaceHeader
          description={
            selectedChat?.id
              ? (formatPresenceLabel(selectedChatPresence) ??
                (isOnline
                  ? "Transport available."
                  : "Offline mode: sending is paused."))
              : isOnline
                ? "Transport available."
                : "Offline mode: sending is paused."
          }
          title={selectedChat?.title ?? "No chat selected"}
        />
        <div className="mt-4">
          {!selectedChat ? (
            <WorkspaceMutedPanel>
              <p className="text-sm leading-6 text-ash">
                Create a sandbox or wait for a connection to open a direct
                thread.
              </p>
            </WorkspaceMutedPanel>
          ) : (
            <>
              {threadRootMessage ? (
                <WorkspaceMutedPanel className="mb-4">
                  <div className="flex flex-col gap-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-ash">
                          Thread
                        </p>
                        <p className="mt-1 text-sm leading-6 text-[hsl(var(--foreground))]">
                          {formatVisibleMessageBody(threadRootMessage.body)}
                        </p>
                      </div>
                      <Button
                        disabled={messageBusy}
                        onClick={() => {
                          setThreadRootMessageId(null);
                        }}
                        type="button"
                        variant="ghost"
                      >
                        Close
                      </Button>
                    </div>
                    <div className="space-y-3 border-t border-white/8 pt-3">
                      <ChatBubble
                        body={formatVisibleMessageBody(threadRootMessage.body)}
                        editedAt={threadRootMessage.editedAt ?? null}
                        onReply={() => {
                          startReply(threadRootMessage);
                        }}
                        reply={
                          threadRootMessage.replyToMessageId
                            ? buildReplyReference(
                                selectedChatMessageById.get(
                                  threadRootMessage.replyToMessageId,
                                ),
                              )
                            : null
                        }
                        role={
                          threadRootMessage.senderUserId === session?.userId
                            ? "user"
                            : "agent"
                        }
                      />
                      {threadEntries.length === 0 ? (
                        <p className="text-sm leading-6 text-ash">
                          No replies in this branch yet.
                        </p>
                      ) : (
                        threadEntries.map(({ depth, message }) => {
                          const isOwnMessage =
                            message.senderUserId === session?.userId;
                          return (
                            <div
                              key={`thread-${message.id}`}
                              className="space-y-2"
                              style={{ marginLeft: depth * 16 }}
                            >
                              <ChatBubble
                                body={formatVisibleMessageBody(message.body)}
                                editedAt={message.editedAt ?? null}
                                onReply={() => {
                                  startReply(message);
                                }}
                                reply={
                                  message.replyToMessageId
                                    ? buildReplyReference(
                                        selectedChatMessageById.get(
                                          message.replyToMessageId,
                                        ),
                                      )
                                    : null
                                }
                                role={isOwnMessage ? "user" : "agent"}
                              />
                              <div className="flex flex-wrap items-center gap-2">
                                <Button
                                  disabled={messageBusy}
                                  onClick={() => {
                                    setThreadRootMessageId(
                                      message.replyToMessageId ?? message.id,
                                    );
                                  }}
                                  type="button"
                                  variant="ghost"
                                >
                                  Open branch
                                </Button>
                                {message.replyToMessageId ? (
                                  <Button
                                    disabled={messageBusy}
                                    onClick={() => {
                                      const parentId = message.replyToMessageId;
                                      if (!parentId) {
                                        return;
                                      }
                                      setThreadRootMessageId(parentId);
                                    }}
                                    type="button"
                                    variant="ghost"
                                  >
                                    Open parent
                                  </Button>
                                ) : null}
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                </WorkspaceMutedPanel>
              ) : null}
              <div className="max-h-[25rem] overflow-y-auto pr-2">
                {selectedChat.messages.map((message) => {
                  const isOwnMessage = message.senderUserId === session?.userId;
                  const replyReference = message.replyToMessageId
                    ? buildReplyReference(
                        selectedChatMessageById.get(message.replyToMessageId),
                      )
                    : null;
                  const threadSummary = threadSummaries.get(message.id);
                  const replyCount = threadSummary?.replyCount ?? 0;
                  const visibleBody = formatVisibleMessageBody(message.body);
                  const isDeleted = visibleBody === "Message deleted";
                  return (
                    <div key={message.id}>
                      <ChatBubble
                        body={visibleBody}
                        editedAt={message.editedAt ?? null}
                        onReply={() => {
                          startReply(message);
                        }}
                        reply={replyReference}
                        role={isOwnMessage ? "user" : "agent"}
                      />
                      {replyCount > 0 || message.replyToMessageId ? (
                        <div className="mb-3 flex flex-wrap gap-2">
                          <Button
                            disabled={messageBusy}
                            onClick={() => {
                              setThreadRootMessageId(
                                message.replyToMessageId ??
                                  threadSummary?.rootMessageId ??
                                  message.id,
                              );
                            }}
                            type="button"
                            variant="ghost"
                          >
                            {message.replyToMessageId
                              ? "Open thread"
                              : `View thread (${replyCount})`}
                          </Button>
                        </div>
                      ) : null}
                      {!isDeleted ? (
                        <div
                          className={`mb-3 flex flex-wrap items-center gap-2 ${
                            isOwnMessage ? "justify-end" : "justify-start"
                          }`}
                        >
                          {reactionOptions.map((emoji) => {
                            const count = (message.reactions ?? []).filter(
                              (reaction) => reaction.emoji === emoji,
                            ).length;
                            const active = (message.reactions ?? []).some(
                              (reaction) =>
                                reaction.emoji === emoji &&
                                reaction.userId === session?.userId,
                            );
                            return (
                              <button
                                className={`rounded-full border px-2 py-1 text-xs ${
                                  active
                                    ? "border-amber-300/30 bg-amber-300/12 text-amber-50"
                                    : "border-white/10 text-white/70"
                                }`}
                                key={`${message.id}-${emoji}`}
                                onClick={() => {
                                  void reactToMessage(message.id, emoji);
                                }}
                                disabled={messageBusy}
                                type="button"
                              >
                                {emoji}
                                {count > 0 ? ` ${count}` : ""}
                              </button>
                            );
                          })}
                          {isOwnMessage ? (
                            <>
                              <span className="text-[11px] text-ash">
                                {message.status?.state === "read"
                                  ? "Read"
                                  : message.status?.state === "delivered"
                                    ? "Delivered"
                                    : "Sent"}
                              </span>
                              <button
                                className="text-[11px] text-ash"
                                disabled={messageBusy}
                                onClick={() => {
                                  startEdit(message);
                                }}
                                type="button"
                              >
                                Edit
                              </button>
                              <button
                                className="text-[11px] text-ash"
                                disabled={messageBusy}
                                onClick={() => {
                                  void deleteOwnMessage(message.id);
                                }}
                                type="button"
                              >
                                Delete
                              </button>
                            </>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>

              {pendingReply ? (
                <div className="mb-3 flex items-start justify-between gap-3 rounded-[calc(var(--radius)-4px)] border border-white/10 bg-white/[0.04] px-3 py-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-ash">
                      Replying
                    </p>
                    <p className="mt-1 text-xs leading-5 text-[hsl(var(--foreground))]">
                      {pendingReply.excerpt}
                    </p>
                  </div>
                  <Button
                    onClick={() => setPendingReply(null)}
                    type="button"
                    variant="ghost"
                  >
                    Clear
                  </Button>
                </div>
              ) : null}
              {editingMessage ? (
                <div className="mb-3 flex items-start justify-between gap-3 rounded-[calc(var(--radius)-4px)] border border-white/10 bg-white/[0.04] px-3 py-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-ash">
                      Editing
                    </p>
                    <p className="mt-1 text-xs leading-5 text-[hsl(var(--foreground))]">
                      {formatVisibleMessageBody(editingMessage.body)}
                    </p>
                  </div>
                  <Button
                    onClick={cancelComposerMode}
                    type="button"
                    variant="ghost"
                  >
                    Cancel
                  </Button>
                </div>
              ) : null}
              <div className="mt-4 flex gap-2">
                <Input
                  onChange={(event) => setChatDraft(event.currentTarget.value)}
                  placeholder={
                    editingMessage ? "Edit your message…" : "Write a message…"
                  }
                  value={chatDraft}
                />
                <Button
                  disabled={!chatDraft.trim() || !isOnline || messageBusy}
                  onClick={() => {
                    void sendChatMessage();
                  }}
                  type="button"
                  variant="primary"
                >
                  {editingMessage ? "Save" : "Send"}
                </Button>
              </div>
            </>
          )}
        </div>
      </WorkspacePanel>
    </div>
  );
}
