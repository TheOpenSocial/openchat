"use client";

import { useEffect, useMemo, useState } from "react";

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
import { api, type ChatMessageRecord } from "@/src/lib/api";
import { WEB_DESIGN_CHATS } from "@/src/mocks/web-design-fixtures";

interface ChatThread {
  id: string;
  connectionId: string;
  title: string;
  messages: ChatMessageRecord[];
}

const CHAT_STORAGE_KEY = "opensocial.web.chat_threads.v1";

export function ChatsScreen() {
  const { isDesignMock, isOnline, session, setBanner } = useAppSession();
  const [chatThreads, setChatThreads] = useState<ChatThread[]>([]);
  const [selectedChatId, setSelectedChatId] = useState<string | null>(null);
  const [chatDraft, setChatDraft] = useState("");
  const [chatBusy, setChatBusy] = useState(false);

  useEffect(() => {
    if (isDesignMock) {
      setChatThreads(WEB_DESIGN_CHATS);
      setSelectedChatId(WEB_DESIGN_CHATS[0]?.id ?? null);
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

  const createChatSandbox = async () => {
    if (!session) {
      return;
    }
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
    if (!session || !selectedChat || !chatDraft.trim()) {
      return;
    }
    const text = chatDraft.trim();
    setChatDraft("");

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
                    body: text,
                    createdAt: new Date().toISOString(),
                  },
                ],
              }
            : thread,
        ),
      );
      return;
    }

    try {
      const message = await api.createChatMessage(
        selectedChat.id,
        session.userId,
        text,
        session.accessToken,
      );
      setChatThreads((current) =>
        current.map((thread) =>
          thread.id === selectedChat.id
            ? { ...thread, messages: [...thread.messages, message] }
            : thread,
        ),
      );
    } catch (error) {
      setBanner({
        tone: "error",
        text: `Could not send message: ${String(error)}`,
      });
    }
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
            isOnline
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
              <div className="max-h-[25rem] overflow-y-auto pr-2">
                {selectedChat.messages.map((message) => (
                  <ChatBubble
                    body={message.body}
                    key={message.id}
                    role={
                      message.senderUserId === session?.userId
                        ? "user"
                        : "agent"
                    }
                  />
                ))}
              </div>

              <div className="mt-4 flex gap-2">
                <Input
                  onChange={(event) => setChatDraft(event.currentTarget.value)}
                  placeholder="Write a message…"
                  value={chatDraft}
                />
                <Button
                  disabled={!chatDraft.trim() || !isOnline}
                  onClick={() => {
                    void sendChatMessage();
                  }}
                  type="button"
                  variant="primary"
                >
                  Send
                </Button>
              </div>
            </>
          )}
        </div>
      </WorkspacePanel>
    </div>
  );
}
