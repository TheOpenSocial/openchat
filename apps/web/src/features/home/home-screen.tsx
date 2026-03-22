"use client";

import {
  agentThreadMessagesToTranscript,
  extractResponseTokenDelta,
  type AgentTranscriptRow,
} from "@opensocial/types";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { ChatBubble } from "@/src/components/ChatBubble";
import {
  WorkspaceHeader,
  WorkspaceKicker,
  WorkspaceList,
  WorkspaceListItem,
  WorkspaceMutedPanel,
  WorkspacePanel,
  WorkspaceSection,
} from "@/src/components/layout/workspace";
import { Badge } from "@/src/components/ui/badge";
import { Button } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";
import { Label } from "@/src/components/ui/label";
import { Textarea } from "@/src/components/ui/textarea";
import { useAppSession } from "@/src/features/app-shell/app-session";
import { t } from "@/src/i18n/strings";
import { api, buildAgentThreadStreamUrl } from "@/src/lib/api";
import { openAgentThreadSse } from "@/src/lib/agent-thread-sse";
import { WEB_DESIGN_AGENT_TIMELINE } from "@/src/mocks/web-design-fixtures";

function parseOptionalImageAttachmentUrl(raw: string) {
  const trimmed = raw.trim();
  if (!trimmed) {
    return undefined;
  }
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return undefined;
    }
    return [{ kind: "image_url" as const, url: trimmed }];
  } catch {
    return undefined;
  }
}

