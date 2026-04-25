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

function AmbientBackground({ activeSection }: { activeSection: number }) {
  return (
    <div className="mf-bg" aria-hidden="true">
      <WebGLAgenticField activeSection={activeSection} />
      <div className="mf-bg-purple" />
      <div className="mf-bg-blue" />
      <div className="mf-bg-cyan" />
      <div className="mf-bg-vignette" />
      <div className="mf-bg-noise" />
    </div>
  );
}

type AgenticMode =
  | "radar"
  | "threads"
  | "graph"
  | "decision"
  | "pulse"
  | "labels";

const AGENTIC_MODES: AgenticMode[] = [
  "radar",
  "threads",
  "graph",
  "decision",
  "pulse",
  "labels",
];

const FIELD_LABELS = ["intent", "match", "context", "trust", "meet"];

function WebGLAgenticField({ activeSection }: { activeSection: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sectionRef = useRef(activeSection);

  useEffect(() => {
    sectionRef.current = activeSection;
  }, [activeSection]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const isCompactViewport = window.innerWidth < 720;
    const isLowerPowerDevice =
      typeof navigator.hardwareConcurrency === "number" &&
      navigator.hardwareConcurrency <= 4;

    if (motionQuery.matches || isCompactViewport || isLowerPowerDevice) {
      return;
    }

    let cancelled = false;
    let cleanup = () => {};

    const start = async () => {
      const { Geometry, Mesh, Program, Renderer } = await import("ogl");
      if (cancelled) return;

      const renderer = new Renderer({
        canvas,
        alpha: true,
        antialias: true,
        depth: false,
        dpr: Math.min(window.devicePixelRatio || 1, 1.75),
        premultipliedAlpha: true,
        powerPreference: "high-performance",
      });
      const gl = renderer.gl;
      gl.clearColor(0, 0, 0, 0);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE);

      let width = 1;
      let height = 1;
      let time = 0;
      let animationId = 0;
      const count = 96;
      const positions = new Float32Array(count * 2);
      const depths = new Float32Array(count);
      const sizes = new Float32Array(count);
      const seeds = new Float32Array(count);
      const velocities = new Float32Array(count * 2);
      const pointer = { x: -1, y: -1, tx: -1, ty: -1 };
      let paused = document.visibilityState === "hidden";

      for (let index = 0; index < count; index++) {
        positions[index * 2] = 0;
        positions[index * 2 + 1] = 0;
        depths[index] = 0.42 + ((index * 19) % 58) / 100;
        sizes[index] = 0.64 + (index % 7) * 0.09;
        seeds[index] = index * 0.618;
      }

      const geometry = new Geometry(gl, {
        position: { data: positions, size: 2 },
        depth: { data: depths, size: 1 },
        size: { data: sizes, size: 1 },
        seed: { data: seeds, size: 1 },
      });

      const program = new Program(gl, {
        vertex: `
          attribute vec2 position;
          attribute float depth;
          attribute float size;
          attribute float seed;

          uniform vec2 uResolution;
          uniform float uDpr;
          uniform float uTime;

          varying float vDepth;
          varying float vSeed;

          void main() {
            vec2 clip = (position / uResolution) * 2.0 - 1.0;
            gl_Position = vec4(clip.x, -clip.y, 0.0, 1.0);
            gl_PointSize = (size * (7.0 + depth * 8.0) + sin(uTime * 1.7 + seed) * 0.55) * uDpr;
            vDepth = depth;
            vSeed = seed;
          }
        `,
        fragment: `
          precision highp float;

          varying float vDepth;
          varying float vSeed;

          void main() {
            vec2 uv = gl_PointCoord - 0.5;
            float dist = length(uv);
            float halo = smoothstep(0.5, 0.03, dist);
            float core = smoothstep(0.18, 0.0, dist);
            float shimmer = 0.88 + sin(vSeed * 5.0) * 0.08;
            float alpha = (halo * 0.08 + core * 0.34) * (0.52 + vDepth * 0.62) * shimmer;
            vec3 color = mix(vec3(0.78, 0.80, 0.82), vec3(1.0), core);
            gl_FragColor = vec4(color, alpha);
          }
        `,
        depthTest: false,
        depthWrite: false,
        transparent: true,
      });

      const mesh = new Mesh(gl, {
        geometry,
        mode: gl.POINTS,
        program,
      });

      const targetFor = (index: number, mode: AgenticMode) => {
        const group = index % 5;
        const seed = seeds[index];
        const depth = depths[index];
        const progress = index / Math.max(count - 1, 1);
        const centerX = width * 0.5;
        const centerY = height * 0.52;
        const drift = Math.sin(seed + time * (0.28 + depth * 0.08));

        if (mode === "radar") {
          const lane = index % 7;
          const x = width * (0.2 + progress * 0.52);
          const funnel = 1 - progress;
          return [
            x + Math.sin(time * 0.5 + seed) * 12 * depth,
            centerY +
              (lane - 3) * 18 * funnel +
              Math.sin(progress * Math.PI * 2 + time) * 20 * progress,
          ];
        }

        if (mode === "threads") {
          const t = (index % 32) / 31;
          const bridge = Math.sin(t * Math.PI);
          const lane = Math.floor(index / 32) % 3;
          return [
            width * (0.28 + t * 0.44) + drift * 10,
            centerY +
              Math.cos(t * Math.PI) * 82 +
              bridge * (lane - 1) * 34 +
              Math.sin(time * 0.36 + seed) * 8,
          ];
        }

        if (mode === "graph") {
          const cell = group / 5;
          const local = (Math.floor(index / 5) % 18) / 18;
          const orbit = cell * Math.PI * 2 + time * 0.12;
          const cellX = centerX + Math.cos(orbit) * width * 0.16;
          const cellY = centerY + Math.sin(orbit * 1.25) * height * 0.11;
          const angle = local * Math.PI * 2 + time * (0.1 + depth * 0.08);
          return [
            cellX + Math.cos(angle) * (20 + depth * 24),
            cellY + Math.sin(angle * 1.3) * (12 + depth * 18),
          ];
        }

        if (mode === "decision") {
          const t = progress;
          const branch = group - 2;
          const chosen = group === 2 ? 1 : 0;
          const bend = Math.sin(t * Math.PI);
          return [
            width * (0.22 + t * 0.56) + drift * 8,
            centerY +
              branch * 34 * bend * (1 - chosen * 0.65) +
              Math.sin(time * 0.32 + seed) * 7,
          ];
        }

        if (mode === "pulse") {
          const t = (progress + time * 0.06) % 1;
          const wave = Math.sin(t * Math.PI);
          const angle = seed * 8 + wave * 0.35;
          return [
            centerX +
              Math.cos(angle) * (40 + t * Math.min(width, height) * 0.18),
            centerY +
              Math.sin(angle) * (24 + t * Math.min(width, height) * 0.09) +
              wave * 18,
          ];
        }

        const t = progress;
        const row = group - 2;
        const settle = Math.sin(t * Math.PI);
        return [
          width * (0.24 + t * 0.52),
          centerY + row * 16 * (1 - settle) + Math.sin(seed + time * 0.2) * 5,
        ];
      };

      const resize = () => {
        width = window.innerWidth;
        height = window.innerHeight;
        renderer.setSize(width, height);
        program.uniforms.uResolution.value = [width, height];
        program.uniforms.uDpr.value = renderer.dpr;
        for (let index = 0; index < count; index++) {
          const [x, y] = targetFor(
            index,
            AGENTIC_MODES[sectionRef.current % AGENTIC_MODES.length],
          );
          positions[index * 2] = x;
          positions[index * 2 + 1] = y;
          velocities[index * 2] = 0;
          velocities[index * 2 + 1] = 0;
        }
        geometry.attributes.position.needsUpdate = true;
      };

      program.uniforms = {
        uResolution: { value: [width, height] },
        uDpr: { value: renderer.dpr },
        uTime: { value: 0 },
      };

      const onPointerMove = (event: PointerEvent) => {
        pointer.tx = event.clientX / Math.max(width, 1);
        pointer.ty = event.clientY / Math.max(height, 1);
      };

      const onVisibilityChange = () => {
        paused = document.visibilityState === "hidden";
        if (!paused && animationId === 0) {
          animationId = window.requestAnimationFrame(draw);
        }
      };

      const draw = () => {
        animationId = 0;
        if (paused) {
          return;
        }

        const mode = AGENTIC_MODES[sectionRef.current % AGENTIC_MODES.length];
        pointer.x += (pointer.tx - pointer.x) * 0.16;
        pointer.y += (pointer.ty - pointer.y) * 0.16;
        time += 0.008;
        const hasPointer = pointer.x >= 0 && pointer.y >= 0;
        const cursorX = pointer.x * width;
        const cursorY = pointer.y * height;

        for (let index = 0; index < count; index++) {
          const offset = index * 2;
          const [targetX, targetY] = targetFor(index, mode);
          let forceX = (targetX - positions[offset]) * 0.026 * depths[index];
          let forceY =
            (targetY - positions[offset + 1]) * 0.026 * depths[index];

          if (hasPointer) {
            const dx = positions[offset] - cursorX;
            const dy = positions[offset + 1] - cursorY;
            const distance = Math.sqrt(dx * dx + dy * dy);
            const spread = Math.max(0, 1 - distance / 150);
            forceX += (dx / Math.max(distance, 1)) * spread * spread * 1.5;
            forceY += (dy / Math.max(distance, 1)) * spread * spread * 1.5;
          }

          velocities[offset] = (velocities[offset] + forceX) * 0.64;
          velocities[offset + 1] = (velocities[offset + 1] + forceY) * 0.64;
          positions[offset] += velocities[offset];
          positions[offset + 1] += velocities[offset + 1];
        }

        geometry.attributes.position.needsUpdate = true;
        program.uniforms.uTime.value = time;
        renderer.render({
          scene: mesh,
          clear: true,
          sort: false,
          frustumCull: false,
        });

        animationId = window.requestAnimationFrame(draw);
      };

      resize();
      animationId = window.requestAnimationFrame(draw);
      window.addEventListener("resize", resize);
      window.addEventListener("pointermove", onPointerMove, { passive: true });
      document.addEventListener("visibilitychange", onVisibilityChange);

      cleanup = () => {
        window.removeEventListener("resize", resize);
        window.removeEventListener("pointermove", onPointerMove);
        document.removeEventListener("visibilitychange", onVisibilityChange);
        window.cancelAnimationFrame(animationId);
        geometry.remove();
        program.remove();
      };
    };

    void start().catch(() => {
      cleanup();
    });

    return () => {
      cancelled = true;
      cleanup();
    };
  }, []);

  return <canvas className="mf-agentic-field" ref={canvasRef} />;
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
          <p
            aria-live="polite"
            className={`mf-form-message${
              status === "error" ? " mf-form-message--error" : ""
            }`}
            role={status === "error" ? "alert" : undefined}
          >
            {status === "error" && msg ? msg : "\u00A0"}
          </p>
          {status !== "success" ? (
            <p className="mf-legal-note">
              {copy.consentPrefix} <Link href="/terms">{copy.terms}</Link>{" "}
              {copy.consentJoin} <Link href="/privacy">{copy.privacy}</Link>.
            </p>
          ) : null}
        </form>

        <div className="mf-footer-note mf-delay-2">
          <span>{copy.footer}</span>
          <nav aria-label="Legal pages" className="mf-footer-links">
            <Link href="/privacy">Privacy</Link>
            <Link href="/terms">Terms</Link>
            <Link href="/security">Security</Link>
          </nav>
        </div>
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
        <AmbientBackground activeSection={landing.activeSection} />
        {/* Down hint, all sections except last */}
        <ScrollHint
          key={`down-${landing.activeSection}`}
          visible={vis(landing.activeSection) && landing.activeSection < 12}
          label={copy.scrollBackToTop}
        />
        {/* Up hint, last section only, scrolls back to top */}
        <ScrollHint
          key="up"
          up
          visible={landing.activeSection === 12}
          label={copy.scrollBackToTop}
          onClick={() => scrollToSection(0)}
        />
        <ScrollDots active={landing.activeSection} total={13} />

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

          {/* S12, Manifesto invitation */}
          <Section idx={11} active={vis(11)} variant="focus">
            <AnimText
              as="h2"
              className="mf-h1"
              text={copy.sections.manifestoTitle}
            />
            <Lines>
              <p className="mf-support mf-support--manifesto">
                {copy.sections.manifestoSupport}
              </p>
              <Link className="mf-manifesto-link" href="/manifesto">
                {copy.sections.manifestoCta}
              </Link>
            </Lines>
          </Section>

          {/* S13, Final CTA */}
          <FinalCTA active={vis(12)} copy={copy.finalCta} />
        </div>
      </div>
    </div>
  );
}
