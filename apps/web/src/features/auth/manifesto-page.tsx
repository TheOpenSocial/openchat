import Link from "next/link";

import {
  publicCopy,
  manifestoSections,
  type PublicLocale,
} from "./public-locale";
import { PublicLocaleSwitcher } from "./public-locale-switcher";
import { ManifestoThemeToggle } from "./manifesto-theme-toggle";
export function ManifestoPage({
  initialLocale = "en",
  initialTheme = "dark",
}: {
  initialLocale?: PublicLocale;
  initialTheme?: "light" | "dark";
}) {
  const copy = publicCopy[initialLocale].manifesto;
  const sections = manifestoSections[initialLocale];
  return (
    <main
      className="manifesto-page"
      data-theme={initialTheme}
      id="manifesto-root"
      lang={initialLocale}
    >
      <div className="manifesto-shell">
        <header className="manifesto-nav manifesto-motion-reveal manifesto-motion-reveal--0">
          <Link className="manifesto-brand" href="/">
            <svg
              viewBox="0 0 1024 1024"
              aria-hidden="true"
              className="manifesto-brand-mark"
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
            <span>OpenSocial</span>
          </Link>

          <div className="manifesto-nav-actions">
            <PublicLocaleSwitcher locale={initialLocale} />
            <ManifestoThemeToggle />
            <Link className="manifesto-nav-link" href="/waitlist">
              {copy.joinWaitlist}
            </Link>
          </div>
        </header>

        <div className="manifesto-reading">
          <section className="manifesto-hero">
            <p className="manifesto-kicker manifesto-motion-reveal manifesto-motion-reveal--1">
              {copy.title}
            </p>
            <h1 className="manifesto-title manifesto-motion-reveal manifesto-motion-reveal--2">
              {copy.heroTitle}
            </h1>
            <p className="manifesto-lede manifesto-motion-reveal manifesto-motion-reveal--3">
              {copy.heroLede}
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
        </div>
      </div>
    </main>
  );
}