export function HomeScreen() {
  const { isDesignMock, isOnline, locale, session, setBanner } =
    useAppSession();
  const [threadLoading, setThreadLoading] = useState(false);
  const [threadId, setThreadId] = useState<string | null>(null);
  const [timeline, setTimeline] = useState<AgentTranscriptRow[]>([
    {
      id: "seed_1",
      role: "agent",
      body: "What would you like to do today—or who would you like to meet?",
    },
  ]);
  const [composerMode, setComposerMode] = useState<"chat" | "intent">("chat");
  const [intentDraft, setIntentDraft] = useState("");
  const [voiceDraft, setVoiceDraft] = useState("");
  const [imageDraft, setImageDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [decomposeIntent, setDecomposeIntent] = useState(true);
  const [decomposeMaxIntents, setDecomposeMaxIntents] = useState(3);
  const [pendingSummary, setPendingSummary] = useState<Awaited<
    ReturnType<typeof api.summarizePendingIntents>
  > | null>(null);

  useEffect(() => {
    if (!session) {
      return;
    }
    if (isDesignMock) {
      setTimeline(WEB_DESIGN_AGENT_TIMELINE);
      setPendingSummary({
        userId: session.userId,
        activeIntentCount: 1,
        summaryText: "1 routing flow is active.",
        intents: [
          {
            intentId: "intent_mock_1",
            rawText: "Find someone to try the new omakase spot this week.",
            status: "routing",
            ageMinutes: 12,
            requests: {
              pending: 2,
              accepted: 1,
              rejected: 0,
              expired: 0,
              cancelled: 0,
            },
          },
        ],
      });
      return;
    }
    if (!isOnline) {
      return;
    }

    let cancelled = false;

    const load = async () => {
      setThreadLoading(true);
      try {
        const summary = await api.getMyAgentThreadSummary(session.accessToken);
        if (cancelled) {
          return;
        }
        if (summary) {
          setThreadId(summary.id);
          const messages = await api.listAgentThreadMessages(
            summary.id,
            session.accessToken,
          );
          if (!cancelled && messages.length > 0) {
            setTimeline(agentThreadMessagesToTranscript(messages));
          }
        }
        const pending = await api.summarizePendingIntents(
          session.userId,
          6,
          session.accessToken,
        );
        if (!cancelled) {
          setPendingSummary(pending);
        }
      } catch (error) {
        if (!cancelled) {
          setBanner({
            tone: "error",
            text: `Could not load home thread: ${String(error)}`,
          });
        }
      } finally {
        if (!cancelled) {
          setThreadLoading(false);
        }
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [isDesignMock, isOnline, session, setBanner]);

  const acceptedCount = useMemo(
    () =>
      pendingSummary?.intents.reduce(
        (total, item) => total + item.requests.accepted,
        0,
      ) ?? 0,
    [pendingSummary],
  );

  const sendIntent = async () => {
    if (!session || !intentDraft.trim() || sending) {
      return;
    }
    if (!isOnline) {
      setBanner({ tone: "error", text: t("sendBlockedOffline", locale) });
      return;
    }

    const text = intentDraft.trim();
    const marker = Date.now().toString(36);
    setSending(true);
    setIntentDraft("");
    setVoiceDraft("");
    setImageDraft("");
    setTimeline((current) => [
      ...current,
      { id: `user_${marker}`, role: "user", body: text },
      {
        id: `workflow_${marker}`,
        role: "workflow",
        body:
          composerMode === "chat"
            ? t("agentWorkflowThinking", locale)
            : t("agentWorkflowRouting", locale),
      },
    ]);

    if (isDesignMock) {
      setTimeline((current) => [
        ...current,
        {
          id: `agent_${marker}`,
          role: "agent",
          body:
            composerMode === "chat"
              ? "Preview reply: I understood the goal, started routing, and will keep this thread updated."
              : "Preview intent: split, ranked, and queued for matching.",
        },
      ]);
      setSending(false);
      return;
    }

    try {
      const imageExtras =
        composerMode === "chat"
          ? parseOptionalImageAttachmentUrl(imageDraft)
          : undefined;

      if (composerMode === "chat" && threadId) {
        const traceId = crypto.randomUUID();
        const streamingId = `agent_stream_${marker}`;
        setTimeline((current) => [
          ...current,
          { id: streamingId, role: "agent", body: "" },
        ]);

        const sse = openAgentThreadSse(
          buildAgentThreadStreamUrl(threadId, session.accessToken),
          (message) => {
            const delta = extractResponseTokenDelta(message, traceId);
            if (delta === null) {
              return;
            }
            setTimeline((current) =>
              current.map((row) =>
                row.id === streamingId
                  ? { ...row, body: row.body + delta }
                  : row,
              ),
            );
          },
        );

        try {
          await api.agentThreadRespondStream(
            threadId,
            session.userId,
            text,
            session.accessToken,
            {
              traceId,
              ...(voiceDraft.trim()
                ? { voiceTranscript: voiceDraft.trim() }
                : {}),
              ...(imageExtras?.length ? { attachments: imageExtras } : {}),
            },
          );
        } finally {
          sse.close();
        }

        const messages = await api.listAgentThreadMessages(
          threadId,
          session.accessToken,
        );
        setTimeline(agentThreadMessagesToTranscript(messages));
      } else if (composerMode === "intent" && threadId) {
        const result = await api.createIntentFromAgentMessage(
          threadId,
          session.userId,
          text,
          session.accessToken,
          {
            allowDecomposition: decomposeIntent,
            maxIntents: decomposeMaxIntents,
          },
        );
        setTimeline((current) => [
          ...current,
          {
            id: `agent_${marker}`,
            role: "agent",
            body:
              result.intentCount > 1
                ? `Split into ${result.intentCount} intents and started matching.`
                : `Intent accepted by API (${result.intentId.slice(0, 8)}).`,
          },
        ]);
      } else {
        const result = await api.createIntent(
          session.userId,
          text,
          session.accessToken,
          undefined,
          threadId ?? undefined,
        );
        setTimeline((current) => [
          ...current,
          {
            id: `agent_${marker}`,
            role: "agent",
            body: `Intent accepted by API (${String(result.id ?? "pending")}).`,
          },
        ]);
      }

      const pending = await api.summarizePendingIntents(
        session.userId,
        6,
        session.accessToken,
      );
      setPendingSummary(pending);
    } catch (error) {
      setTimeline((current) => [
        ...current,
        {
          id: `error_${marker}`,
          role: "error",
          body: `Could not complete request: ${String(error)}`,
        },
      ]);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(300px,0.82fr)]">
      <WorkspacePanel className="space-y-5">
        <WorkspaceHeader
          description="Capture intent, follow routing, and keep the whole loop in one thread."
          title="Agent home"
        />

        <div
          className="max-h-[29rem] overflow-y-auto pr-2"
          data-testid="web-agent-thread"
        >
          {timeline.map((message) => (
            <ChatBubble
              body={message.body}
              key={message.id}
              role={message.role}
            />
          ))}
        </div>

        <WorkspaceSection className="gap-0">
          <div className="flex flex-wrap gap-2">
            <Button
              onClick={() => setComposerMode("chat")}
              type="button"
              variant={composerMode === "chat" ? "primary" : "secondary"}
            >
              {t("agentComposerModeChat", locale)}
            </Button>
            <Button
              onClick={() => setComposerMode("intent")}
              type="button"
              variant={composerMode === "intent" ? "primary" : "secondary"}
            >
              {t("agentComposerModeIntent", locale)}
            </Button>
          </div>

          {threadLoading ? (
            <p className="text-xs text-ash">
              {t("agentHistoryLoading", locale)}
            </p>
          ) : null}

          <div className="space-y-4 border-t border-[hsl(var(--border-soft))] pt-4">
            <div>
              <Label htmlFor="intent">
                What do you want to do or talk about?
              </Label>
              <Textarea
                data-testid="web-agent-intent-input"
                id="intent"
                onChange={(event) => setIntentDraft(event.currentTarget.value)}
                placeholder="Find three people to discuss product design this week."
                value={intentDraft}
              />
            </div>

            {composerMode === "chat" ? (
              <div className="grid gap-3 lg:grid-cols-[1fr_220px]">
                <div>
                  <Label htmlFor="voice">
                    {t("agentVoiceTranscriptOptional", locale)}
                  </Label>
                  <Textarea
                    className="min-h-16"
                    id="voice"
                    onChange={(event) =>
                      setVoiceDraft(event.currentTarget.value)
                    }
                    placeholder="Paste dictation or ASR output…"
                    value={voiceDraft}
                  />
                </div>
                <div>
                  <Label htmlFor="image">
                    {t("agentImageUrlOptional", locale)}
                  </Label>
                  <Input
                    id="image"
                    onChange={(event) =>
                      setImageDraft(event.currentTarget.value)
                    }
                    placeholder="https://…"
                    type="url"
                    value={imageDraft}
                  />
                </div>
              </div>
            ) : (
              <WorkspaceMutedPanel>
                <label className="flex items-center gap-2 text-sm text-white/80">
                  <input
                    checked={decomposeIntent}
                    onChange={(event) =>
                      setDecomposeIntent(event.currentTarget.checked)
                    }
                    type="checkbox"
                  />
                  Split a broad message into multiple intents
                </label>
                <div className="mt-3 w-32">
                  <Label htmlFor="max-intents">Max intents</Label>
                  <Input
                    id="max-intents"
                    max={5}
                    min={1}
                    onChange={(event) =>
                      setDecomposeMaxIntents(
                        Math.min(
                          5,
                          Math.max(
                            1,
                            Number.parseInt(event.currentTarget.value, 10) || 1,
                          ),
                        ),
                      )
                    }
                    type="number"
                    value={decomposeMaxIntents}
                  />
                </div>
              </WorkspaceMutedPanel>
            )}

            <div className="flex flex-wrap items-center gap-3">
              <Button
                data-testid="web-agent-send-intent"
                disabled={sending || !intentDraft.trim() || !isOnline}
                onClick={() => {
                  void sendIntent();
                }}
                type="button"
                variant="primary"
              >
                {sending
                  ? "Sending…"
                  : composerMode === "chat"
                    ? "Send"
                    : "Send plan"}
              </Button>
              <p className="text-sm text-ash">
                Keep the prompt concrete so the system can route quickly and
                explain what happens next.
              </p>
            </div>
          </div>
        </WorkspaceSection>
      </WorkspacePanel>

      <div className="space-y-4">
        <WorkspacePanel>
          <WorkspaceHeader
            description="What the system understood and what is happening now."
            title="Routing status"
          />

          <div className="mt-4 flex flex-wrap gap-2">
            <Badge variant={acceptedCount > 0 ? "success" : "default"}>
              accepted {acceptedCount}
            </Badge>
            <Badge>
              active intents {pendingSummary?.activeIntentCount ?? 0}
            </Badge>
          </div>
          <p className="mt-3 text-sm leading-6 text-ash">
            {pendingSummary?.summaryText ?? "No active routing flow yet."}
          </p>

          <div className="mt-4">
            {pendingSummary?.intents.length ? (
              <WorkspaceList>
                {pendingSummary.intents.map((intent) => (
                  <WorkspaceListItem key={intent.intentId}>
                    <p className="font-medium text-white/92">
                      {intent.rawText}
                    </p>
                    <p className="mt-1 text-xs leading-5 text-ash">
                      {intent.status} · pending {intent.requests.pending} ·
                      accepted {intent.requests.accepted}
                    </p>
                  </WorkspaceListItem>
                ))}
              </WorkspaceList>
            ) : (
              <WorkspaceMutedPanel>
                <p className="text-sm leading-6 text-ash">
                  Start with an intent and we’ll show parsing, fanout, and
                  next-step context here.
                </p>
              </WorkspaceMutedPanel>
            )}
          </div>
        </WorkspacePanel>

        <WorkspacePanel>
          <WorkspaceKicker>Recommended next step</WorkspaceKicker>
          <h3 className="mt-3 font-[var(--font-heading)] text-lg font-semibold tracking-tight text-white">
            Keep the flow moving without leaving the thread.
          </h3>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link href="/discover">
              <Button type="button" variant="secondary">
                Widen search
              </Button>
            </Link>
            <Link href="/requests">
              <Button type="button" variant="secondary">
                Check requests
              </Button>
            </Link>
            <Link href="/chats">
              <Button type="button" variant="secondary">
                Open chats
              </Button>
            </Link>
          </div>
        </WorkspacePanel>
      </div>
    </div>
  );
}
