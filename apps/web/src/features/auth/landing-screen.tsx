"use client";

import type { ChangeEvent, FormEvent } from "react";

import { useEffect, useId, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { AppLoadingScreen } from "@/src/components/layout/AppLoadingScreen";
import { Alert } from "@/src/components/ui/alert";
import { Button } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";
import { useAppSession } from "@/src/features/app-shell/app-session";
import { api, isRetryableApiError } from "@/src/lib/api";

const scenarios = [
  {
    eyebrow: "Live intent routing",
    headline: "Turn one line into a real human opening.",
    description:
      "Describe what you want to do. OpenSocial interprets it, finds relevant people, and only opens chat after mutual yes.",
    command: "Need 4 people for poker tonight in Palermo",
    status: "Intent resolved · 12 candidate matches · 4 mutual openings",
    lead: "A social runtime that converts intent into permissioned introductions.",
  },
  {
    eyebrow: "Realtime group formation",
    headline: "From prompt to group in a single controlled pass.",
    description:
      "OpenSocial coordinates availability, overlap, and intent instead of leaving users to chase replies manually.",
    command: "Who wants to watch the Champions League final after work?",
    status: "Context assembled · Location bias applied · Group channel ready",
    lead: "The system coordinates availability, overlap, and context before chat opens.",
  },
  {
    eyebrow: "Agentic social layer",
    headline: "Execution first. Conversation only when it matters.",
    description:
      "This is not another chat feed. It is an operating layer that converts social intent into warm, permissioned connections.",
    command: "Looking for a Valorant duo right now with voice chat",
    status: "Skill signal matched · Voice preference aligned · Channel queued",
    lead: "The system works underneath. The result is a cleaner way to meet, plan, and talk.",
  },
] as const;

type WaitlistForm = {
  email: string;
};

type WaitlistStatus = "idle" | "submitting" | "success" | "error";

export function LandingScreen() {
  const router = useRouter();
  const emailId = useId();
  const emailHintId = useId();
  const { bootstrapping, profileComplete, session } = useAppSession();
  const [form, setForm] = useState<WaitlistForm>({ email: "" });
  const [status, setStatus] = useState<WaitlistStatus>("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [scenarioIndex, setScenarioIndex] = useState(0);

  useEffect(() => {
    if (!bootstrapping && session) {
      router.replace(profileComplete ? "/home" : "/onboarding");
    }
  }, [bootstrapping, profileComplete, router, session]);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");

    if (media.matches) {
      return;
    }

    const interval = window.setInterval(() => {
      setScenarioIndex((current) => (current + 1) % scenarios.length);
    }, 3600);

    return () => window.clearInterval(interval);
  }, []);

  const scenario = useMemo(() => scenarios[scenarioIndex], [scenarioIndex]);

  if (bootstrapping || session) {
    return <AppLoadingScreen label="Restoring session…" />;
  }

  const handleEmailChange = (event: ChangeEvent<HTMLInputElement>) => {
    setForm({ email: event.currentTarget.value });
    if (status !== "idle") {
      setStatus("idle");
      setMessage(null);
    }
  };

  const submitWaitlist = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const email = form.email.trim().toLowerCase();

    if (!email || !email.includes("@")) {
      setStatus("error");
      setMessage("Enter a valid email to request access.");
      return;
    }

    setStatus("submitting");
    setMessage(null);

    try {
      await api.joinWaitlist(email);
      setForm({ email: "" });
      setStatus("success");
      setMessage(
        "Access request recorded. We’ll email you when your invite wave opens.",
      );
    } catch (error) {
      setStatus("error");
      setMessage(
        isRetryableApiError(error)
          ? "Could not reach the waitlist service. Try again."
          : error instanceof Error
            ? error.message
            : "Could not save your request. Try again.",
      );
    }
  };

  return (
    <main className="min-h-screen overflow-hidden bg-black text-white">
      <div className="relative min-h-screen overflow-hidden bg-black">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(255,249,168,0.92),rgba(255,249,168,0.78)_14%,rgba(255,255,255,0.82)_28%,rgba(255,255,255,0.04)_44%,rgba(0,0,0,0)_60%),radial-gradient(circle_at_50%_108%,rgba(255,184,42,0.9),rgba(255,184,42,0.52)_18%,rgba(0,0,0,0)_42%),linear-gradient(180deg,#141414_0%,#050505_52%,#000_100%)]" />
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(90deg,transparent_0%,rgba(255,255,255,0.025)_14%,transparent_22%,transparent_78%,rgba(255,255,255,0.025)_86%,transparent_100%)] opacity-70" />
        <div className="pointer-events-none absolute inset-x-[24%] top-[22%] h-[36vh] rounded-full bg-white/5 blur-[130px]" />
        <div className="pointer-events-none absolute inset-x-[31%] top-[30%] h-[26vh] rounded-full bg-[#ffe7a1]/8 blur-[180px]" />

        <section className="relative z-10 flex min-h-screen items-center justify-center px-3 py-4 sm:px-6 sm:py-8 lg:px-10">
          <div className="relative h-[min(88vh,980px)] w-full max-w-[1420px] overflow-hidden rounded-[1rem] border border-white/12 bg-[linear-gradient(180deg,rgba(20,20,20,0.96),rgba(4,4,4,0.985))] shadow-[0_50px_150px_rgba(0,0,0,0.52)]">
            <div className="absolute inset-x-0 top-0 flex h-8 items-center justify-between border-b border-white/8 bg-[#151515]/95 px-3 text-[9px] tracking-[0.01em] text-white/68 sm:text-[10px]">
              <div className="flex items-center gap-3">
                <span className="font-[var(--font-heading)] font-medium text-white/92">
                  OpenSocial
                </span>
                <span>Agents</span>
                <span>Runtime</span>
                <span>Access</span>
              </div>
              <div className="hidden items-center gap-3 sm:flex">
                <span>Private beta</span>
                <span>Sat Apr 11</span>
              </div>
            </div>

            <div className="absolute left-1/2 top-0 h-4 w-28 -translate-x-1/2 rounded-b-[0.85rem] bg-black" />

            <div className="pointer-events-none absolute inset-0 top-8">
              <div className="absolute left-1/2 top-[55%] h-[52%] w-[32%] -translate-x-1/2 -translate-y-1/2 rounded-[35%] bg-[radial-gradient(circle_at_50%_34%,rgba(255,255,255,0.4),rgba(194,194,194,0.24)_22%,rgba(71,71,71,0.34)_54%,rgba(16,16,16,0.08)_76%,transparent_100%)] blur-[30px]" />
            </div>

            <div className="absolute inset-0 top-8 grid items-center px-4 py-8 lg:grid-cols-[minmax(0,1fr)_420px] lg:px-14">
              <div className="max-w-[360px] lg:block">
                <p className="text-[0.72rem] uppercase tracking-[0.28em] text-white/42">
                  {scenario.eyebrow}
                </p>
                <h1 className="mt-5 font-[var(--font-heading)] text-[3.8rem] font-medium leading-[0.88] tracking-[-0.1em] text-white sm:text-[4.4rem]">
                  Command
                  <br />
                  human
                  <br />
                  connection.
                </h1>
                <p className="mt-5 max-w-[22rem] text-[0.98rem] leading-7 text-white/62">
                  {scenario.lead}
                </p>
              </div>

              <div className="flex items-center justify-center">
                <div className="w-full max-w-[320px] overflow-hidden rounded-[1.55rem] border border-white/20 bg-[linear-gradient(180deg,rgba(255,255,255,0.15),rgba(255,255,255,0.06))] shadow-[0_24px_120px_rgba(0,0,0,0.45),inset_0_1px_0_rgba(255,255,255,0.24)] backdrop-blur-[30px] sm:max-w-[360px]">
                  <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,0.12),transparent_36%,rgba(255,255,255,0.02)_100%)]" />
                  <div className="relative p-4 sm:p-5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-white/28">
                        <span className="h-2.5 w-2.5 rounded-full bg-white/28" />
                        <span className="h-2.5 w-2.5 rounded-full bg-white/16" />
                        <span className="h-2.5 w-2.5 rounded-full bg-white/12" />
                      </div>
                      <div className="rounded-full border border-white/10 bg-white/8 px-2.5 py-1 text-[0.65rem] uppercase tracking-[0.22em] text-white/58">
                        Runtime
                      </div>
                    </div>

                    <div className="mt-7 text-center">
                      <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-[1rem] border border-white/18 bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(232,232,232,0.74))] text-black shadow-[0_18px_40px_rgba(255,255,255,0.12)]">
                        <div className="grid grid-cols-3 gap-[3px]">
                          {Array.from({ length: 9 }).map((_, index) => (
                            <span
                              key={index}
                              className={`h-[5px] w-[5px] rounded-sm ${
                                index % 2 === 0 ? "bg-black" : "bg-black/28"
                              }`}
                            />
                          ))}
                        </div>
                      </div>

                      <p className="mt-4 font-[var(--font-heading)] text-[1.28rem] font-medium tracking-[-0.05em] text-white">
                        OpenSocial
                      </p>
                      <p className="mt-1 text-[0.74rem] uppercase tracking-[0.22em] text-white/48">
                        {scenario.eyebrow}
                      </p>

                      <div className="mt-6 min-h-[6.8rem] transition-all duration-500">
                        <h2 className="font-[var(--font-heading)] text-[2.25rem] font-medium leading-[0.93] tracking-[-0.08em] text-white sm:text-[2.55rem]">
                          {scenario.headline}
                        </h2>
                      </div>

                      <p className="mt-4 text-[0.94rem] leading-6 text-white/72">
                        {scenario.description}
                      </p>
                    </div>

                    <div className="mt-6 overflow-hidden rounded-[1rem] border border-white/14 bg-black/28 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]">
                      <div className="border-b border-white/10 px-4 py-3 text-left">
                        <p className="text-[0.69rem] uppercase tracking-[0.22em] text-white/42">
                          Current command
                        </p>
                        <p className="mt-2 font-[var(--font-heading)] text-[0.98rem] leading-5 tracking-[-0.03em] text-white/88">
                          {scenario.command}
                        </p>
                      </div>
                      <div className="px-4 py-3 text-left">
                        <p className="text-[0.69rem] uppercase tracking-[0.22em] text-white/42">
                          System state
                        </p>
                        <p className="mt-2 text-[0.84rem] leading-5 text-white/68">
                          {scenario.status}
                        </p>
                      </div>
                    </div>

                    <form className="mt-4" onSubmit={submitWaitlist}>
                      <label
                        className="mb-2 block text-left text-[0.69rem] uppercase tracking-[0.22em] text-white/42"
                        htmlFor={emailId}
                      >
                        Request access
                      </label>
                      <div className="flex gap-2 rounded-[0.95rem] border border-white/16 bg-black/26 p-1.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]">
                        <Input
                          aria-describedby={emailHintId}
                          aria-invalid={status === "error"}
                          autoComplete="email"
                          className="h-11 rounded-[0.75rem] border-0 bg-transparent px-3 text-[14px] text-white placeholder:text-white/34 focus-visible:bg-white/0"
                          id={emailId}
                          onChange={handleEmailChange}
                          placeholder="Drop your email"
                          required
                          type="email"
                          value={form.email}
                        />
                        <Button
                          className="h-11 rounded-[0.8rem] px-4 font-[var(--font-heading)] text-[0.92rem] tracking-[-0.03em]"
                          disabled={status === "submitting"}
                          type="submit"
                          variant="primary"
                        >
                          {status === "submitting"
                            ? "Recording"
                            : "Join waitlist"}
                        </Button>
                      </div>

                      <p
                        className="mt-4 text-center text-[0.67rem] leading-5 text-white/40"
                        id={emailHintId}
                      >
                        Humans talk to humans. The system only interprets,
                        routes, and coordinates.
                      </p>

                      {message ? (
                        <div className="mt-4">
                          <Alert
                            aria-live="polite"
                            variant={
                              status === "success" ? "success" : "destructive"
                            }
                          >
                            {message}
                          </Alert>
                        </div>
                      ) : null}
                    </form>
                  </div>
                </div>
              </div>
            </div>

            <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-[0.9rem] border border-white/12 bg-[linear-gradient(180deg,rgba(255,255,255,0.12),rgba(255,255,255,0.06))] p-1.5 shadow-[0_14px_32px_rgba(0,0,0,0.26)] backdrop-blur-md">
              <div className="flex h-8 w-8 items-center justify-center rounded-[0.72rem] bg-black/35 text-white">
                <div className="grid grid-cols-3 gap-[2px]">
                  {Array.from({ length: 9 }).map((_, index) => (
                    <span
                      key={index}
                      className={`h-[4px] w-[4px] rounded-sm ${
                        index % 2 === 0 ? "bg-white" : "bg-white/40"
                      }`}
                    />
                  ))}
                </div>
              </div>
              <div className="flex h-8 w-8 items-center justify-center rounded-[0.72rem] bg-white/84 text-black">
                ◌
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
