import type { ChatMessageRecord } from "../../../lib/api";
import type { LocalChatMessageRecord } from "./types";

export function mergeChatMessages(
  existing: LocalChatMessageRecord[],
  incoming: ChatMessageRecord[],
) {
  const dedupedById = new Map<string, LocalChatMessageRecord>();
  for (const message of [...existing, ...incoming]) {
    dedupedById.set(message.id, message);
  }

  const sorted = Array.from(dedupedById.values()).sort((left, right) => {
    const leftTimestamp = Date.parse(left.createdAt);
    const rightTimestamp = Date.parse(right.createdAt);
    const leftTime = Number.isFinite(leftTimestamp) ? leftTimestamp : 0;
    const rightTime = Number.isFinite(rightTimestamp) ? rightTimestamp : 0;
    if (leftTime !== rightTime) {
      return leftTime - rightTime;
    }
    return left.id.localeCompare(right.id);
  });

  const remoteFingerprintSet = new Set(
    sorted
      .filter((message) => message.deliveryStatus == null)
      .map((message) => fingerprintMessage(message)),
  );

  return sorted.filter((message) => {
    if (message.deliveryStatus == null) {
      return true;
    }
    return !remoteFingerprintSet.has(fingerprintMessage(message));
  });
}

export function formatChatTitle(chatId: string, type: "dm" | "group") {
  const prefix = type === "group" ? "Group" : "Thread";
  return `${prefix} ${chatId.slice(0, 6)}`;
}

export function createClientMessageId() {
  return `${randomHex(8)}-${randomHex(4)}-4${randomHex(3)}-${randomVariantHex()}${randomHex(3)}-${randomHex(12)}`;
}

export function sleep(milliseconds: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

function fingerprintMessage(message: {
  chatId: string;
  senderUserId: string;
  body: string;
}) {
  return [
    message.chatId,
    message.senderUserId,
    message.body.trim().toLowerCase(),
  ].join("::");
}

function randomHex(length: number) {
  let output = "";
  for (let index = 0; index < length; index += 1) {
    output += Math.floor(Math.random() * 16).toString(16);
  }
  return output;
}

function randomVariantHex() {
  const variants = ["8", "9", "a", "b"];
  return variants[Math.floor(Math.random() * variants.length)] ?? "8";
}
