/**
 * Subscribe to agent thread message fanout (workflow tokens + final agent message).
 * Uses browser EventSource; auth via `access_token` query (required for SSE).
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

const SSE_EVENT = "agent.message";

export function openAgentThreadSse(
  streamUrl: string,
  onMessage: (message: AgentThreadSseMessage) => void,
): { close: () => void } {
  const source = new EventSource(streamUrl);
  const handler = (ev: MessageEvent) => {
    try {
      const parsed = JSON.parse(String(ev.data)) as AgentThreadSseMessage;
      onMessage(parsed);
    } catch {
      /* ignore malformed frames */
    }
  };
  source.addEventListener(SSE_EVENT, handler as EventListener);
  return {
    close: () => {
      source.removeEventListener(SSE_EVENT, handler as EventListener);
      source.close();
    },
  };
}
