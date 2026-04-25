import Link from "next/link";

type LegalSection = {
  title: string;
  paragraphs: string[];
};

const legalLinks = [
  { href: "/privacy", label: "Privacy" },
  { href: "/terms", label: "Terms" },
  { href: "/security", label: "Security" },
  { href: "/waitlist", label: "Waitlist" },
] as const;

export function LegalPage({
  activePath,
  eyebrow,
  title,
  lede,
  sections,
}: {
  activePath: string;
  eyebrow: string;
  title: string;
  lede: string;
  sections: LegalSection[];
}) {
  return (
    <main className="legal-page" lang="en">
      <div className="legal-shell">
        <header className="legal-nav">
          <Link className="legal-brand" href="/">
            <svg
              aria-hidden="true"
              className="legal-brand-mark"
              viewBox="0 0 1024 1024"
            >
              <path
                d="M512 309A228 228 0 0 0 512 755A228 228 0 0 0 512 309Z"
                fill="currentColor"
              />
              <circle
                cx="407"
                cy="532"
                fill="none"
                r="228"
                stroke="currentColor"
                strokeWidth="42"
              />
              <circle
                cx="617"
                cy="532"
                fill="none"
                r="228"
                stroke="currentColor"
                strokeWidth="42"
              />
            </svg>
            <span>OpenSocial</span>
          </Link>
          <nav aria-label="Legal pages" className="legal-links">
            {legalLinks.map((link) => (
              <Link
                aria-current={activePath === link.href ? "page" : undefined}
                href={link.href}
                key={link.href}
              >
                {link.label}
              </Link>
            ))}
          </nav>
        </header>

        <section className="legal-hero">
          <p className="legal-eyebrow">{eyebrow}</p>
          <h1>{title}</h1>
          <p>{lede}</p>
        </section>

        <section className="legal-content">
          {sections.map((section) => (
            <section className="legal-section" key={section.title}>
              <h2>{section.title}</h2>
              <div className="legal-section-copy">
                {section.paragraphs.map((paragraph) => (
                  <p key={paragraph}>{paragraph}</p>
                ))}
              </div>
            </section>
          ))}
        </section>

        <footer className="legal-footer">
          <span>© 2026 OpenSocial</span>
          <span>Effective April 25, 2026.</span>
        </footer>
      </div>
    </main>
  );
}
