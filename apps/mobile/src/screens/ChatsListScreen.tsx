import { Alert, Modal, Pressable, ScrollView, Text, View } from "react-native";
import { useEffect, useState } from "react";
import type { LayoutChangeEvent } from "react-native";
import {
  createChatReplyExcerpt,
  formatChatReplyBody,
  parseChatMessageBody,
  type ChatReplyReference,
} from "@opensocial/types";

import { ChatBubble } from "../components/ChatBubble";
import { ChatTranscriptList } from "../components/ChatTranscriptList";
import { EmptyState } from "../components/EmptyState";
import { MessageComposer } from "../components/MessageComposer";
import { PrimaryButton } from "../components/PrimaryButton";
import {
  api,
  type ChatThreadDetailResponse,
  type ChatThreadSummaryRecord,
} from "../lib/api";
import {
  buildChatThreadDetail,
  buildChatThreadSummaries,
} from "../lib/chat-threads";
import type { RealtimeConnectionState } from "../lib/realtime";
import type { LocalChatThread } from "./home/domain/types";

type CounterpartyPresence = {
  online: boolean;
  state?: string;
  lastSeenAt?: string | null;
} | null;

interface ChatsListScreenProps {
  accessToken: string;
  currentUserId: string;
  draftChatMessage: string;
  loadingMessages: boolean;
  onOpenUserProfile: (input: {
    userId: string;
    context: {
      source: "chat" | "request";
      reason?: string;
      sharedTopics?: string[];
      lastInteraction?: string;
    };
  }) => void;
  onModerationBlock: (targetUserId: string, chatId: string) => Promise<void>;
  onModerationReport: (targetUserId: string, chatId: string) => Promise<void>;
  onOpenChat: (chatId: string) => Promise<void>;
  onDeleteOwnMessage: (chatId: string, messageId: string) => Promise<void>;
  onEditOwnMessage: (
    chatId: string,
    messageId: string,
    body: string,
  ) => Promise<boolean>;
  onReactToMessage: (
    chatId: string,
    messageId: string,
    emoji: string,
  ) => Promise<void>;
  onRetryFailedMessage: (chatId: string, messageId: string) => Promise<void>;
  onSendMessage: (
    messageOverride?: string,
    replyToMessageId?: string,
  ) => Promise<void>;
  realtimeState: RealtimeConnectionState;
  selectedChat: LocalChatThread | null;
  selectedChatPresence: CounterpartyPresence;
  sendingMessage: boolean;
  setDraftChatMessage: (value: string) => void;
  threads: LocalChatThread[];
  typingUsers: string[];
}

function formatThreadSummary(thread: LocalChatThread) {
  const typeLabel = thread.type === "group" ? "group" : "dm";
  const participants =
    thread.participantCount == null
      ? "participants n/a"
      : `${thread.participantCount} participant${thread.participantCount === 1 ? "" : "s"}`;
  const status = thread.connectionStatus ?? "status n/a";
  return `${typeLabel} · ${participants} · ${status}`;
}

