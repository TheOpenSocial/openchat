"use client";

import Link from "next/link";
import type { ChangeEvent, FormEvent } from "react";
import { Fragment, useEffect, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";

import { AppLoadingScreen } from "@/src/components/layout/AppLoadingScreen";
import { useAppSession } from "@/src/features/app-shell/app-session";
import { api, isRetryableApiError } from "@/src/lib/api";
import { PublicLocaleSwitcher } from "./public-locale-switcher";
import { publicCopy, type PublicLocale } from "./public-locale";

// ─── Types ───────────────────────────────────────────────────────────────────
type WaitlistStatus = "idle" | "submitting" | "success" | "error";

type LandingState = {
  activeSection: number;
};

// ─── Intro config ────────────────────────────────────────────────────────────
const WORD_ENTER_MS = 300;
const WORD_HOLD_MS = 500;
const WORD_EXIT_MS = 220;
const SOCIAL_ENTER_MS = 320;
const SOCIAL_PRE_TYPE_MS = 120;
const TYPE_CHAR_MS = 80;
const OPENSOCIAL_HOLD_MS = 900;

type WordPhase = "in" | "hold" | "out";
type IntroStage =
  | "words"
  | "social-in"
  | "social-type"
  | "social-hold"
  | "exit"
  | "done";

const INTRO_SEEN_KEY = "os-intro-seen";

function useIntroSequence({
  introWords,
  openText,
}: {
  introWords: readonly string[];
  openText: string;
}) {
  const [stage, setStage] = useState<IntroStage>("words");
  const [wordIdx, setWordIdx] = useState(0);
  const [wordPhase, setWordPhase] = useState<WordPhase>("in");
  const [openChars, setOpenChars] = useState(0);
  const [skipped, setSkipped] = useState(false);

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const interval = useRef<ReturnType<typeof setInterval> | null>(null);
  const clear = () => {
    if (timer.current) clearTimeout(timer.current);
    if (interval.current) clearInterval(interval.current);
  };

  // On mount: skip intro if already seen this session
  useEffect(() => {
    try {
      if (sessionStorage.getItem(INTRO_SEEN_KEY)) {
        setSkipped(true);
        setStage("done");
      }
    } catch {
      // Session storage can be blocked in privacy modes; the intro should still run.
    }
  }, []);

  // Mark seen when the exit animation begins
  useEffect(() => {
    if (stage === "exit") {
      try {
        sessionStorage.setItem(INTRO_SEEN_KEY, "1");
      } catch {
        // Session storage can be blocked in privacy modes; skipping persistence is safe.
      }
    }
  }, [stage]);

  useEffect(() => {
    if (skipped) return; // don't run timers when skipping
    if (stage === "words") {
      if (wordPhase === "in")
        timer.current = setTimeout(() => setWordPhase("hold"), WORD_ENTER_MS);
      else if (wordPhase === "hold")
        timer.current = setTimeout(() => setWordPhase("out"), WORD_HOLD_MS);
      else
        timer.current = setTimeout(() => {
          if (wordIdx < introWords.length - 1) {
            setWordIdx((i) => i + 1);
            setWordPhase("in");
          } else setStage("social-in");
        }, WORD_EXIT_MS);
    }
    if (stage === "social-in")
      timer.current = setTimeout(
        () => setStage("social-type"),
        SOCIAL_ENTER_MS + SOCIAL_PRE_TYPE_MS,
      );
    if (stage === "social-type") {
      let count = 0;
      interval.current = setInterval(() => {
        count++;
        setOpenChars(count);
        if (count >= openText.length) {
          clearInterval(interval.current!);
          timer.current = setTimeout(() => setStage("social-hold"), 60);
        }
      }, TYPE_CHAR_MS);
    }
    if (stage === "social-hold")
      timer.current = setTimeout(() => setStage("exit"), OPENSOCIAL_HOLD_MS);
    if (stage === "exit")
      timer.current = setTimeout(() => setStage("done"), 900);
    return clear;
  }, [stage, wordPhase, wordIdx, skipped, introWords.length, openText.length]);

  return { stage, wordIdx, wordPhase, openChars, skipped };
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
    <Tag
      className={`${className ?? ""} mf-anim-words`}
      data-text={dataText ?? undefined}
    >
      {lines.map((line, li) => (
        <Fragment key={li}>
          {li > 0 && <br />}
          {line
            .split(" ")
            .filter(Boolean)
            .map((word, j) => {
              const delay = baseDelay + wi++ * 55;
              return (
                <Fragment key={j}>
                  {j > 0 && " "}
                  <span className="mf-word-wrap">
                    <span
                      className="mf-word"
                      style={{ transitionDelay: `${delay}ms` }}
                    >
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
function Header({
  visible,
  onNav,
  locale,
  copy,
}: {
  visible: boolean;
  onNav: (idx: number) => void;
  locale: PublicLocale;
  copy: (typeof publicCopy)[PublicLocale]["landing"];
}) {
  return (
    <header
      className={`os-nav${visible ? " os-nav--visible" : ""}`}
      aria-label={copy.siteNavigation}
    >
      <div className="os-nav-inner">
        {/* Logo */}
        <button
          className="os-nav-logo"
          onClick={() => onNav(0)}
          aria-label={copy.goToTop}
        >
          <svg
            viewBox="0 0 1024 1024"
            aria-hidden="true"
            className="os-nav-mark"
          >
            <path
              d="M512 309A228 228 0 0 0 512 755A228 228 0 0 0 512 309Z"
              fill="currentColor"
            />
            <circle
              cx="407"
              cy="532"
              r="228"
              fill="none"
              stroke="currentColor"
              strokeWidth="42"
            />
            <circle
              cx="617"
              cy="532"
              r="228"
              fill="none"
              stroke="currentColor"
              strokeWidth="42"
            />
          </svg>
          <span className="os-nav-name" aria-label="OpenSocial">
            <span className="os-nav-short" aria-hidden="true">
              OS
            </span>
            <span className="os-nav-long" aria-hidden="true">
              OpenSocial
            </span>
          </span>
        </button>

        {/* Links */}
        <nav className="os-nav-links">
          <Link className="os-nav-link" href="/manifesto">
            {copy.manifestoLink}
          </Link>
          <PublicLocaleSwitcher locale={locale} />
          <Link className="os-nav-cta" href="/waitlist">
            {copy.joinWaitlist}
          </Link>
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
  idx,
  active,
  children,
  className = "",
  variant = "rise",
}: {
  idx: number;
  active: boolean;
  children: React.ReactNode;
  className?: string;
  variant?: string;
}) {
  return (
    <section
      className={`mf-s${active ? " mf-s--visible" : ""} ${className}`}
      data-anim={variant}
      data-section-index={idx}
    >
      <div className="mf-inner">{children}</div>
    </section>
  );
}

function Lines({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <div className={`mf-lines ${className}`}>{children}</div>;
}

function ScrollHint({
  visible,
  up = false,
  onClick,
  label,
}: {
  visible: boolean;
  up?: boolean;
  onClick?: () => void;
  label: string;
}) {
  return (
    <div
      className={`mf-scroll-hint${visible ? " mf-scroll-hint--visible" : ""}${up ? " mf-scroll-hint--up" : ""}`}
      aria-label={up ? label : undefined}
      role={up ? "button" : undefined}
      tabIndex={up ? 0 : undefined}
      onClick={onClick}
      onKeyDown={up ? (e) => e.key === "Enter" && onClick?.() : undefined}
    >
      {[0, 1, 2].map((i) => (
        <svg
          key={i}
          className={`mf-scroll-hint-chevron mf-scroll-hint-chevron--${i}`}
          width="22"
          height="13"
          viewBox="0 0 16 9"
          fill="none"
        >
          <path
            d="M1 1l7 7 7-7"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      ))}
    </div>
  );
}

function FinalCTA({
  active,
  copy,
}: {
  active: boolean;
  copy: (typeof publicCopy)[PublicLocale]["landing"]["finalCta"];
}) {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<WaitlistStatus>("idle");
  const [msg, setMsg] = useState<string | null>(null);

  const onChange = (e: ChangeEvent<HTMLInputElement>) => {
    setEmail(e.currentTarget.value);
    if (status !== "idle") {
      setStatus("idle");
      setMsg(null);
    }
  };

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const trimmed = email.trim();
    if (!trimmed) {
      setStatus("error");
      setMsg(copy.emptyEmail);
      return;
    }
    setStatus("submitting");
    setMsg(null);
    try {
      await api.joinWaitlist(trimmed);
      setEmail("");
      setStatus("success");
      setMsg(copy.success);
    } catch (err) {
      setStatus("error");
      setMsg(
        isRetryableApiError(err)
          ? copy.retry
          : err instanceof Error
            ? err.message
            : copy.unknown,
      );
    }
  };

  return (
    <section
      className={`mf-s mf-s--cta${active ? " mf-s--visible" : ""}`}
      id="waitlist"
    >
      <div className="mf-inner">
        <AnimText as="h2" className="mf-h1" text={copy.title} />

        <form className="mf-form mf-delay-1" onSubmit={onSubmit} noValidate>
          {status === "success" ? (
            <p className="mf-success">{msg}</p>
          ) : (
            <>
              <input
                aria-label={copy.emailLabel}
                autoComplete="email"
                className="mf-cta-input"
                onChange={onChange}
                placeholder={copy.emailPlaceholder}
                type="email"
                value={email}
              />
              <button
                className={`mf-btn${status === "submitting" ? " mf-btn--busy" : ""}`}
                disabled={status === "submitting"}
                type="submit"
              >
                {status === "submitting" ? copy.submitting : copy.submit}
              </button>
            </>
          )}
          {status === "error" && msg && (
            <p className="mf-error" role="alert">
              {msg}
            </p>
          )}
        </form>

        <p className="mf-footer-note mf-delay-2">{copy.footer}</p>
      </div>
    </section>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export function LandingScreen({
  initialLocale = "en",
}: {
  initialLocale?: PublicLocale;
}) {
  const router = useRouter();
  const { bootstrapping, profileComplete, session } = useAppSession();
  const copy = publicCopy[initialLocale].landing;

  const intro = useIntroSequence({
    introWords: copy.introWords,
    openText: copy.openText,
  });
  const [landing, setLanding] = useState<LandingState>({ activeSection: 0 });

  const [shown, setShown] = useState<Set<number>>(new Set<number>());
  const pageRef = useRef<HTMLDivElement>(null);

  // Reveal section 0 once the manifesto mounts (after first paint)
  useEffect(() => {
    if (intro.stage !== "done") return;
    setLanding((prev) => ({ ...prev, activeSection: 0 }));
    const t = setTimeout(() => setShown(new Set([0])), 400);
    return () => clearTimeout(t);
  }, [intro.stage]);

  // scrollend fires once snap fully settles, trigger reveal then
  useEffect(() => {
    if (intro.stage !== "done") return;
    const page = pageRef.current;
    if (!page) return;
    const onScrollEnd = () => {
      const idx = Math.round(page.scrollTop / page.clientHeight);
      setShown((prev) => {
        if (prev.has(idx)) return prev;
        const next = new Set(prev);
        next.add(idx);
        return next;
      });
    };
    page.addEventListener("scrollend", onScrollEnd, { passive: true });
    return () => page.removeEventListener("scrollend", onScrollEnd);
  }, [intro.stage]);

  // onScroll only drives the dot indicator (immediate feedback)
  const handleScroll = useCallback(() => {
    const page = pageRef.current;
    if (!page) return;
    const idx = Math.round(page.scrollTop / page.clientHeight);
    setLanding((prev) =>
      prev.activeSection === idx ? prev : { ...prev, activeSection: idx },
    );
  }, []);

  // Header nav: scroll to any section index
  const scrollToSection = useCallback((idx: number) => {
    const page = pageRef.current;
    if (!page) return;
    page.scrollTo({ top: idx * page.clientHeight, behavior: "smooth" });
  }, []);

  useEffect(() => {
    if (!bootstrapping && session)
      router.replace(profileComplete ? "/home" : "/onboarding");
  }, [bootstrapping, profileComplete, router, session]);

  if (bootstrapping || session)
    return <AppLoadingScreen label={copy.loadingSession} />;

  const introWordClass = (p: WordPhase) =>
    p === "in" ? "os-word--in" : p === "out" ? "os-word--out" : "os-word--hold";

  const vis = (i: number) => shown.has(i);

  const isExiting = intro.stage === "exit";
  const isDone = intro.stage === "done";

  return (
    <div className="os-root os-root--black">
      {/* ── Persistent header ── */}
      <Header
        copy={copy}
        locale={initialLocale}
        visible={isDone}
        onNav={scrollToSection}
      />

      {/* Intro, always in DOM, fades out via CSS */}
      <div
        className={`os-word-intro${isExiting ? " os-word-intro--exit" : ""}${isDone ? " os-word-intro--gone" : ""}${intro.skipped ? " os-word-intro--instant" : ""}`}
        aria-hidden="true"
      >
        {!isDone && (
          <div className="os-word-clip">
            {intro.stage === "words" && (
              <span
                key={intro.wordIdx}
                className={`os-word ${introWordClass(intro.wordPhase)}`}
              >
                {copy.introWords[intro.wordIdx]}
              </span>
            )}
            {(intro.stage === "social-in" ||
              intro.stage === "social-type" ||
              intro.stage === "social-hold" ||
              isExiting) && (
              <span
                className={`os-word ${intro.stage === "social-in" ? "os-word--in" : "os-word--hold"}`}
              >
                {intro.openChars > 0 && (
                  <span className="os-open-prefix">
                    {copy.openText.slice(0, intro.openChars)}
                  </span>
                )}
                {intro.stage === "social-type" && (
                  <span className="os-type-cursor" aria-hidden="true" />
                )}
                Social.
              </span>
            )}
          </div>
        )}
      </div>

      {/* Manifesto, always in DOM, cross-fades in during exit */}
      <div
        className={`mf-layer${isExiting || isDone ? " mf-layer--visible" : ""}${intro.skipped ? " mf-layer--instant" : ""}`}
      >
        <AmbientBackground />
        {/* Down hint, all sections except last */}
        <ScrollHint
          key={`down-${landing.activeSection}`}
          visible={vis(landing.activeSection) && landing.activeSection < 11}
          label={copy.scrollBackToTop}
        />
        {/* Up hint, last section only, scrolls back to top */}
        <ScrollHint
          key="up"
          up
          visible={landing.activeSection === 11}
          label={copy.scrollBackToTop}
          onClick={() => scrollToSection(0)}
        />
        <ScrollDots active={landing.activeSection} total={12} />

        <div className="mf-page" ref={pageRef} onScroll={handleScroll}>
          {/* S1, Identity anchor · rise: gentle fade-up */}
          <Section idx={0} active={vis(0)} variant="rise">
            <h1 className="mf-brand">{copy.brand}</h1>
            <p className="mf-tagline mf-delay-1">{copy.tagline}</p>
          </Section>

          {/* S2, Sharp break · scale: springs in from small */}
          <Section idx={1} active={vis(1)} variant="scale">
            <AnimText as="h2" className="mf-h1" text={copy.sections.passive} />
          </Section>

          {/* S3, Expanded critique · type: stamps in with no motion */}
          <Section idx={2} active={vis(2)} variant="type">
            <Lines className="mf-lines--fragments">
              <p className="mf-line">{copy.sections.fragments[0]}</p>
              <p className="mf-line">{copy.sections.fragments[1]}</p>
              <p className="mf-spacer" aria-hidden="true" />
              <p className="mf-line">{copy.sections.fragments[2]}</p>
              <p className="mf-line">{copy.sections.fragments[3]}</p>
              <p className="mf-spacer" aria-hidden="true" />
              <p className="mf-line">{copy.sections.fragments[4]}</p>
              <p className="mf-line">{copy.sections.fragments[5]}</p>
            </Lines>
          </Section>

          {/* S4, Reflection · focus: sharpens out of heavy blur */}
          <Section idx={3} active={vis(3)} variant="focus">
            <AnimText
              as="h2"
              className="mf-h1"
              text={copy.sections.connectTitle}
            />
            <Lines>
              <p className="mf-support">{copy.sections.connectSupport[0]}</p>
              <p className="mf-support">{copy.sections.connectSupport[1]}</p>
            </Lines>
          </Section>

          {/* S5, Shift · tempo: each word drops fast with spring */}
          <Section idx={4} active={vis(4)} variant="tempo">
            <AnimText
              as="h2"
              className="mf-h1"
              text={copy.sections.shiftTitle}
            />
          </Section>

          {/* S6, Clarification · strike: lines wipe in from left */}
          <Section idx={5} active={vis(5)} variant="strike">
            <Lines>
              <p className="mf-line mf-line--dim">
                {copy.sections.notLines[0]}
              </p>
              <p className="mf-line mf-line--dim">
                {copy.sections.notLines[1]}
              </p>
              <p className="mf-line mf-line--dim">
                {copy.sections.notLines[2]}
              </p>
            </Lines>
            <AnimText
              as="h2"
              className="mf-h1 mf-h1--intent"
              text={copy.sections.intent}
              baseDelay={400}
            />
          </Section>

          {/* S7, Intent examples · type: stamps in like real searches */}
          <Section idx={6} active={vis(6)} variant="type">
            <Lines className="mf-lines--loose">
              <p className="mf-line mf-line--dim">
                &ldquo;{copy.sections.examples[0]}&rdquo;
              </p>
              <p className="mf-line mf-line--dim">
                &ldquo;{copy.sections.examples[1]}&rdquo;
              </p>
              <p className="mf-line mf-line--dim">
                &ldquo;{copy.sections.examples[2]}&rdquo;
              </p>
            </Lines>
            <AnimText
              as="h2"
              className="mf-h1 mf-delay-3"
              text={copy.sections.intentAgain}
              baseDelay={520}
            />
          </Section>

          {/* S8, Reframing · tempo: lines snap down with spring */}
          <Section idx={7} active={vis(7)} variant="tempo">
            <Lines className="mf-lines--loose">
              <p className="mf-line">{copy.sections.startLines[0]}</p>
              <p className="mf-line">{copy.sections.startLines[1]}</p>
              <p className="mf-line">{copy.sections.startLines[2]}</p>
              <p className="mf-line mf-line--bright">
                {copy.sections.startLines[3]}
              </p>
            </Lines>
          </Section>

          {/* S9, Mental model · scale: springs in */}
          <Section idx={8} active={vis(8)} variant="scale">
            <AnimText
              as="h2"
              className="mf-h1"
              text={copy.sections.describeTitle}
            />
            <Lines>
              <p className="mf-support">{copy.sections.insteadOfResults}</p>
              <p className="mf-support mf-support--bright">
                {copy.sections.people}
              </p>
            </Lines>
          </Section>

          {/* S10, Reassurance · focus: dissolves into clarity */}
          <Section idx={9} active={vis(9)} variant="focus">
            <AnimText
              as="h2"
              className="mf-h1"
              text={copy.sections.readyTitle}
            />
            <Lines>
              <p className="mf-support">{copy.sections.readySupport[0]}</p>
              <p className="mf-support">{copy.sections.readySupport[1]}</p>
            </Lines>
          </Section>

          {/* S11, Ownership · impact: single hit, strong spring */}
          <Section idx={10} active={vis(10)} variant="impact">
            <AnimText
              as="h2"
              className="mf-h1"
              text={copy.sections.yoursTitle}
            />
          </Section>

          {/* S12, Final CTA */}
          <FinalCTA active={vis(11)} copy={copy.finalCta} />
        </div>
      </div>
    </div>
  );
}
