import type { ChatMessageRecord } from "./api";

export interface ChatThreadNodeRecord {
  depth: number;
  message: ChatMessageRecord;
}

export interface ChatThreadSummaryRecord {
  rootMessage: ChatMessageRecord;
  replyCount: number;
  messageCount: number;
  participantCount: number;
  lastReplyAt: string | null;
  lastActivityAt: string;
}

export interface ChatThreadDetailRecord {
  chatId: string;
  thread: ChatThreadSummaryRecord;
  entries: ChatThreadNodeRecord[];
}

function compareMessages(
  left: Pick<ChatMessageRecord, "createdAt" | "id">,
  right: Pick<ChatMessageRecord, "createdAt" | "id">,
) {
  const leftTime = Date.parse(left.createdAt);
  const rightTime = Date.parse(right.createdAt);
  if (leftTime !== rightTime) {
    return leftTime - rightTime;
  }
  return left.id.localeCompare(right.id);
}

function buildChildrenByParentId(messages: ChatMessageRecord[]) {
  const childrenByParentId = new Map<string, ChatMessageRecord[]>();
  for (const message of messages) {
    if (!message.replyToMessageId) {
      continue;
    }
    const current = childrenByParentId.get(message.replyToMessageId) ?? [];
    current.push(message);
    childrenByParentId.set(message.replyToMessageId, current);
  }

  for (const children of childrenByParentId.values()) {
    children.sort(compareMessages);
  }

  return childrenByParentId;
}

function buildThreadNodes(
  rootMessage: ChatMessageRecord,
  childrenByParentId: Map<string, ChatMessageRecord[]>,
) {
  const nodes: ChatThreadNodeRecord[] = [
    {
      depth: 0,
      message: rootMessage,
    },
  ];
  const visited = new Set<string>([rootMessage.id]);

  for (let index = 0; index < nodes.length; index += 1) {
    const node = nodes[index];
    const childMessages = childrenByParentId.get(node.message.id) ?? [];
    for (const childMessage of childMessages) {
      if (visited.has(childMessage.id)) {
        continue;
      }
      visited.add(childMessage.id);
      nodes.push({
        depth: node.depth + 1,
        message: childMessage,
      });
    }
  }

  return nodes;
}

function buildThreadSummary(
  rootMessage: ChatMessageRecord,
  nodes: ChatThreadNodeRecord[],
) {
  const latestMessage = nodes.reduce((latest, candidate) => {
    return compareMessages(latest.message, candidate.message) >= 0
      ? latest
      : candidate;
  });
  const latestReply =
    nodes.length > 1
      ? nodes.slice(1).reduce((latest, candidate) => {
          return compareMessages(latest.message, candidate.message) >= 0
            ? latest
            : candidate;
        })
      : null;
  const participantCount = new Set(
    nodes.map((node) => node.message.senderUserId),
  ).size;

  return {
    rootMessage,
    replyCount: Math.max(nodes.length - 1, 0),
    messageCount: nodes.length,
    participantCount,
    lastReplyAt: latestReply?.message.createdAt ?? null,
    lastActivityAt: latestMessage.message.createdAt,
  } satisfies ChatThreadSummaryRecord;
}

export function buildChatThreadSummaries(messages: ChatMessageRecord[]) {
  const childrenByParentId = buildChildrenByParentId(messages);
  return messages
    .filter((message) => (childrenByParentId.get(message.id)?.length ?? 0) > 0)
    .map((rootMessage) => {
      const nodes = buildThreadNodes(rootMessage, childrenByParentId);
      return buildThreadSummary(rootMessage, nodes);
    })
    .sort((left, right) => {
      const latestComparison = compareMessages(
        { createdAt: left.lastActivityAt, id: left.rootMessage.id },
        { createdAt: right.lastActivityAt, id: right.rootMessage.id },
      );
      if (latestComparison !== 0) {
        return -latestComparison;
      }
      return left.rootMessage.id.localeCompare(right.rootMessage.id);
    });
}

export function buildChatThreadDetail(
  messages: ChatMessageRecord[],
  rootMessageId: string,
  chatId: string,
) {
  const messageById = new Map(
    messages.map((message) => [message.id, message] as const),
  );
  const rootMessage =
    messageById.get(rootMessageId) ??
    messages.find((message) => message.replyToMessageId === rootMessageId) ??
    null;

  if (!rootMessage) {
    return null;
  }

  const childrenByParentId = buildChildrenByParentId(messages);
  const nodes = buildThreadNodes(rootMessage, childrenByParentId);
  return {
    chatId,
    thread: buildThreadSummary(rootMessage, nodes),
    entries: nodes,
  } satisfies ChatThreadDetailRecord;
}
