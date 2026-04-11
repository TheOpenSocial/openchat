const CHAT_REPLY_PREFIX = "[[reply:";
const CHAT_REPLY_SUFFIX = "]]";
const CHAT_REPLY_PREVIEW_MAX_LENGTH = 140;

export interface ChatReplyReference {
  messageId: string;
  excerpt: string;
}

export interface ParsedChatMessageBody {
  body: string;
  reply: ChatReplyReference | null;
}

function sanitizeReplyExcerpt(input: string) {
  return input.replace(/\s+/g, " ").trim();
}

function truncateReplyExcerpt(input: string) {
  if (input.length <= CHAT_REPLY_PREVIEW_MAX_LENGTH) {
    return input;
  }
  return `${input.slice(0, CHAT_REPLY_PREVIEW_MAX_LENGTH - 1).trimEnd()}…`;
}

export function createChatReplyExcerpt(input: string) {
  return truncateReplyExcerpt(sanitizeReplyExcerpt(input));
}

export function formatChatReplyBody(
  body: string,
  reply: ChatReplyReference | null | undefined,
) {
  const normalizedBody = body.trim();
  if (!reply || !reply.messageId.trim() || !normalizedBody) {
    return normalizedBody;
  }

  const normalizedExcerpt = createChatReplyExcerpt(reply.excerpt);
  if (!normalizedExcerpt) {
    return normalizedBody;
  }

  return `${CHAT_REPLY_PREFIX}${reply.messageId.trim()}|${encodeURIComponent(
    normalizedExcerpt,
  )}${CHAT_REPLY_SUFFIX}\n${normalizedBody}`;
}

export function parseChatMessageBody(input: string): ParsedChatMessageBody {
  const normalizedInput = input.trim();
  if (!normalizedInput.startsWith(CHAT_REPLY_PREFIX)) {
    return {
      body: normalizedInput,
      reply: null,
    };
  }

  const suffixIndex = normalizedInput.indexOf(CHAT_REPLY_SUFFIX);
  if (suffixIndex <= CHAT_REPLY_PREFIX.length) {
    return {
      body: normalizedInput,
      reply: null,
    };
  }

  const header = normalizedInput.slice(CHAT_REPLY_PREFIX.length, suffixIndex);
  const separatorIndex = header.indexOf("|");
  if (separatorIndex <= 0) {
    return {
      body: normalizedInput,
      reply: null,
    };
  }

  const messageId = header.slice(0, separatorIndex).trim();
  const encodedExcerpt = header.slice(separatorIndex + 1).trim();
  if (!messageId || !encodedExcerpt) {
    return {
      body: normalizedInput,
      reply: null,
    };
  }

  try {
    const excerpt = createChatReplyExcerpt(decodeURIComponent(encodedExcerpt));
    const body = normalizedInput
      .slice(suffixIndex + CHAT_REPLY_SUFFIX.length)
      .trim();
    if (!excerpt || !body) {
      return {
        body: normalizedInput,
        reply: null,
      };
    }
    return {
      body,
      reply: {
        messageId,
        excerpt,
      },
    };
  } catch {
    return {
      body: normalizedInput,
      reply: null,
    };
  }
}
