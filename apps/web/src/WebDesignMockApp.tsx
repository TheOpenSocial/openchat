"use client";

import { Home, MessageSquare, Sparkles, UserRound } from "lucide-react";
import { useMemo, useState } from "react";

import { BrandSignInLayout } from "./components/BrandSignInLayout";
import { ChatBubble } from "./components/ChatBubble";
import { EmptyState } from "./components/EmptyState";
import { InlineNotice } from "./components/InlineNotice";
import { SurfaceCard } from "./components/SurfaceCard";
import type { ChatMessageRecord } from "./lib/api";
import {
  WEB_DESIGN_AGENT_TIMELINE,
  WEB_DESIGN_CHATS,
  WEB_DESIGN_PROFILE,
  WEB_DESIGN_SESSION,
  WEB_DESIGN_TRUST,
  type WebAgentTimelineMessage,
} from "./mocks/web-design-fixtures";
import type { SocialMode, UserProfileDraft, WebSession } from "./types";

type Stage = "welcome" | "auth" | "onboarding" | "home";
type Tab = "home" | "chats" | "profile";

const tabLabels: Record<Tab, string> = {
  home: "Home",
  chats: "Chats",
  profile: "Profile",
};

const tabDescriptions: Record<Tab, string> = {
  home: "Plan, chat, and follow along as things move forward.",
  chats: "Private threads with people you’ve connected with.",
  profile: "Preferences, notifications, and account.",
};

const designTabIcon = {
  home: Home,
  chats: MessageSquare,
  profile: UserRound,
} as const;

const interestOptions = [
  "Football",
  "Gaming",
  "Tennis",
  "Startups",
  "Design",
  "AI",
];