function formatPresenceLabel(presence: CounterpartyPresence) {
  if (!presence) {
    return null;
  }
  if (presence.online) {
    return "Online now";
  }
  if (!presence.lastSeenAt) {
    return null;
  }

  const elapsedMs = Date.now() - Date.parse(presence.lastSeenAt);
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

type ThreadFocus = {
  rootMessageId: string;
};

export function ChatsListScreen({
  accessToken,
  currentUserId,
  draftChatMessage,
  loadingMessages,
  onOpenUserProfile,
  onModerationBlock,
  onModerationReport,
  onOpenChat,
  onDeleteOwnMessage,
  onEditOwnMessage,
  onReactToMessage,
  onRetryFailedMessage,
  onSendMessage,
  realtimeState,
  selectedChat,
  selectedChatPresence,
  sendingMessage,
  setDraftChatMessage,
  threads,
  typingUsers,
}: ChatsListScreenProps) {
  const e2eOfflineFallbackEnabled = Boolean(
    process.env.EXPO_PUBLIC_E2E_SESSION_B64?.trim(),
  );
  const [composerOverlayHeight, setComposerOverlayHeight] = useState(110);
  const [pendingReply, setPendingReply] = useState<ChatReplyReference | null>(
    null,
  );
  const [pendingEdit, setPendingEdit] = useState<{
    messageId: string;
    excerpt: string;
    reply: ChatReplyReference | null;
  } | null>(null);
  const [threadFocus, setThreadFocus] = useState<ThreadFocus | null>(null);
  const [threadDraft, setThreadDraft] = useState("");
  const [threadSummaries, setThreadSummaries] = useState<
    Map<string, ChatThreadSummaryRecord>
  >(new Map());
  const [selectedThread, setSelectedThread] =
    useState<ChatThreadDetailResponse | null>(null);
  const [threadLoading, setThreadLoading] = useState(false);
  const moderationTargetUserId =
    selectedChat?.messages.find(
      (message) => message.senderUserId !== currentUserId,
    )?.senderUserId ?? null;
  const chatMessageLength = draftChatMessage.trim().length;
  const hasSelectedChat = selectedChat != null;
  const canSendMessage =
    hasSelectedChat && chatMessageLength > 0 && !sendingMessage;

  const clearPendingReply = () => {
    setPendingReply(null);
  };

  const clearPendingEdit = () => {
    setPendingEdit(null);
  };

  useEffect(() => {
    setThreadFocus(null);
    setThreadDraft("");
    setSelectedThread(null);
    setThreadLoading(false);
  }, [selectedChat?.id]);

  const activeThreadChatId = selectedThread?.chatId ?? selectedChat?.id ?? "";

  useEffect(() => {
    if (!selectedChat) {
      setThreadSummaries(new Map());
      return;
    }

    let cancelled = false;
    void api
      .getChatThreadSummaries(selectedChat.id, accessToken)
      .then((threads) => {
        if (cancelled) {
          return;
        }
        setThreadSummaries(
          new Map(threads.map((thread) => [thread.rootMessage.id, thread])),
        );
      })
      .catch(() => {
        if (!cancelled) {
          if (e2eOfflineFallbackEnabled) {
            const localThreads = buildChatThreadSummaries(
              selectedChat.messages,
            );
            setThreadSummaries(
              new Map(
                localThreads.map((thread) => [thread.rootMessage.id, thread]),
              ),
            );
            return;
          }
          setThreadSummaries(new Map());
        }
      });

    return () => {
      cancelled = true;
    };
  }, [
    accessToken,
    e2eOfflineFallbackEnabled,
    selectedChat?.highWatermark,
    selectedChat?.id,
    selectedChat?.messages.length,
  ]);

  useEffect(() => {
    if (!selectedChat || !threadFocus) {
      setSelectedThread(null);
      setThreadLoading(false);
      return;
    }

    let cancelled = false;
    setThreadLoading(true);
    void api
      .getChatThreadDetail(
        selectedChat.id,
        threadFocus.rootMessageId,
        accessToken,
      )
      .then((response) => {
        if (!cancelled) {
          setSelectedThread(response);
        }
      })
      .catch(() => {
        if (!cancelled) {
          if (e2eOfflineFallbackEnabled && selectedChat) {
            setSelectedThread(
              buildChatThreadDetail(
                selectedChat.messages,
                threadFocus.rootMessageId,
                selectedChat.id,
              ),
            );
            return;
          }
          setSelectedThread(null);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setThreadLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [
    accessToken,
    e2eOfflineFallbackEnabled,
    selectedChat,
    selectedChat?.highWatermark,
    selectedChat?.id,
    selectedChat?.messages.length,
    threadFocus,
  ]);

  const onComposerLayout = (event: LayoutChangeEvent) => {
    const nextHeight = Math.ceil(event.nativeEvent.layout.height);
    if (Math.abs(nextHeight - composerOverlayHeight) > 2) {
      setComposerOverlayHeight(nextHeight);
    }
  };
  const openCounterpartyProfile = (userId: string) => {
    onOpenUserProfile({
      userId,
      context: {
        source: "chat",
        reason: selectedChat
          ? `Context from "${selectedChat.title}" conversation`
          : "Context from your chat thread",
        sharedTopics: selectedChat?.title
          ? selectedChat.title
              .split(/[\s,-]+/)
              .map((item) => item.trim())
              .filter((item) => item.length > 2)
              .slice(0, 3)
          : [],
        lastInteraction: "You chatted recently",
      },
    });
  };

  const sendCurrentMessage = async () => {
    const normalizedDraft = draftChatMessage.trim();
    if (!normalizedDraft) {
      return;
    }
    if (!selectedChat) {
      return;
    }

    if (pendingEdit) {
      const success = await onEditOwnMessage(
        selectedChat.id,
        pendingEdit.messageId,
        formatChatReplyBody(normalizedDraft, pendingEdit.reply),
      );
      if (success) {
        clearPendingEdit();
        setDraftChatMessage("");
      }
      return;
    }

    const messageBody = formatChatReplyBody(normalizedDraft, pendingReply);
    clearPendingReply();
    await onSendMessage(messageBody, pendingReply?.messageId);
  };

  const openThreadFocus = (messageId: string) => {
    setThreadFocus({ rootMessageId: messageId });
    setThreadDraft("");
  };

  const closeThreadFocus = () => {
    setThreadFocus(null);
    setThreadDraft("");
  };

  const sendThreadMessage = async () => {
    if (!selectedThread || !threadDraft.trim()) {
      return;
    }
    const normalizedDraft = threadDraft.trim();
    const body = formatChatReplyBody(normalizedDraft, {
      messageId: selectedThread.thread.rootMessage.id,
      excerpt:
        createChatReplyExcerpt(selectedThread.thread.rootMessage.body) ?? "",
    });
    await onSendMessage(body, selectedThread.thread.rootMessage.id);
    setThreadDraft("");
  };

  const reactionOptions = ["👍", "🔥", "😂"];

  return (
    <View
      className="min-h-0 flex-1 bg-canvas px-5 pb-4 pt-2"
      testID="chats-screen"
    >
      <View className="mb-4 flex-row items-center gap-2 px-0.5">
        <View className="rounded-full border border-hairline bg-surfaceMuted px-2.5 py-1">
          <Text
            className={`text-[10px] font-semibold uppercase tracking-[0.14em] ${
              realtimeState === "connected"
                ? "text-ink"
                : realtimeState === "connecting"
                  ? "text-muted"
                  : "text-muted"
            }`}
          >
            {realtimeState === "connected"
              ? "Live"
              : realtimeState === "connecting"
                ? "Connecting"
                : "Offline"}
          </Text>
        </View>
        <Text
          className="min-w-0 flex-1 text-[12px] leading-[18px] text-muted"
          numberOfLines={2}
        >
          Human conversations live here.
        </Text>
      </View>

      {threads.length === 0 ? (
        <EmptyState
          description="When a match is ready, it will show up here."
          title="No chats yet"
        />
      ) : (
        <ScrollView className="mb-4 max-h-44" testID="chat-thread-list">
          {threads.map((thread, index) => (
            <Pressable
              accessibilityHint={
                thread.unreadCount > 0
                  ? `${thread.unreadCount} unread message${thread.unreadCount === 1 ? "" : "s"}.`
                  : "Opens the conversation."
              }
              accessibilityLabel={`Open chat ${thread.title}`}
              accessibilityRole="button"
              className={`mb-2 rounded-[20px] border px-4 py-3 ${
                selectedChat?.id === thread.id
                  ? "border-hairline bg-surfaceMuted"
                  : "border-hairline bg-surfaceMuted/70"
              }`}
              key={thread.id}
              onPress={() => {
                void onOpenChat(thread.id);
              }}
              testID={
                index === 0
                  ? "chat-thread-row-first"
                  : `chat-thread-row-${thread.id}`
              }
            >
              <Text className="text-[14px] font-semibold text-ink">
                {thread.title}
              </Text>
              <View className="mt-1 flex-row items-center justify-between gap-3">
                <Text className="min-w-0 flex-1 text-[11px] text-muted">
                  {thread.messages.at(-1)
                    ? formatMessagePreview(
                        parseChatMessageBody(thread.messages.at(-1)?.body ?? "")
                          .body,
                      )
                    : formatThreadSummary(thread)}
                </Text>
                {thread.unreadCount > 0 ? (
                  <View className="rounded-full bg-ink px-2 py-1">
                    <Text className="text-[10px] font-semibold text-canvas">
                      {thread.unreadCount > 9 ? "9+" : thread.unreadCount}
                    </Text>
                  </View>
                ) : null}
              </View>
            </Pressable>
          ))}
        </ScrollView>
      )}

      <View className="min-h-0 flex-1 overflow-hidden rounded-[26px] border border-hairline bg-surfaceMuted/70">
        <View
          className="min-h-0 flex-1 px-4 pt-4"
          style={{ paddingBottom: composerOverlayHeight }}
          testID={selectedChat ? "chat-selected-thread" : undefined}
        >
          {selectedChat ? (
            <>
              <Text className="text-[18px] font-semibold tracking-[-0.02em] text-ink">
                {selectedChat.title}
              </Text>
              <Text className="mt-1 text-[12px] leading-[18px] text-muted">
                {formatThreadSummary(selectedChat)}
              </Text>
              {selectedChat.type === "dm" ? (
                <Text className="mt-1 text-[11px] leading-[18px] text-muted">
                  {formatPresenceLabel(selectedChatPresence) ??
                    "Presence unavailable"}
                </Text>
              ) : null}
              {moderationTargetUserId ? (
                <View className="mb-3 mt-3 flex-row gap-2">
                  <View className="flex-1">
                    <PrimaryButton
                      label="View profile"
                      onPress={() => {
                        openCounterpartyProfile(moderationTargetUserId);
                      }}
                      variant="secondary"
                      testID="chat-view-profile-button"
                    />
                  </View>
                  <View className="flex-1">
                    <PrimaryButton
                      label="Report"
                      onPress={() =>
                        onModerationReport(
                          moderationTargetUserId,
                          selectedChat.id,
                        )
                      }
                      variant="ghost"
                      testID="chat-report-button"
                    />
                  </View>
                  <View className="flex-1">
                    <PrimaryButton
                      label="Block"
                      onPress={() =>
                        onModerationBlock(
                          moderationTargetUserId,
                          selectedChat.id,
                        )
                      }
                      variant="ghost"
                      testID="chat-block-button"
                    />
                  </View>
                </View>
              ) : null}
              {selectedChat.messages.length > 0 ? (
                <View className="min-h-0 flex-1">
                  <ChatTranscriptList
                    contentPaddingTop={12}
                    messages={selectedChat.messages}
                    renderBubble={(message) => {
                      const parsedMessage = parseChatMessageBody(message.body);
                      const isOwnMessage =
                        message.senderUserId === currentUserId;
                      const isDeletedMessage =
                        parsedMessage.body.trim() === "[deleted]";
                      return (
                        <View>
                          <ChatBubble
                            body={
                              isDeletedMessage
                                ? "Message deleted"
                                : parsedMessage.body
                            }
                            deliveryStatus={message.deliveryStatus}
                            isDeleted={isDeletedMessage}
                            messageStatus={message.status}
                            onPress={
                              isOwnMessage
                                ? message.deliveryStatus === "failed"
                                  ? () => {
                                      void onRetryFailedMessage(
                                        activeThreadChatId,
                                        message.id,
                                      );
                                    }
                                  : undefined
                                : () => {
                                    openCounterpartyProfile(
                                      message.senderUserId,
                                    );
                                  }
                            }
                            onLongPress={() => {
                              if (
                                isOwnMessage &&
                                !message.deliveryStatus &&
                                !isDeletedMessage
                              ) {
                                Alert.alert(
                                  "Message options",
                                  "Choose an action for this message.",
                                  [
                                    {
                                      text: "Reply",
                                      onPress: () => {
                                        const excerpt = createChatReplyExcerpt(
                                          parsedMessage.body,
                                        );
                                        if (!excerpt) {
                                          return;
                                        }
                                        clearPendingEdit();
                                        setPendingReply({
                                          messageId: message.id,
                                          excerpt,
                                        });
                                      },
                                    },
                                    {
                                      text: "Edit",
                                      onPress: () => {
                                        clearPendingReply();
                                        setDraftChatMessage(parsedMessage.body);
                                        setPendingEdit({
                                          messageId: message.id,
                                          excerpt: parsedMessage.body,
                                          reply: parsedMessage.reply,
                                        });
                                      },
                                    },
                                    {
                                      text: "Delete message",
                                      style: "destructive",
                                      onPress: () => {
                                        void onDeleteOwnMessage(
                                          selectedChat.id,
                                          message.id,
                                        );
                                      },
                                    },
                                    { text: "Cancel", style: "cancel" },
                                  ],
                                );
                                return;
                              }
                              const excerpt = createChatReplyExcerpt(
                                parsedMessage.body,
                              );
                              if (!excerpt) {
                                return;
                              }
                              clearPendingEdit();
                              setPendingReply({
                                messageId: message.id,
                                excerpt,
                              });
                            }}
                            reply={parsedMessage.reply}
                            role={isOwnMessage ? "user" : "agent"}
                            editedAt={message.editedAt}
                            testID={`chat-bubble-${message.id}`}
                          />
                          {!isDeletedMessage ? (
                            <View
                              className={`mb-3 flex-row flex-wrap gap-1.5 ${
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
                                    reaction.userId === currentUserId,
                                );
                                return (
                                  <Pressable
                                    className={`rounded-full border px-2 py-1 ${
                                      active
                                        ? "border-hairline bg-surface"
                                        : "border-hairline bg-surfaceMuted/70"
                                    }`}
                                    key={`${message.id}-${emoji}`}
                                    onPress={() => {
                                      void onReactToMessage(
                                        selectedChat.id,
                                        message.id,
                                        emoji,
                                      );
                                    }}
                                    testID={`chat-reaction-${message.id}-${emoji}`}
                                  >
                                    <Text className="text-[11px] text-ink">
                                      {emoji}
                                      {count > 0 ? ` ${count}` : ""}
                                    </Text>
                                  </Pressable>
                                );
                              })}
                              {(message.replyToMessageId ||
                                threadSummaries.has(message.id)) &&
                              !isDeletedMessage ? (
                                <Pressable
                                  className="rounded-full border border-hairline bg-surfaceMuted/70 px-2 py-1"
                                  onPress={() => {
                                    openThreadFocus(
                                      message.replyToMessageId ?? message.id,
                                    );
                                  }}
                                  testID={`chat-thread-open-${message.id}`}
                                >
                                  <Text className="text-[11px] text-ink">
                                    {(() => {
                                      const threadRootId =
                                        message.replyToMessageId ?? message.id;
                                      const replyCount =
                                        threadSummaries.get(threadRootId)
                                          ?.replyCount ?? 0;
                                      return replyCount > 0
                                        ? `Thread (${replyCount})`
                                        : "Thread";
                                    })()}
                                  </Text>
                                </Pressable>
                              ) : null}
                            </View>
                          ) : null}
                        </View>
                      );
                    }}
                  />
                </View>
              ) : (
                <View className="min-h-0 flex-1 items-center justify-center">
                  <Text className="text-[13px] text-muted">
                    No messages yet.
                  </Text>
                </View>
              )}
              {loadingMessages ? (
                <Text className="mb-2 text-[11px] text-muted">
                  Syncing latest…
                </Text>
              ) : null}
              {typingUsers.length > 0 ? (
                <Text className="mb-2 text-[11px] text-muted">
                  {typingUsers.length === 1
                    ? "Someone is typing…"
                    : `${typingUsers.length} people are typing…`}
                </Text>
              ) : null}
            </>
          ) : (
            <View className="min-h-0 flex-1 items-center justify-center">
              <Text className="text-center text-[15px] font-medium text-ink">
                Select a chat to start talking
              </Text>
              <Text className="mt-2 max-w-[260px] text-center text-[12px] leading-[18px] text-muted">
                Your composer stays ready here once you open a conversation.
              </Text>
            </View>
          )}
        </View>
        <View
          className="absolute bottom-0 left-0 right-0 px-4 pb-4 pt-2"
          onLayout={onComposerLayout}
        >
          <View className="overflow-hidden rounded-[22px] border border-hairline bg-surfaceMuted/90 px-2 py-2">
            <View
              pointerEvents="none"
              className="absolute inset-0 bg-surface/30"
            />
            {pendingEdit ? (
              <View
                className="mb-2 flex-row items-start justify-between gap-3 rounded-[18px] border border-hairline bg-surface px-3 py-2"
                testID="chat-edit-banner"
              >
                <View className="min-w-0 flex-1">
                  <Text className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">
                    Editing
                  </Text>
                  <Text
                    className="mt-1 text-[12px] leading-[18px] text-ink"
                    numberOfLines={2}
                  >
                    {pendingEdit.excerpt}
                  </Text>
                </View>
                <Pressable
                  accessibilityLabel="Cancel editing"
                  accessibilityRole="button"
                  className="rounded-full px-2 py-1"
                  onPress={() => {
                    clearPendingEdit();
                    setDraftChatMessage("");
                  }}
                >
                  <Text className="text-[12px] font-semibold text-muted">
                    Cancel
                  </Text>
                </Pressable>
              </View>
            ) : pendingReply ? (
              <View
                className="mb-2 flex-row items-start justify-between gap-3 rounded-[18px] border border-hairline bg-surface px-3 py-2"
                testID="chat-reply-banner"
              >
                <View className="min-w-0 flex-1">
                  <Text className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">
                    Replying
                  </Text>
                  <Text
                    className="mt-1 text-[12px] leading-[18px] text-ink"
                    numberOfLines={2}
                  >
                    {pendingReply.excerpt}
                  </Text>
                </View>
                <Pressable
                  accessibilityLabel="Clear pending reply"
                  accessibilityRole="button"
                  className="rounded-full px-2 py-1"
                  onPress={clearPendingReply}
                >
                  <Text className="text-[12px] font-semibold text-muted">
                    Clear
                  </Text>
                </Pressable>
              </View>
            ) : null}
            <MessageComposer
              canSend={canSendMessage}
              inputTestID="chat-message-input"
              maxLength={1000}
              multiline
              onChangeText={setDraftChatMessage}
              onSend={sendCurrentMessage}
              placeholder={
                pendingEdit
                  ? "Update message"
                  : hasSelectedChat
                    ? "Write a message"
                    : "Open a chat to reply"
              }
              sendAccessibilityLabel={
                pendingEdit ? "Save changes" : "Send message"
              }
              sendTestID="chat-send-button"
              sending={sendingMessage}
              value={draftChatMessage}
              voiceEnabled={hasSelectedChat}
            />
          </View>
        </View>
      </View>

      <Modal
        animationType="slide"
        onRequestClose={closeThreadFocus}
        presentationStyle="pageSheet"
        transparent={false}
        visible={threadFocus != null}
      >
        <View
          className="flex-1 bg-canvas px-5 pb-4 pt-4"
          testID="chat-thread-modal"
        >
          <View className="mb-3 flex-row items-center justify-between gap-3">
            <View className="min-w-0 flex-1">
              <Text className="text-[18px] font-semibold tracking-[-0.02em] text-ink">
                Thread
              </Text>
              <Text className="mt-1 text-[12px] leading-[18px] text-muted">
                {selectedThread
                  ? `${selectedThread.thread.replyCount} reply${selectedThread.thread.replyCount === 1 ? "" : "s"} in this chain.`
                  : "Reply chain around the selected message."}
              </Text>
            </View>
            <Pressable
              accessibilityLabel="Close thread"
              accessibilityRole="button"
              className="rounded-full border border-hairline bg-surfaceMuted px-3 py-2"
              onPress={closeThreadFocus}
              testID="chat-thread-close"
            >
              <Text className="text-[12px] font-semibold text-ink">Close</Text>
            </Pressable>
          </View>

          {threadLoading && !selectedThread ? (
            <View className="flex-1 items-center justify-center">
              <Text className="text-[13px] text-muted">Loading thread…</Text>
            </View>
          ) : selectedThread ? (
            <View className="flex-1 overflow-hidden rounded-[26px] border border-hairline bg-surfaceMuted/70">
              <ScrollView
                className="flex-1 px-4 pt-4"
                contentContainerStyle={{ paddingBottom: 18 }}
              >
                <Text className="mb-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">
                  Parent
                </Text>
                {selectedThread.entries.map((entry) => {
                  const message = entry.message;
                  const parsedMessage = parseChatMessageBody(message.body);
                  const isOwnMessage = message.senderUserId === currentUserId;
                  const isDeletedMessage =
                    parsedMessage.body.trim() === "[deleted]";
                  return (
                    <View
                      className="mb-3"
                      key={message.id}
                      style={{ paddingLeft: Math.min(entry.depth * 12, 36) }}
                    >
                      <ChatBubble
                        body={
                          isDeletedMessage
                            ? "Message deleted"
                            : parsedMessage.body
                        }
                        editedAt={message.editedAt}
                        isDeleted={isDeletedMessage}
                        messageStatus={message.status}
                        onPress={
                          isOwnMessage
                            ? undefined
                            : () => {
                                openCounterpartyProfile(message.senderUserId);
                              }
                        }
                        reply={parsedMessage.reply}
                        role={isOwnMessage ? "user" : "agent"}
                        testID={`chat-thread-bubble-${message.id}`}
                      />
                      {entry.depth === 0 ? (
                        <Text className="mt-1 text-[11px] text-muted">
                          Root of this thread
                        </Text>
                      ) : null}
                    </View>
                  );
                })}
              </ScrollView>

              <View className="border-t border-hairline px-4 py-3">
                <Text className="mb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">
                  Reply in thread
                </Text>
                <MessageComposer
                  canSend={threadDraft.trim().length > 0 && !sendingMessage}
                  inputTestID="thread-message-input"
                  maxLength={1000}
                  multiline
                  onChangeText={setThreadDraft}
                  onSend={sendThreadMessage}
                  placeholder="Reply to this thread"
                  sendAccessibilityLabel="Send thread reply"
                  sendTestID="thread-send-button"
                  sending={sendingMessage}
                  value={threadDraft}
                  voiceEnabled={false}
                />
              </View>
            </View>
          ) : (
            <View className="flex-1 items-center justify-center">
              <Text className="text-[13px] text-muted">
                Unable to load thread.
              </Text>
            </View>
          )}
        </View>
      </Modal>
    </View>
  );
}

function formatMessagePreview(body: string) {
  if (body.trim() === "[deleted]") {
    return "Message deleted";
  }
  return body;
}
