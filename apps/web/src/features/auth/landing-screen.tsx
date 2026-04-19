"use client";

import Link from "next/link";
import type { ChangeEvent, FormEvent } from "react";
import { Fragment, useEffect, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";

import { AppLoadingScreen } from "@/src/components/layout/AppLoadingScreen";
import { useAppSession } from "@/src/features/app-shell/app-session";
import { api, isRetryableApiError } from "@/src/lib/api";

// ─── Types ───────────────────────────────────────────────────────────────────
type WaitlistStatus = "idle" | "submitting" | "success" | "error";

type LandingState = {
  activeSection: number;
};

// ─── Intro config (UNTOUCHED) ─────────────────────────────────────────────────
const INTRO_WORDS        = ["Alive.", "Connected.", "Yours."] as const;
const WORD_ENTER_MS      = 300;
const WORD_HOLD_MS       = 500;
const WORD_EXIT_MS       = 220;
const SOCIAL_ENTER_MS    = 320;
const SOCIAL_PRE_TYPE_MS = 120;
const TYPE_CHAR_MS       = 80;
const OPEN_TEXT          = "Open";
const OPENSOCIAL_HOLD_MS = 900;

type WordPhase  = "in" | "hold" | "out";
type IntroStage = "words" | "social-in" | "social-type" | "social-hold" | "exit" | "done";

function useIntroSequence() {
  const [stage,     setStage]     = useState<IntroStage>("words");
  const [wordIdx,   setWordIdx]   = useState(0);
  const [wordPhase, setWordPhase] = useState<WordPhase>("in");
  const [openChars, setOpenChars] = useState(0);

  const timer    = useRef<ReturnType<typeof setTimeout>  | null>(null);
  const interval = useRef<ReturnType<typeof setInterval> | null>(null);
  const clear = () => {
    if (timer.current)    clearTimeout(timer.current);
    if (interval.current) clearInterval(interval.current);
  };

  useEffect(() => {
    if (stage === "words") {
      if (wordPhase === "in")        timer.current = setTimeout(() => setWordPhase("hold"), WORD_ENTER_MS);
      else if (wordPhase === "hold") timer.current = setTimeout(() => setWordPhase("out"), WORD_HOLD_MS);
      else timer.current = setTimeout(() => {
        if (wordIdx < INTRO_WORDS.length - 1) { setWordIdx(i => i + 1); setWordPhase("in"); }
        else setStage("social-in");
      }, WORD_EXIT_MS);
    }
    if (stage === "social-in")  timer.current = setTimeout(() => setStage("social-type"), SOCIAL_ENTER_MS + SOCIAL_PRE_TYPE_MS);
    if (stage === "social-type") {
      let count = 0;
      interval.current = setInterval(() => {
        count++;
        setOpenChars(count);
        if (count >= OPEN_TEXT.length) {
          clearInterval(interval.current!);
          timer.current = setTimeout(() => setStage("social-hold"), 60);
        }
      }, TYPE_CHAR_MS);
    }
    if (stage === "social-hold") timer.current = setTimeout(() => setStage("exit"), OPENSOCIAL_HOLD_MS);
    if (stage === "exit")        timer.current = setTimeout(() => setStage("done"), 900);
    return clear;
  }, [stage, wordPhase, wordIdx]);

  return { stage, wordIdx, wordPhase, openChars };
}

// ─── Cycle words (section 12) ─────────────────────────────────────────────────
const CYCLE_WORDS = ["Alive", "Connected", "Yours"] as const;

function useCycleWords() {
  const [idx,   setIdx]   = useState(0);
  const [phase, setPhase] = useState<"in" | "hold" | "out">("in");
  const t = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (phase === "in")   t.current = setTimeout(() => setPhase("hold"), 400);
    if (phase === "hold") t.current = setTimeout(() => setPhase("out"),  1700);
    if (phase === "out")  t.current = setTimeout(() => { setIdx(i => (i + 1) % CYCLE_WORDS.length); setPhase("in"); }, 400);
    return () => { if (t.current) clearTimeout(t.current); };
  }, [phase, idx]);
  const cls = phase === "in" ? "mf-cycle--in" : phase === "out" ? "mf-cycle--out" : "mf-cycle--hold";
  return { word: CYCLE_WORDS[idx], cls };
}


