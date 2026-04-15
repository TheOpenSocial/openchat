import Layout from "@theme/Layout";
import Link from "@docusaurus/Link";
import useDocusaurusContext from "@docusaurus/useDocusaurusContext";

const sections = [
  {
    title: "Protocol SDK",
    description:
      "Start with the partner-facing SDK entrypoint, onboarding, and external action references.",
    links: [
      {
        label: "SDK index",
        to: "/docs/examples/protocol-sdk-index",
      },
      {
        label: "Partner quickstart",
        to: "/docs/examples/protocol-partner-quickstart",
      },
      {
        label: "External actions",
        to: "/docs/examples/protocol-external-actions-reference",
      },
    ],
  },
  {
    title: "Product + Backend",
    description:
      "Use the backlog, architecture notes, and backend launch docs to stay aligned with the shipped contract.",
    links: [
      {
        label: "Protocol backlog",
        to: "/docs/protocol-backlog",
      },
      {
        label: "System architecture",
        to: "/docs/05_system_architecture",
      },
      {
        label: "Backend launch ops pack",
        to: "/docs/backend-launch-ops-pack",
      },
    ],
  },
  {
    title: "Manual QA + Staging",
    description:
      "Manual testing, staging sandbox validation, and operational recovery all live here.",
    links: [
      {
        label: "Manual QA script",
        to: "/docs/manual-qa-script",
      },
      {
        label: "Staging sandbox world",
        to: "/docs/staging-sandbox-world",
      },
      {
        label: "Operator recovery",
        to: "/docs/examples/protocol-operator-recovery",
      },
    ],
  },
];

function SectionCard({ title, description, links }) {
  return (
    <section className="os-card">
      <h2>{title}</h2>
      <p>{description}</p>
      <div className="os-links">
        {links.map((link) => (
          <Link key={link.to} className="button button--secondary" to={link.to}>
            {link.label}
          </Link>
        ))}
      </div>
    </section>
  );
}

export default function Home() {
  const { siteConfig } = useDocusaurusContext();

  return (
    <Layout
      title={siteConfig.title}
      description="OpenSocial protocol, product, and operations documentation"
    >
      <main className="os-home">
        <header className="os-hero">
          <span className="os-eyebrow">Documentation</span>
          <h1>{siteConfig.title}</h1>
          <p>{siteConfig.tagline}</p>
          <div className="os-links">
            <Link className="button button--primary button--lg" to="/docs">
              Open docs
            </Link>
            <Link
              className="button button--secondary button--lg"
              to="/docs/examples/protocol-sdk-index"
            >
              Start with protocol SDK
            </Link>
          </div>
        </header>
        <div className="os-grid">
          {sections.map((section) => (
            <SectionCard key={section.title} {...section} />
          ))}
        </div>
      </main>
    </Layout>
  );
}
