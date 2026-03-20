"use client";

import {
  agentThreadMessagesToTranscript,
  extractResponseTokenDelta,
  type AgentTranscriptRow,
} from "@opensocial/types";
import { useEffect, useMemo, useState } from "react";

import { ChatBubble } from "../src/components/ChatBubble";
import { EmptyState } from "../src/components/EmptyState";
import { InlineNotice } from "../src/components/InlineNotice";
import { SurfaceCard } from "../src/components/SurfaceCard";
import { useBrowserOnline } from "../src/hooks/use-browser-online";
import { usePrimaryAgentThread } from "../src/hooks/use-primary-agent-thread";
import { t } from "../src/i18n/strings";
import {
  api,
  buildAgentThreadStreamUrl,
  ChatMessageRecord,
  configureApiAuthLifecycle,
  getGoogleOAuthStartUrl,
} from "../src/lib/api";
import { openAgentThreadSse } from "../src/lib/agent-thread-sse";
import {
  clearStoredSession,
  loadStoredSession,
  saveStoredSession,
} from "../src/lib/session";
import { WebDesignMockApp } from "../src/WebDesignMockApp";
import {
  AppStage,
  HomeTab,
  SocialMode,
  UserProfileDraft,
  WebSession,
} from "../src/types";

const webDesignMock =
  process.env.NEXT_PUBLIC_DESIGN_MOCK === "1" ||
  process.env.NEXT_PUBLIC_DESIGN_MOCK === "true";

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

interface ChatThread {
  id: string;
  connectionId: string;
  title: string;
  messages: ChatMessageRecord[];
}

const tabLabels: Record<HomeTab, string> = {
  home: "Home",
  chats: "Chats",
  profile: "Profile",
};

const tabDescriptions: Record<HomeTab, string> = {
  home: "Chat with your agent and follow each step as it runs.",
  chats: "Private threads with people you’ve connected with.",
  profile: "Preferences, notifications, and account.",
};

const interestOptions = [
  "Football",
  "Gaming",
  "Tennis",
  "Startups",
  "Design",
  "AI",
];

const WELCOME_HIGHLIGHTS = [
  {
    title: "Plans, not endless feeds",
    body: "Say what you want to do or who you’d like to meet—we surface people and paths that fit, instead of noise.",
  },
  {
    title: "One thread, clear next steps",
    body: "Plan, chat, and follow progress in one place so you always know what’s happening and what to do next.",
  },
  {
    title: "Private when it matters",
    body: "Chats, requests, and your profile stay between you and the people you choose to connect with.",
  },
] as const;