export function WebDesignMockApp() {
  const [stage, setStage] = useState<Stage>("welcome");
  const [session, setSession] = useState<WebSession | null>(null);
  const [displayName, setDisplayName] = useState(
    WEB_DESIGN_PROFILE.displayName,
  );
  const [profile, setProfile] = useState<UserProfileDraft>(WEB_DESIGN_PROFILE);
  const [banner, setBanner] = useState<{
    tone: "info" | "error" | "success";
    text: string;
  } | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>("home");
  const [intentDraft, setIntentDraft] = useState("");
  const [agentTimeline, setAgentTimeline] = useState<WebAgentTimelineMessage[]>(
    [],
  );
  const [chatThreads, setChatThreads] = useState(WEB_DESIGN_CHATS);
  const [selectedChatId, setSelectedChatId] = useState<string | null>(
    WEB_DESIGN_CHATS[0]?.id ?? null,
  );
  const [chatDraft, setChatDraft] = useState("");
  const [trustSummary, setTrustSummary] = useState(WEB_DESIGN_TRUST);

  const selectedChat = useMemo(
    () => chatThreads.find((t) => t.id === selectedChatId) ?? null,
    [chatThreads, selectedChatId],
  );

  const seedHome = () => {
    setAgentTimeline([...WEB_DESIGN_AGENT_TIMELINE]);
    setChatThreads([...WEB_DESIGN_CHATS]);
    setSelectedChatId(WEB_DESIGN_CHATS[0]?.id ?? null);
    setTrustSummary(WEB_DESIGN_TRUST);
    setActiveTab("home");
  };

  const previewSignIn = () => {
    setSession({ ...WEB_DESIGN_SESSION });
    setDisplayName(WEB_DESIGN_SESSION.displayName);
    setProfile({ ...WEB_DESIGN_PROFILE });
    setBanner(null);
    setStage("onboarding");
  };

  const completeOnboarding = () => {
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
    setProfile((current) => ({ ...current, displayName: displayName.trim() }));
    seedHome();
    setBanner({
      tone: "success",
      text: "Preview onboarding complete — exploring mock home.",
    });
    setStage("home");
  };

  const sendIntent = () => {
    const text = intentDraft.trim();
    if (!text) {
      return;
    }
    const marker = Date.now().toString(36);
    setIntentDraft("");
    setAgentTimeline((current) => [
      ...current,
      { id: `u_${marker}`, role: "user", body: text },
      { id: `wf_${marker}`, role: "workflow", body: "Routing (preview)…" },
      {
        id: `a_${marker}`,
        role: "agent",
        body: `Intent queued (${`intent_preview_${marker}`}). Live app fans this out to matching and inbox.`,
      },
    ]);
  };

  const createChatSandbox = () => {
    const marker = Date.now().toString(36);
    const thread = {
      id: `wchat_${marker}`,
      connectionId: `wconn_${marker}`,
      title: `Preview thread ${marker.slice(-4)}`,
      messages: [] as ChatMessageRecord[],
    };
    setChatThreads((c) => [thread, ...c]);
    setSelectedChatId(thread.id);
    setBanner({ tone: "success", text: "Thread added to preview." });
  };

  const sendChatMessage = () => {
    if (!selectedChat || !session || chatDraft.trim().length === 0) {
      return;
    }
    const message: ChatMessageRecord = {
      id: `wmsg_${Date.now().toString(36)}`,
      chatId: selectedChat.id,
      senderUserId: session.userId,
      body: chatDraft.trim(),
      createdAt: new Date().toISOString(),
    };
    setChatDraft("");
    setChatThreads((current) =>
      current.map((thread) =>
        thread.id === selectedChat.id
          ? { ...thread, messages: [...thread.messages, message] }
          : thread,
      ),
    );
  };

  const saveProfileSettings = () => {
    setBanner({ tone: "success", text: "Saved for this preview session." });
  };

  const sendDigestNow = () => {
    setBanner({
      tone: "success",
      text: "Digest queued (preview — no server).",
    });
  };

  const signOut = () => {
    setSession(null);
    setStage("auth");
    setBanner({ tone: "info", text: "Signed out of preview." });
    setAgentTimeline([]);
  };

  if (stage === "welcome") {
    return (
      <BrandSignInLayout contentClassName="justify-center py-16 sm:py-20">
        <div className="mx-auto w-full max-w-md text-center">
          <div className="mb-8 flex items-center justify-between text-left">
            <span className="rounded-full border border-white/20 bg-white/[0.06] px-3 py-1 text-[11px] font-semibold uppercase tracking-widest text-white/55">
              Design preview
            </span>
            <Sparkles
              aria-hidden
              className="h-5 w-5 text-amber-400/90"
              strokeWidth={2}
            />
          </div>
          <div className="mx-auto flex w-fit rounded-3xl border border-white/25 bg-black p-3 shadow-lg shadow-black/40">
            <img
              alt="OpenSocial"
              className="h-14 w-14"
              height={56}
              src="/brand/logo.svg"
              width={56}
            />
          </div>
          <p className="mt-4 text-[10px] font-semibold uppercase tracking-[0.22em] text-white/55">
            OpenSocial
          </p>
          <h1 className="mt-5 font-[var(--font-heading)] text-[clamp(1.85rem,6vw,2.15rem)] font-semibold leading-tight tracking-tight text-white">
            Explore the app
          </h1>
          <p className="mx-auto mt-4 max-w-[340px] text-[15px] leading-7 text-white/70">
            Walk the full web shell—home, chats, profile—with mock data. No API
            or account required.
          </p>
          <button
            className="mt-10 h-12 w-full rounded-full bg-white text-[15px] font-medium text-[#0d0d0d] shadow-md transition hover:shadow-lg active:scale-[0.99]"
            data-testid="web-design-welcome-continue"
            onClick={() => setStage("auth")}
            type="button"
          >
            Explore the app
          </button>
          <p className="mt-4 text-center text-[12px] text-white/50">
            Preview mode · data stays in this browser only
          </p>
        </div>
      </BrandSignInLayout>
    );
  }

  if (stage === "auth") {
    return (
      <BrandSignInLayout contentClassName="justify-end pb-16 pt-10 sm:justify-center sm:pb-20">
        <div className="mx-auto w-full max-w-md text-center">
          <div className="mx-auto flex w-fit rounded-3xl border border-white/25 bg-black p-3 shadow-lg shadow-black/40">
            <img
              alt="OpenSocial"
              className="h-14 w-14"
              height={56}
              src="/brand/logo.svg"
              width={56}
            />
          </div>
          <p className="mt-4 text-[10px] font-semibold uppercase tracking-[0.22em] text-white/55">
            OpenSocial
          </p>
          <h1
            className="mt-6 font-[var(--font-heading)] text-[26px] font-semibold leading-[1.12] tracking-tight text-white sm:text-[28px]"
            data-testid="web-design-auth-title"
          >
            Preview sign-in
          </h1>
          <p className="mx-auto mt-2.5 max-w-[320px] text-[15px] leading-relaxed text-white/70">
            OAuth is off in this build. Continue with a static profile to try
            onboarding and tabs.
          </p>
          <button
            className="mt-10 flex h-12 w-full items-center justify-center rounded-full bg-white text-[15px] font-medium text-[#0d0d0d] shadow-md transition hover:shadow-lg active:scale-[0.99]"
            data-testid="web-design-preview-signin"
            onClick={previewSignIn}
            type="button"
          >
            Continue with preview profile
          </button>
        </div>
      </BrandSignInLayout>
    );
  }

  return (
    <main className="mx-auto min-h-screen w-full max-w-6xl px-4 py-5 md:px-8 md:py-8">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4 border-b border-amber-400/20 pb-5">
        <div className="flex min-w-0 items-start gap-4">
          <div className="hidden shrink-0 rounded-2xl border border-white/15 bg-black/35 p-2 shadow-inner shadow-black/20 sm:block">
            <img
              alt=""
              className="h-9 w-9"
              height={36}
              src="/brand/logo.svg"
              width={36}
            />
          </div>
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-ash">
              OpenSocial
            </p>
            <h1 className="font-[var(--font-heading)] text-2xl font-semibold tracking-tight text-ink md:text-3xl">
              Design preview
            </h1>
            <p className="mt-1 text-xs text-ash/90">Mock data · no API</p>
          </div>
        </div>
        <div className="mt-1 h-3 w-3 shrink-0 rounded-full bg-amber-400 animate-pulseSoft" />
      </div>

      {banner ? (
        <div className="mb-4">
          <InlineNotice text={banner.text} tone={banner.tone} />
        </div>
      ) : null}

      {stage === "onboarding" ? (
        <section className="animate-rise space-y-4">
          <SurfaceCard>
            <h2 className="font-[var(--font-heading)] text-2xl text-ink">
              Finish your profile
            </h2>
            <p className="mt-1 text-sm text-ash">
              Adjust fields—nothing is sent to a server in preview mode.
            </p>

            <div className="mt-4 grid gap-3 md:grid-cols-3">
              <label className="md:col-span-3">
                <span className="text-xs uppercase tracking-wider text-ash">
                  Bio
                </span>
                <textarea
                  className="mt-1 h-24 w-full rounded-xl border border-slate-700 bg-night px-3 py-2 text-sm text-ink outline-none focus:border-ember"
                  onChange={(e) =>
                    setProfile((c) => ({ ...c, bio: e.target.value }))
                  }
                  value={profile.bio}
                />
              </label>
              <label>
                <span className="text-xs uppercase tracking-wider text-ash">
                  City
                </span>
                <input
                  className="mt-1 w-full rounded-xl border border-slate-700 bg-night px-3 py-2 text-sm text-ink outline-none focus:border-ember"
                  onChange={(e) =>
                    setProfile((c) => ({ ...c, city: e.target.value }))
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
                  onChange={(e) =>
                    setProfile((c) => ({ ...c, country: e.target.value }))
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
                  onChange={(e) => setDisplayName(e.target.value)}
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
                        setProfile((c) => ({
                          ...c,
                          interests: c.interests.includes(interest)
                            ? c.interests.filter((x) => x !== interest)
                            : [...c.interests, interest],
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
                          setProfile((c) => ({ ...c, socialMode: mode }))
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
                        setProfile((c) => ({ ...c, notificationMode: mode }))
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
              className="mt-6 rounded-xl bg-ocean px-4 py-3 text-sm font-semibold text-white transition hover:brightness-110"
              data-testid="web-onboarding-continue"
              onClick={completeOnboarding}
              type="button"
            >
              Complete onboarding
            </button>
          </SurfaceCard>
        </section>
      ) : null}

      {stage === "home" && session ? (
        <section className="animate-rise">
          <div className="grid gap-5 md:grid-cols-[220px_1fr]">
            <aside className="flex gap-2 overflow-x-auto md:block md:space-y-2">
              {(Object.keys(tabLabels) as Tab[]).map((tab) => {
                const TabIcon = designTabIcon[tab];
                return (
                  <button
                    className={`flex w-full min-w-[7.5rem] items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors duration-200 ease-out md:min-w-0 ${
                      activeTab === tab
                        ? "bg-ember text-slate-950 shadow-sm shadow-ember/25"
                        : "border border-slate-700/80 bg-slate-900/90 text-slate-200 hover:border-slate-600 hover:bg-slate-800"
                    }`}
                    data-testid={`web-tab-${tab}`}
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    type="button"
                  >
                    <TabIcon
                      aria-hidden
                      className="h-4 w-4 shrink-0 opacity-90"
                      strokeWidth={2}
                    />
                    {tabLabels[tab]}
                  </button>
                );
              })}
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
                  <textarea
                    className="mt-3 h-24 w-full rounded-xl border border-slate-700 bg-night px-3 py-2 text-sm text-ink outline-none transition-colors duration-200 focus:border-ember"
                    data-testid="web-agent-intent-input"
                    onChange={(e) => setIntentDraft(e.target.value)}
                    placeholder="Share what you’re looking for…"
                    value={intentDraft}
                  />
                  <button
                    className="mt-3 rounded-xl bg-ocean px-4 py-2 text-sm font-semibold text-white transition-[filter] duration-200 hover:brightness-110"
                    data-testid="web-agent-send-intent"
                    onClick={sendIntent}
                    type="button"
                  >
                    Send plan
                  </button>
                </SurfaceCard>
              ) : null}

              {activeTab === "chats" ? (
                <div className="grid gap-3 lg:grid-cols-[280px_1fr]">
                  <SurfaceCard>
                    <button
                      className="w-full rounded-xl bg-ocean px-3 py-2 text-sm font-semibold text-white"
                      onClick={createChatSandbox}
                      type="button"
                    >
                      New preview thread
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
                          onClick={() => setSelectedChatId(thread.id)}
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
                        description="Select a thread to read and send messages."
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
                            <p className="text-sm text-ash">No messages yet.</p>
                          ) : null}
                        </div>
                        <input
                          className="mt-3 w-full rounded-xl border border-slate-700 bg-night px-3 py-2 text-sm text-ink outline-none focus:border-ember"
                          onChange={(e) => setChatDraft(e.target.value)}
                          placeholder="Write a message…"
                          value={chatDraft}
                        />
                        <button
                          className="mt-3 rounded-xl bg-ocean px-3 py-2 text-sm font-semibold text-white"
                          onClick={sendChatMessage}
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
                              setProfile((c) => ({ ...c, socialMode: mode }))
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
                            setProfile((c) => ({
                              ...c,
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
                      onClick={saveProfileSettings}
                      type="button"
                    >
                      Save settings
                    </button>
                    <button
                      className="rounded-xl border border-slate-600 px-3 py-2 text-sm font-semibold text-slate-100"
                      onClick={sendDigestNow}
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
