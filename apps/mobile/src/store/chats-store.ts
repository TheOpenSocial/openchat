import { useSyncExternalStore } from "react";

import type { ChatMessageRecord } from "../lib/api";
import type { StoredChatThread } from "../lib/chat-storage";
import type { RealtimeConnectionState } from "../lib/realtime";

type LocalDeliveryStatus = "sending" | "queued" | "failed";

export type LocalChatMessageRecord = ChatMessageRecord & {
  deliveryStatus?: LocalDeliveryStatus;
};

export type LocalChatThread = Omit<StoredChatThread, "messages"> & {
  messages: LocalChatMessageRecord[];
};

type SetStateAction<T> = T | ((prev: T) => T);

type ChatsState = {
  chats: LocalChatThread[];
  selectedChatId: string | null;
  syncingChats: Record<string, boolean>;
  typingUsersByChat: Record<string, string[]>;
  sendingChatMessage: boolean;
  pendingOutboxCount: number;
  chatStorageReady: boolean;
  realtimeState: RealtimeConnectionState;
};

type ChatsActions = {
  setChats: (value: SetStateAction<LocalChatThread[]>) => void;
  setSelectedChatId: (value: SetStateAction<string | null>) => void;
  setSyncingChats: (value: SetStateAction<Record<string, boolean>>) => void;
  setTypingUsersByChat: (
    value: SetStateAction<Record<string, string[]>>,
  ) => void;
  setSendingChatMessage: (value: SetStateAction<boolean>) => void;
  setPendingOutboxCount: (value: SetStateAction<number>) => void;
  setChatStorageReady: (value: SetStateAction<boolean>) => void;
  setRealtimeState: (value: SetStateAction<RealtimeConnectionState>) => void;
  resetChats: (input?: {
    chats?: LocalChatThread[];
    selectedChatId?: string | null;
    chatStorageReady?: boolean;
    realtimeState?: RealtimeConnectionState;
  }) => void;
};

type ChatsStore = ChatsState & ChatsActions;

const defaultState: ChatsState = {
  chats: [],
  selectedChatId: null,
  syncingChats: {},
  typingUsersByChat: {},
  sendingChatMessage: false,
  pendingOutboxCount: 0,
  chatStorageReady: false,
  realtimeState: "offline",
};

let state: ChatsState = defaultState;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((listener) => listener());
}

function resolveNext<T>(prev: T, value: SetStateAction<T>) {
  return typeof value === "function" ? (value as (prev: T) => T)(prev) : value;
}

function setState(patch: Partial<ChatsState>) {
  state = { ...state, ...patch };
  storeSnapshot = { ...state, ...actions };
  emit();
}

const actions: ChatsActions = {
  setChats(value) {
    setState({ chats: resolveNext(state.chats, value) });
  },
  setSelectedChatId(value) {
    setState({ selectedChatId: resolveNext(state.selectedChatId, value) });
  },
  setSyncingChats(value) {
    setState({ syncingChats: resolveNext(state.syncingChats, value) });
  },
  setTypingUsersByChat(value) {
    setState({
      typingUsersByChat: resolveNext(state.typingUsersByChat, value),
    });
  },
  setSendingChatMessage(value) {
    setState({
      sendingChatMessage: resolveNext(state.sendingChatMessage, value),
    });
  },
  setPendingOutboxCount(value) {
    setState({
      pendingOutboxCount: resolveNext(state.pendingOutboxCount, value),
    });
  },
  setChatStorageReady(value) {
    setState({ chatStorageReady: resolveNext(state.chatStorageReady, value) });
  },
  setRealtimeState(value) {
    setState({ realtimeState: resolveNext(state.realtimeState, value) });
  },
  resetChats(input) {
    setState({
      ...defaultState,
      ...(input?.chats ? { chats: input.chats } : {}),
      ...(input?.selectedChatId !== undefined
        ? { selectedChatId: input.selectedChatId }
        : {}),
      ...(typeof input?.chatStorageReady === "boolean"
        ? { chatStorageReady: input.chatStorageReady }
        : {}),
      ...(input?.realtimeState ? { realtimeState: input.realtimeState } : {}),
    });
  },
};

let storeSnapshot: ChatsStore = { ...state, ...actions };
const defaultSnapshot: ChatsStore = { ...defaultState, ...actions };

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useChatsStore<T>(selector: (store: ChatsStore) => T): T {
  return useSyncExternalStore(
    subscribe,
    () => selector(storeSnapshot),
    () => selector(defaultSnapshot),
  );
}