// ─── Sub-components ───────────────────────────────────────────────────────────

// ─── Kinetic word-split headline ─────────────────────────────────────────────
function AnimText({
  text,
  as: Tag = "h2",
  className,
  baseDelay = 0,
  "data-text": dataText,
}: {
  text: string;
  as?: "h1" | "h2" | "p";
  className?: string;
  baseDelay?: number;
  "data-text"?: string;
}) {
  const lines = text.split("\n");
  let wi = 0;
  return (
    <Tag className={`${className ?? ""} mf-anim-words`} data-text={dataText ?? undefined}>
      {lines.map((line, li) => (
        <Fragment key={li}>
          {li > 0 && <br />}
          {line.split(" ").filter(Boolean).map((word, j) => {
            const delay = baseDelay + wi++ * 55;
            return (
              <Fragment key={j}>
                {j > 0 && " "}
                <span className="mf-word-wrap">
                  <span className="mf-word" style={{ transitionDelay: `${delay}ms` }}>
                    {word}
                  </span>
                </span>
              </Fragment>
            );
          })}
        </Fragment>
      ))}
    </Tag>
  );
}

// ─── Persistent header ────────────────────────────────────────────────────────
function Header({ visible, onNav }: { visible: boolean; onNav: (idx: number) => void }) {
  return (
    <header className={`os-nav${visible ? " os-nav--visible" : ""}`} aria-label="Site navigation">
      <div className="os-nav-inner">
        {/* Logo */}
        <button className="os-nav-logo" onClick={() => onNav(0)} aria-label="Go to top">
          <svg viewBox="0 0 1024 1024" aria-hidden="true" className="os-nav-mark">
            <path d="M512 309A228 228 0 0 0 512 755A228 228 0 0 0 512 309Z" fill="currentColor" />
            <circle cx="407" cy="532" r="228" fill="none" stroke="currentColor" strokeWidth="42" />
            <circle cx="617" cy="532" r="228" fill="none" stroke="currentColor" strokeWidth="42" />
          </svg>
          <span className="os-nav-name" aria-label="OpenSocial">
            <span className="os-nav-short" aria-hidden="true">OS</span>
            <span className="os-nav-long"  aria-hidden="true">OpenSocial</span>
          </span>
        </button>

        {/* Links */}
        <nav className="os-nav-links">
          <Link className="os-nav-link" href="/manifesto">
            Manifesto
          </Link>
          <button className="os-nav-cta" onClick={() => onNav(12)}>
            Join waitlist
          </button>
        </nav>
      </div>
    </header>
  );
}

function ScrollDots({ active, total }: { active: number; total: number }) {
  if (active === total - 1) return null;
  return (
    <div className="mf-dots" aria-hidden="true">
      {Array.from({ length: total }, (_, i) => (
        <div
          key={i}
          className={`mf-dot${i === active ? " mf-dot--active" : i < active ? " mf-dot--past" : ""}`}
        />
      ))}
    </div>
  );
}

function AmbientBackground() {
  return (
    <div className="mf-bg" aria-hidden="true">
      <div className="mf-bg-purple" />
      <div className="mf-bg-blue" />
      <div className="mf-bg-cyan" />
      <div className="mf-bg-vignette" />
      <div className="mf-bg-noise" />
    </div>
  );
}

function Section({
  idx, active, children, className = "", variant = "rise",
}: {
  idx: number; active: boolean; children: React.ReactNode; className?: string; variant?: string;
}) {
  return (
    <section
      className={`mf-s${active ? " mf-s--visible" : ""} ${className}`}
      data-anim={variant}
    >
      <div className="mf-inner">
        {children}
      </div>
    </section>
  );
}

function Lines({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`mf-lines ${className}`}>{children}</div>;
}

