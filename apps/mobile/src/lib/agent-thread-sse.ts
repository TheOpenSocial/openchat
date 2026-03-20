/**
 * Minimal SSE client for React Native (no EventSource). Parses `event:` / `data:` frames.
 */

export type AgentThreadSseMessage = {
  id: string;
  threadId: string;
  role: string;
  content: string;
  createdByUserId: string | null;
  createdAt: string;
  metadata?: unknown;
};

function feedSseBuffer(
  buffer: string,
  chunk: string,
  onEvent: (eventName: string, data: string) => void,
): string {
  let combined = buffer + chunk;
  let sep: number;
  while ((sep = combined.indexOf("\n\n")) >= 0) {
    const frame = combined.slice(0, sep);
    combined = combined.slice(sep + 2);
    let eventName = "message";
    const dataLines: string[] = [];
    for (const line of frame.split("\n")) {
      if (line.startsWith("event:")) {
        eventName = line.slice(6).trim();
      } else if (line.startsWith("data:")) {
        dataLines.push(line.slice(5).trimStart());
      }
    }
    if (dataLines.length > 0) {
      onEvent(eventName, dataLines.join("\n"));
    }
  }
  return combined;
}

export function openAgentThreadSse(
  streamUrl: string,
  onMessage: (message: AgentThreadSseMessage) => void,
): { close: () => void } {
  const xhr = new XMLHttpRequest();
  let carry = "";
  let parsedUpTo = 0;

  xhr.open("GET", streamUrl);
  xhr.setRequestHeader("Accept", "text/event-stream");
  xhr.onprogress = () => {
    const full = xhr.responseText;
    const newPart = full.slice(parsedUpTo);
    parsedUpTo = full.length;
    carry = feedSseBuffer(carry, newPart, (eventName, data) => {
      if (eventName !== "agent.message") {
        return;
      }
      try {
        const parsed = JSON.parse(data) as AgentThreadSseMessage;
        onMessage(parsed);
      } catch {
        /* ignore */
      }
    });
  };
  xhr.send();

  return {
    close: () => {
      xhr.abort();
    },
  };
}