function ProductionWebPage() {
  const [isBootstrapping, setIsBootstrapping] = useState(true);
  const [stage, setStage] = useState<AppStage>("auth");
  const [session, setSession] = useState<WebSession | null>(null);
  const [authCode, setAuthCode] = useState("");
  const [authLoading, setAuthLoading] = useState(false);
  const [onboardingLoading, setOnboardingLoading] = useState(false);
  const [displayName, setDisplayName] = useState("Explorer");
  const [banner, setBanner] = useState<{
    tone: "info" | "error" | "success";
    text: string;
  } | null>(null);
  const [profile, setProfile] = useState<UserProfileDraft>({
    displayName: "Explorer",
    bio: "",
    city: "",
    country: "",
    interests: ["Football", "AI"],
    socialMode: "one_to_one",
    notificationMode: "live",
  });
  const [activeTab, setActiveTab] = useState<HomeTab>("home");
  const [intentDraft, setIntentDraft] = useState("");
  const [agentVoiceDraft, setAgentVoiceDraft] = useState("");
  const [agentImageDraft, setAgentImageDraft] = useState("");
  const [agentTimeline, setAgentTimeline] = useState<AgentTranscriptRow[]>([
    {
      id: "seed_1",
      role: "agent",
      body: "What would you like to do today—or who would you like to meet?",
    },
  ]);
  const [agentComposerMode, setAgentComposerMode] = useState<"chat" | "intent">(
    "chat",
  );
  const [intentSending, setIntentSending] = useState(false);
  const netOnline = useBrowserOnline();
  const agentThreadSyncEnabled = Boolean(session) && stage === "home";
  const { loading: agentThreadLoading, threadId: agentThreadId } =
    usePrimaryAgentThread({
      accessToken: session?.accessToken ?? "",
      enabled: agentThreadSyncEnabled,
      onHydrated: setAgentTimeline,
      onLoadError: () =>
        setBanner({
          tone: "error",
          text: "Could not load your conversation.",
        }),
    });
  const [chatThreads, setChatThreads] = useState<ChatThread[]>([]);
  const [selectedChatId, setSelectedChatId] = useState<string | null>(null);
  const [chatDraft, setChatDraft] = useState("");
  const [chatBusy, setChatBusy] = useState(false);
  const [trustSummary, setTrustSummary] = useState("trust profile not loaded");

  const selectedChat = useMemo(
    () => chatThreads.find((thread) => thread.id === selectedChatId) ?? null,
    [chatThreads, selectedChatId],
  );

  useEffect(() => {
    configureApiAuthLifecycle({
      onSessionRefreshed: (tokens) => {
        setSession((current) => {
          if (!current) {
            return current;
          }
          const next = {
            ...current,
            ...tokens,
          };
          saveStoredSession(next);
          return next;
        });
      },
      onAuthFailure: () => {
        setSession(null);
        setStage("auth");
        setBanner({
          tone: "error",
          text: "Session expired. Sign in again.",
        });
      },
    });
    return () => {
      configureApiAuthLifecycle({});
    };
  }, []);

  useEffect(() => {
    const restore = async () => {
      try {
        const stored = loadStoredSession();
        if (!stored) {
          setStage("auth");
          return;
        }

        const completion = await api.getProfileCompletion(
          stored.userId,
          stored.accessToken,
        );
        setSession(stored);
        setDisplayName(stored.displayName);
        setProfile((current) => ({
          ...current,
          displayName: stored.displayName,
        }));
        setStage(completion.completed ? "home" : "onboarding");
      } catch {
        clearStoredSession();
        setStage("auth");
      } finally {
        setIsBootstrapping(false);
      }
    };

    restore().catch(() => {
      setIsBootstrapping(false);
      setStage("auth");
    });
  }, []);

  useEffect(() => {
    if (!session || stage !== "home") {
      return;
    }

    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | null = null;

    const refreshDashboard = async () => {
      try {
        const [globalRules, trust] = await Promise.all([
          api.getGlobalRules(session.userId, session.accessToken),
          api.getTrustProfile(session.userId, session.accessToken),
        ]);
        if (cancelled) {
          return;
        }

        setProfile((current) => ({
          ...current,
          notificationMode:
            globalRules.notificationMode === "digest" ? "digest" : "live",
        }));

        setTrustSummary(
          `badge: ${String(trust.verificationBadge ?? "unknown")} · reputation: ${String(
            trust.reputationScore ?? "n/a",
          )}`,
        );
      } catch (error) {
        if (!cancelled) {
          setBanner({
            tone: "error",
            text: `Could not refresh dashboard: ${String(error)}`,
          });
        }
      }
    };

    refreshDashboard().catch(() => {});
    timer = setInterval(() => {
      refreshDashboard().catch(() => {});
    }, 28_000);

    return () => {
      cancelled = true;
      if (timer) {
        clearInterval(timer);
      }
    };
  }, [session, stage]);

  const allowWebDemoAuth =
    process.env.NODE_ENV === "development" ||
    process.env.NEXT_PUBLIC_ALLOW_WEB_DEMO_AUTH === "1" ||
    process.env.NEXT_PUBLIC_ALLOW_WEB_DEMO_AUTH === "true";

  const startGoogleOAuth = async () => {
    setAuthLoading(true);
    setBanner(null);
    try {
      const callbackUrl = `${window.location.origin}/auth/callback`;
      const url = await getGoogleOAuthStartUrl(callbackUrl);
      window.location.assign(url);
    } catch (error) {
      setAuthLoading(false);
      setBanner({
        tone: "error",
        text: `Could not start Google sign-in: ${String(error)}`,
      });
    }
  };

  const authenticateWithDemoCode = async () => {
    setAuthLoading(true);
    setBanner(null);
    try {
      const auth = await api.authGoogleCallback(authCode.trim() || "demo-web");
      const nextSession: WebSession = {
        userId: auth.user.id,
        displayName: auth.user.displayName,
        email: auth.user.email,
        accessToken: auth.accessToken,
        refreshToken: auth.refreshToken,
        sessionId: auth.sessionId,
      };
      saveStoredSession(nextSession);

      const completion = await api.getProfileCompletion(
        nextSession.userId,
        nextSession.accessToken,
      );
      setSession(nextSession);
      setDisplayName(nextSession.displayName);
      setProfile((current) => ({
        ...current,
        displayName: nextSession.displayName,
      }));
      setStage(completion.completed ? "home" : "onboarding");
      setBanner({
        tone: "success",
        text: "Authenticated and session persisted.",
      });
    } catch (error) {
      setBanner({
        tone: "error",
        text: `Auth failed: ${String(error)}`,
      });
    } finally {
      setAuthLoading(false);
    }
  };

  const completeOnboarding = async () => {
    if (!session) {
      setBanner({
        tone: "error",
        text: "Session missing. Sign in again.",
      });
      return;
    }

    if (
      profile.bio.trim().length === 0 ||
      profile.city.trim().length === 0 ||
      profile.country.trim().length === 0 ||
      profile.interests.length === 0
    ) {
      setBanner({
        tone: "error",
        text: "Complete bio, city, country, and at least one interest.",
      });
      return;
    }

    setOnboardingLoading(true);
    try {
      await api.updateProfile(
        session.userId,
        {
          bio: profile.bio.trim(),
          city: profile.city.trim(),
          country: profile.country.trim(),
          visibility: "public",
        },
        session.accessToken,
      );
      await Promise.all([
        api.replaceInterests(
          session.userId,
          profile.interests.map((interest) => ({
            kind: "topic",
            label: interest,
          })),
          session.accessToken,
        ),
        api.replaceTopics(
          session.userId,
          profile.interests.map((interest) => ({ label: interest })),
          session.accessToken,
        ),
        api.setSocialMode(
          session.userId,
          socialModeToPayload(profile.socialMode),
          session.accessToken,
        ),
        api.setGlobalRules(
          session.userId,
          {
            whoCanContact: "anyone",
            reachable: "always",
            intentMode:
              profile.socialMode === "one_to_one"
                ? "one_to_one"
                : profile.socialMode === "group"
                  ? "group"
                  : "balanced",
            modality: "either",
            languagePreferences: ["en", "es"],
            requireVerifiedUsers: false,
            notificationMode:
              profile.notificationMode === "digest" ? "digest" : "immediate",
            agentAutonomy: "suggest_only",
            memoryMode: "standard",
          },
          session.accessToken,
        ),
      ]);
      setStage("home");
      setBanner({
        tone: "success",
        text: "Onboarding saved.",
      });
    } catch (error) {
      setBanner({
        tone: "error",
        text: `Onboarding failed: ${String(error)}`,
      });
    } finally {
      setOnboardingLoading(false);
    }
  };

  const sendIntent = async () => {
    if (!session || intentDraft.trim().length === 0 || intentSending) {
      return;
    }

    if (!netOnline) {
      setBanner({
        tone: "error",
        text: t("sendBlockedOffline"),
      });
      return;
    }

    const text = intentDraft.trim();
    const voiceForAgent =
      agentComposerMode === "chat" ? agentVoiceDraft.trim() : "";
    const imageExtras =
      agentComposerMode === "chat"
        ? parseOptionalImageAttachmentUrl(agentImageDraft)
        : undefined;
    const marker = Date.now().toString(36);
    const useAgentChat = agentComposerMode === "chat" && Boolean(agentThreadId);
    const workflowBody = useAgentChat
      ? t("agentWorkflowThinking")
      : t("agentWorkflowRouting");

    setIntentSending(true);
    setIntentDraft("");
    setAgentVoiceDraft("");
    setAgentImageDraft("");
    setAgentTimeline((current) => [
      ...current,
      {
        id: `user_${marker}`,
        role: "user",
        body: text,
      },
      {
        id: `workflow_${marker}`,
        role: "workflow",
        body: workflowBody,
      },
    ]);

    try {
      if (useAgentChat && agentThreadId) {
        const traceId = crypto.randomUUID();
        const streamingId = `agent_stream_${marker}`;

        setAgentTimeline((current) => [
          ...current,
          {
            id: streamingId,
            role: "agent",
            body: "",
          },
        ]);

        const sse = openAgentThreadSse(
          buildAgentThreadStreamUrl(agentThreadId, session.accessToken),
          (msg) => {
            const delta = extractResponseTokenDelta(msg, traceId);
            if (delta === null) {
              return;
            }
            setAgentTimeline((current) =>
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
            agentThreadId,
            session.userId,
            text,
            session.accessToken,
            {
              traceId,
              ...(voiceForAgent ? { voiceTranscript: voiceForAgent } : {}),
              ...(imageExtras?.length ? { attachments: imageExtras } : {}),
            },
          );
        } finally {
          sse.close();
        }

        const messages = await api.listAgentThreadMessages(
          agentThreadId,
          session.accessToken,
        );
        setAgentTimeline(agentThreadMessagesToTranscript(messages));
        return;
      }

      const result = await api.createIntent(
        session.userId,
        text,
        session.accessToken,
        undefined,
        agentThreadId ?? undefined,
      );
      setAgentTimeline((current) => [
        ...current,
        {
          id: `agent_${marker}`,
          role: "agent",
          body: `Intent accepted by API (${String(result.id ?? "pending id")}).`,
        },
      ]);
    } catch (error) {
      setAgentTimeline((current) => [
        ...current,
        {
          id: `agent_error_${marker}`,
          role: "error",
          body: `Could not complete request: ${String(error)}`,
        },
      ]);
    } finally {
      setIntentSending(false);
    }
  };

  const createChatSandbox = async () => {
    if (!session) {
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
    if (!session || !selectedChat || chatDraft.trim().length === 0) {
      return;
    }
    try {
      const message = await api.createChatMessage(
        selectedChat.id,
        session.userId,
        chatDraft.trim(),
        session.accessToken,
      );
      setChatDraft("");
      setChatThreads((current) =>
        current.map((thread) =>
          thread.id === selectedChat.id
            ? {
                ...thread,
                messages: [...thread.messages, message],
              }
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

  const saveProfileSettings = async () => {
    if (!session) {
      return;
    }
    try {
      await Promise.all([
        api.setSocialMode(
          session.userId,
          socialModeToPayload(profile.socialMode),
          session.accessToken,
        ),
        api.setGlobalRules(
          session.userId,
          {
            whoCanContact: "anyone",
            reachable: "always",
            intentMode:
              profile.socialMode === "one_to_one"
                ? "one_to_one"
                : profile.socialMode === "group"
                  ? "group"
                  : "balanced",
            modality: "either",
            languagePreferences: ["en", "es"],
            requireVerifiedUsers: false,
            notificationMode:
              profile.notificationMode === "digest" ? "digest" : "immediate",
            agentAutonomy: "suggest_only",
            memoryMode: "standard",
          },
          session.accessToken,
        ),
      ]);
      setBanner({
        tone: "success",
        text: "Profile settings saved.",
      });
    } catch (error) {
      setBanner({
        tone: "error",
        text: `Could not save profile settings: ${String(error)}`,
      });
    }
  };

  const sendDigestNow = async () => {
    if (!session) {
      return;
    }
    try {
      await api.sendDigest(session.userId, session.accessToken);
      setBanner({
        tone: "success",
        text: "Digest request sent.",
      });
    } catch (error) {
      setBanner({
        tone: "error",
        text: `Digest request failed: ${String(error)}`,
      });
    }
  };

  const signOut = () => {
    clearStoredSession();
    setSession(null);
    setStage("auth");
    setBanner({
      tone: "info",
      text: "Signed out.",
    });
  };

  if (isBootstrapping) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center bg-[#212121] px-6">
        <img
          alt=""
          className="h-14 w-14 rounded-2xl ring-1 ring-white/10"
          height={56}
          src="/brand/logo.svg"
          width={56}
        />
        <p className="mt-4 text-sm text-white/50">OpenSocial</p>
        <h1 className="mt-2 font-[var(--font-heading)] text-xl text-white">
          Restoring session…
        </h1>
      </main>
    );
  }

  if (stage === "auth") {
    return (
      <main className="relative min-h-screen overflow-y-auto bg-[#212121]">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-48 bg-gradient-to-b from-emerald-500/[0.07] to-transparent"
        />
        <div className="relative mx-auto flex min-h-screen w-full max-w-[420px] flex-col justify-center px-6 py-14 pb-10">
          <header className="mb-8 text-center">
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/40">
              OpenSocial
            </p>
            <div className="mx-auto mt-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-white/[0.07] ring-1 ring-white/10">
              <img
                alt=""
                className="h-11 w-11"
                height={44}
                src="/brand/logo.svg"
                width={44}
              />
            </div>
            <h1 className="mt-6 font-[var(--font-heading)] text-[30px] font-semibold leading-[1.15] tracking-tight text-white md:text-[34px]">
              Welcome
            </h1>
            <p className="mx-auto mt-3 max-w-[340px] text-[16px] leading-relaxed text-white/60">
              Where your plans meet the right people—social that starts with
              what you actually want to do.
            </p>
          </header>

          <ul className="mb-10 space-y-4">
            {WELCOME_HIGHLIGHTS.map((item) => (
              <li
                className="rounded-2xl border border-white/[0.08] bg-white/[0.03] px-4 py-3.5"
                key={item.title}
              >
                <p className="font-[var(--font-heading)] text-[15px] font-semibold text-white/95">
                  {item.title}
                </p>
                <p className="mt-1.5 text-[13px] leading-relaxed text-white/50">
                  {item.body}
                </p>
              </li>
            ))}
          </ul>

          {banner ? (
            <div className="mb-4">
              <InlineNotice text={banner.text} tone={banner.tone} />
            </div>
          ) : null}
          {!netOnline ? (
            <div className="mb-4">
              <InlineNotice text={t("offlineNotice")} tone="info" />
            </div>
          ) : null}

          <div className="mt-auto space-y-3">
            <p className="text-center text-[13px] text-white/45">
              Ready when you are—sign in to save your profile and pick up on any
              device.
            </p>
            <button
              className="flex h-12 w-full items-center justify-center rounded-full bg-white text-[15px] font-medium text-[#0d0d0d] transition hover:bg-white/90 disabled:opacity-60"
              disabled={authLoading || !netOnline}
              onClick={() => void startGoogleOAuth()}
              type="button"
            >
              {authLoading ? "Redirecting…" : "Continue with Google"}
            </button>
            <p className="text-center text-xs leading-relaxed text-white/40">
              By continuing, Google may share your name and email with
              OpenSocial for account setup.
            </p>
          </div>

          {allowWebDemoAuth ? (
            <details className="mt-8 rounded-xl border border-white/[0.08] bg-white/[0.03] px-4 py-3 text-left">
              <summary className="cursor-pointer text-sm text-white/50">
                Developer: sign in without Google
              </summary>
              <p className="mt-3 text-xs text-white/40">
                Uses the API demo exchange when{" "}
                <code className="text-white/60">demo-web</code> is enabled
                server-side.
              </p>
              <label className="mt-3 block text-[11px] uppercase tracking-wider text-white/35">
                Auth code
              </label>
              <input
                className="mt-1.5 w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2.5 text-sm text-white outline-none placeholder:text-white/25 focus:border-white/20"
                onChange={(event) => setAuthCode(event.currentTarget.value)}
                placeholder="demo-web"
                value={authCode}
              />
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  className="rounded-lg bg-white/10 px-3 py-2 text-xs font-medium text-white/80 hover:bg-white/15 disabled:opacity-50"
                  disabled={authLoading}
                  onClick={() => void authenticateWithDemoCode()}
                  type="button"
                >
                  {authLoading ? "Signing in…" : "Sign in with code"}
                </button>
                <button
                  className="rounded-lg border border-white/10 px-3 py-2 text-xs text-white/55 hover:bg-white/5"
                  disabled={authLoading}
                  onClick={() => {
                    setAuthCode("demo-web");
                    void authenticateWithDemoCode();
                  }}
                  type="button"
                >
                  Use demo-web
                </button>
              </div>
            </details>
          ) : null}
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto min-h-screen w-full max-w-6xl px-4 py-5 md:px-8 md:py-8">
      <div className="mb-5 flex items-center justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.24em] text-ash">
            OpenSocial Web
          </p>
          <h1 className="font-[var(--font-heading)] text-2xl text-ink md:text-3xl">
            Where your plans meet the right people
          </h1>
        </div>
        <div
          className={`h-3 w-3 rounded-full animate-pulseSoft ${
            netOnline ? "bg-emerald-400" : "bg-rose-500"
          }`}
          title={
            netOnline ? "Browser reports online" : "Browser reports offline"
          }
        />
      </div>

      {banner ? (
        <div className="mb-4">
          <InlineNotice text={banner.text} tone={banner.tone} />
        </div>
      ) : null}
      {!netOnline ? (
        <div className="mb-4">
          <InlineNotice text={t("offlineNotice")} tone="info" />
        </div>
      ) : null}

      {stage === "onboarding" ? (
        <section className="animate-rise space-y-4">
          <SurfaceCard>
            <h2 className="font-[var(--font-heading)] text-2xl text-ink">
              Finish your profile
            </h2>
            <p className="mt-1 text-sm text-ash">
              A few details help us suggest better people and plans for you.
            </p>

            <div className="mt-4 grid gap-3 md:grid-cols-3">
              <label className="md:col-span-3">
                <span className="text-xs uppercase tracking-wider text-ash">
                  Bio
                </span>
                <textarea
                  className="mt-1 h-24 w-full rounded-xl border border-slate-700 bg-night px-3 py-2 text-sm text-ink outline-none focus:border-ember"
                  onChange={(event) =>
                    setProfile((current) => ({
                      ...current,
                      bio: event.currentTarget.value,
                    }))
                  }
                  placeholder="I like fast plans and good conversations."
                  value={profile.bio}
                />
              </label>
              <label>
                <span className="text-xs uppercase tracking-wider text-ash">
                  City
                </span>
                <input
                  className="mt-1 w-full rounded-xl border border-slate-700 bg-night px-3 py-2 text-sm text-ink outline-none focus:border-ember"
                  onChange={(event) =>
                    setProfile((current) => ({
                      ...current,
                      city: event.currentTarget.value,
                    }))
                  }
                  value={profile.city}
                />
              </label>
              <label>
                <span className="text-xs uppercase tracking-wider text-ash">
                  Country
                </span>
                <input
                  className="mt-1 w-full rounded-xl border border-slate-700 bg-night px-3 py-2 text-sm text-ink outline-none focus:border-ember"
                  onChange={(event) =>
                    setProfile((current) => ({
                      ...current,
                      country: event.currentTarget.value,
                    }))
                  }
                  value={profile.country}
                />
              </label>
              <label>
                <span className="text-xs uppercase tracking-wider text-ash">
                  Display name
                </span>
                <input
                  className="mt-1 w-full rounded-xl border border-slate-700 bg-night px-3 py-2 text-sm text-ink outline-none focus:border-ember"
                  onChange={(event) =>
                    setDisplayName(event.currentTarget.value)
                  }
                  value={displayName}
                />
              </label>
            </div>

            <div className="mt-4">
              <p className="text-xs uppercase tracking-wider text-ash">
                Interests
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                {interestOptions.map((interest) => {
                  const selected = profile.interests.includes(interest);
                  return (
                    <button
                      className={`rounded-full border px-3 py-1 text-xs transition ${
                        selected
                          ? "border-ember bg-ember/20 text-amber-100"
                          : "border-slate-600 text-slate-300 hover:bg-slate-800"
                      }`}
                      key={interest}
                      onClick={() =>
                        setProfile((current) => ({
                          ...current,
                          interests: current.interests.includes(interest)
                            ? current.interests.filter(
                                (value) => value !== interest,
                              )
                            : [...current.interests, interest],
                        }))
                      }
                      type="button"
                    >
                      {interest}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div>
                <p className="text-xs uppercase tracking-wider text-ash">
                  Social mode
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {(["one_to_one", "group", "either"] as SocialMode[]).map(
                    (mode) => (
                      <button
                        className={`rounded-xl border px-3 py-2 text-xs transition ${
                          profile.socialMode === mode
                            ? "border-ember bg-ember/20 text-amber-100"
                            : "border-slate-600 text-slate-300"
                        }`}
                        key={mode}
                        onClick={() =>
                          setProfile((current) => ({
                            ...current,
                            socialMode: mode,
                          }))
                        }
                        type="button"
                      >
                        {mode.replaceAll("_", " ")}
                      </button>
                    ),
                  )}
                </div>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wider text-ash">
                  Notification mode
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {(["live", "digest"] as const).map((mode) => (
                    <button
                      className={`rounded-xl border px-3 py-2 text-xs transition ${
                        profile.notificationMode === mode
                          ? "border-ember bg-ember/20 text-amber-100"
                          : "border-slate-600 text-slate-300"
                      }`}
                      key={mode}
                      onClick={() =>
                        setProfile((current) => ({
                          ...current,
                          notificationMode: mode,
                        }))
                      }
                      type="button"
                    >
                      {mode}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <button
              className="mt-6 rounded-xl bg-ocean px-4 py-3 text-sm font-semibold text-white transition hover:brightness-110 disabled:opacity-60"
              disabled={onboardingLoading}
              onClick={completeOnboarding}
              type="button"
            >
              {onboardingLoading ? "Saving..." : "Complete onboarding"}
            </button>
          </SurfaceCard>
        </section>
      ) : null}

      {stage === "home" && session ? (
        <section className="animate-rise">
          <div className="grid gap-5 md:grid-cols-[220px_1fr]">
            <aside className="flex gap-2 overflow-x-auto md:block md:space-y-2">
              {(Object.keys(tabLabels) as HomeTab[]).map((tab) => (
                <button
                  className={`rounded-xl px-3 py-2 text-sm font-semibold transition-colors duration-200 ease-out ${
                    activeTab === tab
                      ? "bg-ember text-slate-950 shadow-sm shadow-ember/25"
                      : "bg-slate-900 text-slate-200 hover:bg-slate-800"
                  }`}
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  type="button"
                >
                  {tabLabels[tab]}
                </button>
              ))}
            </aside>

            <div className="space-y-4">
              <SurfaceCard>
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="font-[var(--font-heading)] text-xl text-ink">
                      {tabLabels[activeTab]}
                    </h2>
                    <p className="text-sm leading-relaxed text-ash">
                      {tabDescriptions[activeTab]}
                    </p>
                  </div>
                </div>
              </SurfaceCard>

              {activeTab === "home" ? (
                <SurfaceCard>
                  <div className="max-h-72 overflow-y-auto pr-2">
                    {agentTimeline.map((message) => (
                      <ChatBubble
                        body={message.body}
                        key={message.id}
                        role={message.role}
                      />
                    ))}
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
                        agentComposerMode === "chat"
                          ? "bg-ember text-slate-950"
                          : "border border-slate-600 text-slate-200 hover:bg-slate-800"
                      }`}
                      onClick={() => {
                        setAgentComposerMode("chat");
                      }}
                      type="button"
                    >
                      {t("agentComposerModeChat")}
                    </button>
                    <button
                      className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
                        agentComposerMode === "intent"
                          ? "bg-ember text-slate-950"
                          : "border border-slate-600 text-slate-200 hover:bg-slate-800"
                      }`}
                      onClick={() => {
                        setAgentComposerMode("intent");
                      }}
                      type="button"
                    >
                      {t("agentComposerModeIntent")}
                    </button>
                  </div>
                  {agentThreadLoading ? (
                    <p className="mt-2 text-xs text-ash">
                      {t("agentHistoryLoading")}
                    </p>
                  ) : null}
                  <p className="mt-2 text-xs text-ash">
                    {agentComposerMode === "chat"
                      ? t("agentComposerHintChat")
                      : t("agentComposerHintIntent")}
                  </p>
                  <textarea
                    className="mt-3 h-24 w-full rounded-xl border border-slate-700 bg-night px-3 py-2 text-sm text-ink outline-none transition-colors duration-200 focus:border-ember disabled:opacity-50"
                    disabled={intentSending}
                    onChange={(event) =>
                      setIntentDraft(event.currentTarget.value)
                    }
                    placeholder="e.g. Find three people to discuss product design this week."
                    value={intentDraft}
                  />
                  {agentComposerMode === "chat" ? (
                    <>
                      <label
                        className="mt-3 block text-xs font-medium text-ash"
                        htmlFor="agent-voice-transcript"
                      >
                        {t("agentVoiceTranscriptOptional")}
                      </label>
                      <textarea
                        className="mt-1 h-16 w-full rounded-xl border border-slate-700 bg-night px-3 py-2 text-sm text-ink outline-none transition-colors duration-200 focus:border-ember disabled:opacity-50"
                        disabled={intentSending}
                        id="agent-voice-transcript"
                        onChange={(event) =>
                          setAgentVoiceDraft(event.currentTarget.value)
                        }
                        placeholder="Paste dictation or ASR output…"
                        value={agentVoiceDraft}
                      />
                      <label
                        className="mt-3 block text-xs font-medium text-ash"
                        htmlFor="agent-image-url"
                      >
                        {t("agentImageUrlOptional")}
                      </label>
                      <input
                        className="mt-1 w-full rounded-xl border border-slate-700 bg-night px-3 py-2 text-sm text-ink outline-none transition-colors duration-200 focus:border-ember disabled:opacity-50"
                        disabled={intentSending}
                        id="agent-image-url"
                        onChange={(event) =>
                          setAgentImageDraft(event.currentTarget.value)
                        }
                        placeholder="https://…"
                        type="url"
                        value={agentImageDraft}
                      />
                    </>
                  ) : null}
                  <button
                    className="mt-3 rounded-xl bg-ocean px-4 py-2 text-sm font-semibold text-white transition-[filter] duration-200 hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
                    disabled={
                      intentSending ||
                      intentDraft.trim().length === 0 ||
                      !netOnline
                    }
                    onClick={() => {
                      sendIntent().catch(() => {});
                    }}
                    type="button"
                  >
                    {intentSending
                      ? "Sending…"
                      : agentComposerMode === "chat"
                        ? "Send"
                        : "Send plan"}
                  </button>
                </SurfaceCard>
              ) : null}

              {activeTab === "chats" ? (
                <div className="grid gap-3 lg:grid-cols-[280px_1fr]">
                  <SurfaceCard>
                    <button
                      className="w-full rounded-xl bg-ocean px-3 py-2 text-sm font-semibold text-white"
                      disabled={chatBusy}
                      onClick={() => {
                        createChatSandbox().catch(() => {});
                      }}
                      type="button"
                    >
                      {chatBusy ? "Creating..." : "Create chat sandbox"}
                    </button>
                    <div className="mt-3 space-y-2">
                      {chatThreads.map((thread) => (
                        <button
                          className={`w-full rounded-xl border px-3 py-2 text-left text-sm ${
                            selectedChat?.id === thread.id
                              ? "border-ember bg-ember/10 text-amber-100"
                              : "border-slate-700 text-slate-200"
                          }`}
                          key={thread.id}
                          onClick={() => {
                            openChat(thread.id).catch(() => {});
                          }}
                          type="button"
                        >
                          <p className="font-semibold">{thread.title}</p>
                          <p className="text-xs text-ash">
                            {thread.messages.length} message
                            {thread.messages.length === 1 ? "" : "s"}
                          </p>
                        </button>
                      ))}
                    </div>
                  </SurfaceCard>
                  <SurfaceCard>
                    {!selectedChat ? (
                      <EmptyState
                        description="Create a sandbox and open a chat to test real message persistence."
                        title="No chat selected"
                      />
                    ) : (
                      <>
                        <h3 className="font-semibold text-slate-100">
                          {selectedChat.title}
                        </h3>
                        <div className="mt-3 max-h-72 overflow-y-auto pr-2">
                          {selectedChat.messages.map((message) => (
                            <ChatBubble
                              body={message.body}
                              key={message.id}
                              role={
                                message.senderUserId === session.userId
                                  ? "user"
                                  : "agent"
                              }
                            />
                          ))}
                          {selectedChat.messages.length === 0 ? (
                            <p className="text-sm text-ash">
                              No messages in this thread yet.
                            </p>
                          ) : null}
                        </div>
                        <input
                          className="mt-3 w-full rounded-xl border border-slate-700 bg-night px-3 py-2 text-sm text-ink outline-none focus:border-ember"
                          onChange={(event) =>
                            setChatDraft(event.currentTarget.value)
                          }
                          placeholder="Write a message…"
                          value={chatDraft}
                        />
                        <button
                          className="mt-3 rounded-xl bg-ocean px-3 py-2 text-sm font-semibold text-white"
                          onClick={() => {
                            sendChatMessage().catch(() => {});
                          }}
                          type="button"
                        >
                          Send message
                        </button>
                      </>
                    )}
                  </SurfaceCard>
                </div>
              ) : null}

              {activeTab === "profile" ? (
                <div className="space-y-3">
                  <SurfaceCard>
                    <h3 className="font-semibold text-slate-100">
                      Trust summary
                    </h3>
                    <p className="mt-1 text-sm text-ash">{trustSummary}</p>
                  </SurfaceCard>
                  <SurfaceCard>
                    <h3 className="font-semibold text-slate-100">
                      Social mode
                    </h3>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {(["one_to_one", "group", "either"] as SocialMode[]).map(
                        (mode) => (
                          <button
                            className={`rounded-xl border px-3 py-2 text-xs ${
                              profile.socialMode === mode
                                ? "border-ember bg-ember/20 text-amber-100"
                                : "border-slate-600 text-slate-200"
                            }`}
                            key={mode}
                            onClick={() =>
                              setProfile((current) => ({
                                ...current,
                                socialMode: mode,
                              }))
                            }
                            type="button"
                          >
                            {mode.replaceAll("_", " ")}
                          </button>
                        ),
                      )}
                    </div>
                    <h4 className="mt-4 text-xs uppercase tracking-wider text-ash">
                      Notification mode
                    </h4>
                    <div className="mt-2 flex gap-2">
                      {(["live", "digest"] as const).map((mode) => (
                        <button
                          className={`rounded-xl border px-3 py-2 text-xs ${
                            profile.notificationMode === mode
                              ? "border-ember bg-ember/20 text-amber-100"
                              : "border-slate-600 text-slate-200"
                          }`}
                          key={mode}
                          onClick={() =>
                            setProfile((current) => ({
                              ...current,
                              notificationMode: mode,
                            }))
                          }
                          type="button"
                        >
                          {mode}
                        </button>
                      ))}
                    </div>
                  </SurfaceCard>
                  <div className="grid gap-2 sm:grid-cols-3">
                    <button
                      className="rounded-xl bg-ocean px-3 py-2 text-sm font-semibold text-white"
                      onClick={() => {
                        saveProfileSettings().catch(() => {});
                      }}
                      type="button"
                    >
                      Save settings
                    </button>
                    <button
                      className="rounded-xl border border-slate-600 px-3 py-2 text-sm font-semibold text-slate-100"
                      onClick={() => {
                        sendDigestNow().catch(() => {});
                      }}
                      type="button"
                    >
                      Request digest
                    </button>
                    <button
                      className="rounded-xl border border-rose-500/60 px-3 py-2 text-sm font-semibold text-rose-200"
                      onClick={signOut}
                      type="button"
                    >
                      Sign out
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </section>
      ) : null}
    </main>
  );
}

function socialModeToPayload(socialMode: SocialMode) {
  if (socialMode === "one_to_one") {
    return {
      socialMode: "balanced" as const,
      preferOneToOne: true,
      allowGroupInvites: false,
    };
  }

  if (socialMode === "group") {
    return {
      socialMode: "high_energy" as const,
      preferOneToOne: false,
      allowGroupInvites: true,
    };
  }

  return {
    socialMode: "balanced" as const,
    preferOneToOne: false,
    allowGroupInvites: true,
  };
}

export default function Page() {
  if (webDesignMock) {
    return <WebDesignMockApp />;
  }
  return <ProductionWebPage />;
}
