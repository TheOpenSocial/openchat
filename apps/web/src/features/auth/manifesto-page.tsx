"use client";

import { Moon, SunMedium } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

const sections = [
  {
    title: "Why We Exist",
    paragraphs: [
      "Social software moved away from helping people connect. It became better at keeping people watching than helping them meet, talk, plan, or do something together.",
      "OpenSocial exists to change that. We are building an intent-first social product where someone can say what they want to do, talk about, organize, or explore, and the system helps turn that intent into a real human connection.",
      "Our goal is simple to describe and hard to do well: reduce the distance between “I want this” and “I am doing this with someone.”",
    ],
  },
  {
    title: "What We Believe Social Should Be",
    paragraphs: [
      "We believe social products should begin with agency. A person should be able to express what they want in their own words, set their own boundaries, and stay in control of how connection happens.",
      "We do not believe the future of social is endless scrolling, passive browsing, or systems that keep people near each other without helping them actually meet.",
      "We believe the better model is intent, consent, and coordination. A user expresses a goal. The system understands it, finds relevant people, explains what is happening, and opens a connection only when the people involved choose it.",
    ],
  },
  {
    title: "The Human Boundary",
    paragraphs: [
      "AI is useful when its role is clear. In OpenSocial, AI can help understand intent, summarize progress, rank possible matches, identify risk, and coordinate the workflow around a social interaction.",
      "AI does not get to pretend to be the user. It does not quietly socialize on their behalf. It does not create false closeness, weaken consent, or replace a real conversation with something synthetic.",
      "That boundary is part of the product, not a marketing line. Once a connection is made, the conversation remains human. The model can help around the edges, but it should not replace the people the product is meant to bring together.",
    ],
  },
  {
    title: "How The Product Works",
    paragraphs: [
      "OpenSocial is built around a small set of clear ideas: intent, request, connection, chat, circle, notification, and agent-assisted workflow. That matters because it keeps the product focused on coordination, not generic social noise.",
      "A user writes what they want. The system interprets the request, finds potential matches, ranks candidates using trust, relevance, timing, and context, and sends explicit opt-in requests. Only after acceptance does a real connection open.",
      "This product is not feed first, not profile first, and not designed to trap the user in browsing. It is coordination first. It should feel fast, concrete, and easy to understand.",
    ],
  },
  {
    title: "What We Want To Achieve",
    paragraphs: [
      "We want to make it normal for software to help people move from desire to participation quickly. Talk about the match now. Find a tennis partner after seven. Meet builders in your city. Form a small poker group tonight. Reconnect with people who are a real fit.",
      "We want to support one-to-one conversations, same-day planning, group formation, passive availability, recurring circles, and relationship continuity over time. The goal is not more content. The goal is more meaningful contact.",
      "We also want to build the public contract for this model: a stable protocol and SDK that lets apps, services, and partner agents participate in an intent-first social network without guessing how the system works.",
    ],
  },
  {
    title: "Why The System Is Built This Way",
    paragraphs: [
      "We are deliberately building reliable infrastructure under the product. That means deterministic application-owned state transitions, append-only audit trails for critical changes, event-driven workflows, and clear operational boundaries.",
      "Our philosophy is straightforward. Agentic behavior can suggest, enrich, and prioritize, but the application owns final writes, policies, and guarantees. Reliable systems matter more than impressive demos.",
      "That is why the architecture starts as a modular monolith with internal event-driven workflows instead of a pile of disconnected services. It gives us faster iteration, easier debugging, and stronger transactional control while the product is still evolving.",
    ],
  },
  {
    title: "The Technologies Behind It",
    paragraphs: [
      "OpenSocial is built in TypeScript across the stack. The backend runs on NestJS with PostgreSQL as the source of truth, pgvector for semantic retrieval, Redis for queues, presence, cache, and rate limits, and BullMQ for durable workflow orchestration.",
      "Realtime behavior runs through WebSockets. Profile media flows through object storage and CDN delivery. Observability is built with OpenTelemetry so the product can be operated as a real system, not just shown as a polished prototype.",
      "On the intelligence layer, we use the OpenAI Responses API and the OpenAI Agents SDK where bounded multi-step orchestration makes sense. The important word is bounded. Planners suggest, tools gather, policies gate, the application decides, workers execute, and the database remains deterministic.",
    ],
  },
  {
    title: "Our Standard",
    paragraphs: [
      "A manifesto is only useful if it shapes the product. Ours does. We are committing to explicit consent, human-first interaction, operational clarity, and product surfaces that explain themselves quickly instead of asking people to learn a new social ritual.",
      "We are not building a generic social graph. We are not building an AI companion app. We are not building a feed with better branding. We are building an intent-driven coordination system for real people, real timing, and real relationships.",
      "This is the work. Build social software that helps people begin, not just watch. Build systems that are powerful without becoming deceptive. Build tools that create presence instead of performance.",
      "That is the direction. That is the product. That is OpenSocial.",
    ],
  },
];

type Theme = "light" | "dark";

export function ManifestoPage() {
  const [theme, setTheme] = useState<Theme>("light");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const stored = window.localStorage.getItem("opensocial-manifesto-theme");
    const nextTheme: Theme =
      stored === "dark" || stored === "light"
        ? stored
        : window.matchMedia("(prefers-color-scheme: dark)").matches
          ? "dark"
          : "light";
    setTheme(nextTheme);
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    window.localStorage.setItem("opensocial-manifesto-theme", theme);
  }, [ready, theme]);

  return (
    <main
      className="manifesto-page"
      data-theme={theme}
      suppressHydrationWarning
    >
      <header className="manifesto-nav">
        <Link className="manifesto-brand" href="/">
          <span className="manifesto-brand-mark" aria-hidden="true" />
          <span>OpenSocial</span>
        </Link>

        <div className="manifesto-nav-actions">
          <button
            aria-label={`Switch to ${theme === "light" ? "dark" : "light"} mode`}
            className="manifesto-theme-toggle"
            onClick={() => setTheme(theme === "light" ? "dark" : "light")}
            type="button"
          >
            {theme === "light" ? (
              <Moon aria-hidden="true" className="manifesto-theme-icon" strokeWidth={1.8} />
            ) : (
              <SunMedium aria-hidden="true" className="manifesto-theme-icon" strokeWidth={1.8} />
            )}
          </button>
          <Link className="manifesto-nav-link" href="/#waitlist">
            Join waitlist
          </Link>
        </div>
      </header>

      <section className="manifesto-hero">
        <p className="manifesto-kicker">Manifesto</p>
        <h1 className="manifesto-title">
          We are building social software that starts with intent.
        </h1>
        <p className="manifesto-lede">
          OpenSocial is an intent-first coordination system for real people. It
          helps someone express what they want, find the right people, and move
          toward genuine human connection with consent, clarity, safety, and
          speed.
        </p>
      </section>

      <section className="manifesto-body">
        {sections.map((section, index) => (
          <section
            className={`manifesto-section${
              index === 0 ? " manifesto-section--first" : ""
            }`}
            key={section.title}
          >
            <div className="manifesto-section-rule" aria-hidden="true" />
            <h2 className="manifesto-section-title">{section.title}</h2>
            <div className="manifesto-section-copy">
              {section.paragraphs.map((paragraph) => (
                <p className="manifesto-paragraph" key={paragraph}>
                  {paragraph}
                </p>
              ))}
            </div>
          </section>
        ))}
      </section>
    </main>
  );
}
