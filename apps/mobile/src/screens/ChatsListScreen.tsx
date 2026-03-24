import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { BlurView } from "expo-blur";
import { useState } from "react";
import type { LayoutChangeEvent } from "react-native";

import { ChatBubble } from "../components/ChatBubble";
import { ChatTranscriptList } from "../components/ChatTranscriptList";
import { EmptyState } from "../components/EmptyState";
import { MessageComposer } from "../components/MessageComposer";
import { PrimaryButton } from "../components/PrimaryButton";
import type { RealtimeConnectionState } from "../lib/realtime";
import type { ChatMessageRecord } from "../lib/api";

type LocalDeliveryStatus = "sending" | "queued" | "failed";

type LocalChatMessageRecord = ChatMessageRecord & {
  deliveryStatus?: LocalDeliveryStatus;
};

interface LocalChatThread {
  id: string;
  connectionId: string;
  title: string;
  type: "dm" | "group";
  messages: LocalChatMessageRecord[];
  highWatermark: string | null;
  unreadCount: number;
  participantCount: number | null;
  connectionStatus: string | null;
}

interface ChatsListScreenProps {
  currentUserId: string;
  draftChatMessage: string;
  e2eSubmitOnReturn?: boolean;
  loadingMessages: boolean;
  onModerationBlock: (targetUserId: string, chatId: string) => Promise<void>;
  onModerationReport: (targetUserId: string, chatId: string) => Promise<void>;
  onOpenChat: (chatId: string) => Promise<void>;
  onRetryFailedMessage: (chatId: string, messageId: string) => Promise<void>;
  onSendMessage: () => Promise<void>;
  realtimeState: RealtimeConnectionState;
  selectedChat: LocalChatThread | null;
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

export function ChatsListScreen({
  currentUserId,
  draftChatMessage,
  e2eSubmitOnReturn = false,
  loadingMessages,
  onModerationBlock,
  onModerationReport,
  onOpenChat,
  onRetryFailedMessage,
  onSendMessage,
  realtimeState,
  selectedChat,
  sendingMessage,
  setDraftChatMessage,
  threads,
  typingUsers,
}: ChatsListScreenProps) {
  const [composerOverlayHeight, setComposerOverlayHeight] = useState(110);
  const moderationTargetUserId =
    selectedChat?.messages.find(
      (message) => message.senderUserId !== currentUserId,
    )?.senderUserId ?? null;
  const chatMessageLength = draftChatMessage.trim().length;
  const hasSelectedChat = selectedChat != null;
  const canSendMessage =
    hasSelectedChat && chatMessageLength > 0 && !sendingMessage;

  const onComposerLayout = (event: LayoutChangeEvent) => {
    const nextHeight = Math.ceil(event.nativeEvent.layout.height);
    if (Math.abs(nextHeight - composerOverlayHeight) > 2) {
      setComposerOverlayHeight(nextHeight);
    }
  };

  return (
    <View className="min-h-0 flex-1 bg-[#050506] px-5 pb-4 pt-2">
      <View className="mb-4 flex-row items-center gap-2 px-0.5">
        <View className="rounded-full border border-white/[0.08] bg-white/[0.03] px-2.5 py-1">
          <Text
            className={`text-[10px] font-semibold uppercase tracking-[0.14em] ${
              realtimeState === "connected"
                ? "text-white/62"
                : realtimeState === "connecting"
                  ? "text-white/46"
                  : "text-white/34"
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
          className="min-w-0 flex-1 text-[12px] leading-[18px] text-white/32"
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
        <ScrollView className="mb-4 max-h-44">
          {threads.map((thread) => (
            <Pressable
              className={`mb-2 rounded-[20px] border px-4 py-3 ${
                selectedChat?.id === thread.id
                  ? "border-white/[0.14] bg-white/[0.08]"
                  : "border-white/[0.06] bg-white/[0.03]"
              }`}
              key={thread.id}
              onPress={() => {
                void onOpenChat(thread.id);
              }}
            >
              <Text className="text-[14px] font-semibold text-white/88">
                {thread.title}
              </Text>
              <View className="mt-1 flex-row items-center justify-between gap-3">
                <Text className="min-w-0 flex-1 text-[11px] text-white/34">
                  {thread.messages.at(-1)?.body ?? formatThreadSummary(thread)}
                </Text>
                {thread.unreadCount > 0 ? (
                  <View className="rounded-full bg-white px-2 py-1">
                    <Text className="text-[10px] font-semibold text-[#0d0d0d]">
                      {thread.unreadCount > 9 ? "9+" : thread.unreadCount}
                    </Text>
                  </View>
                ) : null}
              </View>
            </Pressable>
          ))}
        </ScrollView>
      )}

      <View className="min-h-0 flex-1 overflow-hidden rounded-[26px] border border-white/[0.06] bg-white/[0.03]">
        <View
          className="min-h-0 flex-1 px-4 pt-4"
          style={{ paddingBottom: composerOverlayHeight }}
        >
          {selectedChat ? (
            <>
              <Text className="text-[18px] font-semibold tracking-[-0.02em] text-white/92">
                {selectedChat.title}
              </Text>
              <Text className="mt-1 text-[12px] leading-[18px] text-white/34">
                {formatThreadSummary(selectedChat)}
              </Text>
              {moderationTargetUserId ? (
                <View className="mb-3 mt-3 flex-row gap-2">
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
                    />
                  </View>
                </View>
              ) : null}
              {selectedChat.messages.length > 0 ? (
                <View className="min-h-0 flex-1">
                  <ChatTranscriptList
                    contentPaddingTop={12}
                    messages={selectedChat.messages}
                    renderBubble={(message) => (
                      <ChatBubble
                        body={message.body}
                        deliveryStatus={message.deliveryStatus}
                        onPress={
                          message.senderUserId === currentUserId &&
                          message.deliveryStatus === "failed"
                            ? () => {
                                void onRetryFailedMessage(
                                  selectedChat.id,
                                  message.id,
                                );
                              }
                            : undefined
                        }
                        role={
                          message.senderUserId === currentUserId
                            ? "user"
                            : "agent"
                        }
                      />
                    )}
                  />
                </View>
              ) : (
                <View className="min-h-0 flex-1 items-center justify-center">
                  <Text className="text-[13px] text-white/34">
                    No messages yet.
                  </Text>
                </View>
              )}
              {loadingMessages ? (
                <Text className="mb-2 text-[11px] text-white/46">
                  Syncing latest…
                </Text>
              ) : null}
              {typingUsers.length > 0 ? (
                <Text className="mb-2 text-[11px] text-white/38">
                  {typingUsers.length === 1
                    ? "Someone is typing…"
                    : `${typingUsers.length} people are typing…`}
                </Text>
              ) : null}
            </>
          ) : (
            <View className="min-h-0 flex-1 items-center justify-center">
              <Text className="text-center text-[15px] font-medium text-white/48">
                Select a chat to start talking
              </Text>
              <Text className="mt-2 max-w-[260px] text-center text-[12px] leading-[18px] text-white/28">
                Your composer stays ready here once you open a conversation.
              </Text>
            </View>
          )}
        </View>
        <View
          className="absolute bottom-0 left-0 right-0 px-4 pb-4 pt-2"
          onLayout={onComposerLayout}
        >
          <View className="overflow-hidden rounded-[22px] border border-white/[0.08] px-2 py-2">
            <BlurView
              intensity={24}
              style={StyleSheet.absoluteFillObject}
              tint="dark"
            />
            <View
              pointerEvents="none"
              style={[
                StyleSheet.absoluteFillObject,
                { backgroundColor: "rgba(8,10,14,0.16)" },
              ]}
            />
            <MessageComposer
              canSend={canSendMessage}
              e2eSubmitOnReturn={e2eSubmitOnReturn}
              inputTestID="chat-message-input"
              maxLength={1000}
              multiline
              onChangeText={setDraftChatMessage}
              onSend={onSendMessage}
              placeholder={
                hasSelectedChat ? "Write a message" : "Open a chat to reply"
              }
              sendAccessibilityLabel="Send message"
              sendTestID="chat-send-button"
              sending={sendingMessage}
              value={draftChatMessage}
              voiceEnabled={hasSelectedChat}
            />
          </View>
        </View>
      </View>
    </View>
  );
}