function ScrollHint({ visible, up = false, onClick }: { visible: boolean; up?: boolean; onClick?: () => void }) {
  return (
    <div
      className={`mf-scroll-hint${visible ? " mf-scroll-hint--visible" : ""}${up ? " mf-scroll-hint--up" : ""}`}
      aria-label={up ? "Back to top" : undefined}
      role={up ? "button" : undefined}
      tabIndex={up ? 0 : undefined}
      onClick={onClick}
      onKeyDown={up ? (e) => e.key === "Enter" && onClick?.() : undefined}
    >
      {[0, 1, 2].map(i => (
        <svg key={i} className={`mf-scroll-hint-chevron mf-scroll-hint-chevron--${i}`} width="22" height="13" viewBox="0 0 16 9" fill="none">
          <path d="M1 1l7 7 7-7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      ))}
    </div>
  );
}


function FinalCTA({ active }: { active: boolean }) {
  const [email,  setEmail]  = useState("");
  const [status, setStatus] = useState<WaitlistStatus>("idle");
  const [msg,    setMsg]    = useState<string | null>(null);

  const onChange = (e: ChangeEvent<HTMLInputElement>) => {
    setEmail(e.currentTarget.value);
    if (status !== "idle") { setStatus("idle"); setMsg(null); }
  };

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const trimmed = email.trim();
    if (!trimmed) { setStatus("error"); setMsg("Enter your email to get early access."); return; }
    setStatus("submitting"); setMsg(null);
    try {
      await api.joinWaitlist(trimmed);
      setEmail(""); setStatus("success"); setMsg("You're on the list. We'll reach out soon.");
    } catch (err) {
      setStatus("error");
      setMsg(isRetryableApiError(err) ? "Could not reach the server. Try again."
        : err instanceof Error ? err.message : "Something went wrong.");
    }
  };

  return (
    <section
      className={`mf-s mf-s--cta${active ? " mf-s--visible" : ""}`}
      id="waitlist"
    >
      <div className="mf-inner">
        <AnimText as="h2" className="mf-h1" text="Start with what you want." />

        <form className="mf-form mf-delay-1" onSubmit={onSubmit} noValidate>
          {status === "success" ? (
            <p className="mf-success">{msg}</p>
          ) : (
            <>
              <input
                aria-label="Your email"
                autoComplete="email"
                className="mf-cta-input"
                onChange={onChange}
                placeholder="Your email"
                type="email"
                value={email}
              />
              <button
                className={`mf-btn${status === "submitting" ? " mf-btn--busy" : ""}`}
                disabled={status === "submitting"}
                type="submit"
              >
                {status === "submitting" ? "Joining…" : "Get early access"}
              </button>
            </>
          )}
          {status === "error" && msg && <p className="mf-error" role="alert">{msg}</p>}
        </form>

        <p className="mf-footer-note mf-delay-2">© 2025 OpenSocial</p>
      </div>
    </section>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export function LandingScreen() {
  const router = useRouter();
  const { bootstrapping, profileComplete, session } = useAppSession();

  const intro = useIntroSequence();
  const cycle = useCycleWords();

  const [landing, setLanding] = useState<LandingState>({ activeSection: 0 });

  const [shown,  setShown]  = useState<Set<number>>(new Set<number>());
  const pageRef  = useRef<HTMLDivElement>(null);

  // Reveal section 0 once the manifesto mounts (after first paint)
  useEffect(() => {
    if (intro.stage !== "done") return;
    setLanding(prev => ({ ...prev, activeSection: 0 }));
    const t = setTimeout(() => setShown(new Set([0])), 400);
    return () => clearTimeout(t);
  }, [intro.stage]);

  // scrollend fires once snap fully settles — trigger reveal then
  useEffect(() => {
    if (intro.stage !== "done") return;
    const page = pageRef.current;
    if (!page) return;
    const onScrollEnd = () => {
      const idx = Math.round(page.scrollTop / page.clientHeight);
      setShown(prev => {
        if (prev.has(idx)) return prev;
        const next = new Set(prev);
        next.add(idx);
        return next;
      });
    };
    page.addEventListener("scrollend", onScrollEnd, { passive: true });
    return () => page.removeEventListener("scrollend", onScrollEnd);
  }, [intro.stage]);

  // onScroll — only drives the dot indicator (immediate feedback)
  const handleScroll = useCallback(() => {
    const page = pageRef.current;
    if (!page) return;
    const idx = Math.round(page.scrollTop / page.clientHeight);
    setLanding(prev =>
      prev.activeSection === idx ? prev : { ...prev, activeSection: idx }
    );
  }, []);

  // Header nav — scroll to any section index
  const scrollToSection = useCallback((idx: number) => {
    const page = pageRef.current;
    if (!page) return;
    page.scrollTo({ top: idx * page.clientHeight, behavior: "smooth" });
  }, []);


  useEffect(() => {
    if (!bootstrapping && session)
      router.replace(profileComplete ? "/home" : "/onboarding");
  }, [bootstrapping, profileComplete, router, session]);

  if (bootstrapping || session) return <AppLoadingScreen label="Restoring session…" />;

  const introWordClass = (p: WordPhase) =>
    p === "in" ? "os-word--in" : p === "out" ? "os-word--out" : "os-word--hold";

  const vis = (i: number) => shown.has(i);

  const isExiting = intro.stage === "exit";
  const isDone    = intro.stage === "done";

  return (
    <div className="os-root os-root--black">

      {/* ── Persistent header ── */}
      <Header visible={isDone} onNav={scrollToSection} />

      {/* ── INTRO — always in DOM, fades out via CSS ── */}
      <div
        className={`os-word-intro${isExiting ? " os-word-intro--exit" : ""}${isDone ? " os-word-intro--gone" : ""}`}
        aria-hidden="true"
      >
        {!isDone && (
          <div className="os-word-clip">
            {intro.stage === "words" && (
              <span key={intro.wordIdx} className={`os-word ${introWordClass(intro.wordPhase)}`}>
                {INTRO_WORDS[intro.wordIdx]}
              </span>
            )}
            {(intro.stage === "social-in" || intro.stage === "social-type" || intro.stage === "social-hold" || isExiting) && (
              <span className={`os-word ${intro.stage === "social-in" ? "os-word--in" : "os-word--hold"}`}>
                {intro.openChars > 0 && <span className="os-open-prefix">{OPEN_TEXT.slice(0, intro.openChars)}</span>}
                {intro.stage === "social-type" && <span className="os-type-cursor" aria-hidden="true" />}
                Social.
              </span>
            )}
          </div>
        )}
      </div>

      {/* ── MANIFESTO — always in DOM, cross-fades in during exit ── */}
      <div className={`mf-layer${isExiting || isDone ? " mf-layer--visible" : ""}`}>
        <AmbientBackground />
        {/* Down hint — all sections except last */}
        <ScrollHint
          key={`down-${landing.activeSection}`}
          visible={vis(landing.activeSection) && landing.activeSection < 12}
        />
        {/* Up hint — last section only, scrolls back to top */}
        <ScrollHint
          key="up"
          up
          visible={landing.activeSection === 12}
          onClick={() => scrollToSection(0)}
        />
        <ScrollDots active={landing.activeSection} total={13} />

        <div
          className="mf-page"
          ref={pageRef}
          onScroll={handleScroll}
        >

          {/* S1 — Identity anchor · rise: gentle fade-up */}
          <Section idx={0} active={vis(0)} variant="rise">
            <h1 className="mf-brand">OpenSocial</h1>
            <p className="mf-tagline mf-delay-1">Start with what you want.</p>
          </Section>

          {/* S2 — Sharp break · scale: springs in from small */}
          <Section idx={1} active={vis(1)} variant="scale">
            <AnimText as="h2" className="mf-h1" text="Social became passive." />
          </Section>

          {/* S3 — Expanded critique · type: stamps in with no motion */}
          <Section idx={2} active={vis(2)} variant="type">
            <Lines className="mf-lines--fragments">
              <p className="mf-line">People scroll.</p>
              <p className="mf-line">Endlessly.</p>
              <p className="mf-spacer" aria-hidden="true" />
              <p className="mf-line">Things appear.</p>
              <p className="mf-line">Disappear.</p>
              <p className="mf-spacer" aria-hidden="true" />
              <p className="mf-line">Nothing stays.</p>
              <p className="mf-line">Nothing feels owned.</p>
            </Lines>
          </Section>

          {/* S4 — Reflection · focus: sharpens out of heavy blur */}
          <Section idx={3} active={vis(3)} variant="focus">
            <AnimText as="h2" className="mf-h1" text="It was meant to connect people." />
            <Lines>
              <p className="mf-support">Instead, it created distance.</p>
              <p className="mf-support">You watch more than you connect.</p>
            </Lines>
          </Section>

          {/* S5 — Shift · tempo: each word drops fast with spring */}
          <Section idx={4} active={vis(4)} variant="tempo">
            <AnimText as="h2" className="mf-h1" text={"It should start\nwith you."} />
          </Section>

          {/* S6 — Clarification · strike: lines wipe in from left */}
          <Section idx={5} active={vis(5)} variant="strike">
            <Lines>
              <p className="mf-line mf-line--dim">Not feeds.</p>
              <p className="mf-line mf-line--dim">Not profiles.</p>
              <p className="mf-line mf-line--dim">Not something deciding for you.</p>
            </Lines>
            <AnimText as="h2" className="mf-h1 mf-h1--intent" text="Intent." baseDelay={400} />
          </Section>

          {/* S7 — Intent examples · type: stamps in like real searches */}
          <Section idx={6} active={vis(6)} variant="type">
            <Lines className="mf-lines--loose">
              <p className="mf-line mf-line--dim">&ldquo;Find a co-founder who ships.&rdquo;</p>
              <p className="mf-line mf-line--dim">&ldquo;Meet designers who build.&rdquo;</p>
              <p className="mf-line mf-line--dim">&ldquo;Talk to someone thinking long-term.&rdquo;</p>
            </Lines>
            <AnimText as="h2" className="mf-h1 mf-delay-3" text={"That\u2019s intent."} baseDelay={520} />
          </Section>

          {/* S8 — Reframing · tempo: lines snap down with spring */}
          <Section idx={7} active={vis(7)} variant="tempo">
            <Lines className="mf-lines--loose">
              <p className="mf-line">You don&rsquo;t search.</p>
              <p className="mf-line">You don&rsquo;t scroll.</p>
              <p className="mf-line">You start.</p>
              <p className="mf-line mf-line--bright">And it responds.</p>
            </Lines>
          </Section>

          {/* S9 — Mental model · scale: springs in */}
          <Section idx={8} active={vis(8)} variant="scale">
            <AnimText as="h2" className="mf-h1" text="Describe what you need." />
            <Lines>
              <p className="mf-support">Instead of results —</p>
              <p className="mf-support mf-support--bright">people.</p>
            </Lines>
          </Section>

          {/* S10 — Reassurance · focus: dissolves into clarity */}
          <Section idx={9} active={vis(9)} variant="focus">
            <AnimText as="h2" className="mf-h1" text="Someone's ready." />
            <Lines>
              <p className="mf-support">They want what you want.</p>
              <p className="mf-support">They just don&rsquo;t know you yet.</p>
            </Lines>
          </Section>

          {/* S11 — Ownership · impact: single hit, strong spring */}
          <Section idx={10} active={vis(10)} variant="impact">
            <AnimText as="h2" className="mf-h1" text="Make it yours." />
          </Section>

          {/* S12 — Word loop */}
          <Section idx={11} active={vis(11)}>
            <div className="mf-cycle-wrap" aria-live="polite">
              <span key={cycle.word} className={`mf-cycle ${cycle.cls}`}>
                {cycle.word}
              </span>
            </div>
          </Section>

          {/* S13 — Final CTA */}
          <FinalCTA active={vis(12)} />

        </div>
      </div>
    </div>
  );
}
