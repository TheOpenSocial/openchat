import Layout from "@theme/Layout";
import Link from "@docusaurus/Link";
import useDocusaurusContext from "@docusaurus/useDocusaurusContext";

const sections = [
  {
    title: "Start Here",
    description:
      "The shortest path for a third-party system that wants to understand the protocol, bootstrap correctly, and make its first integration call.",
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
        label: "Manifest + discovery",
        to: "/docs/examples/protocol-manifest-and-discovery",
      },
    ],
  },
  {
    title: "Core Integration",
    description:
      "Everything a partner app or service needs to authenticate, call stable actions, and subscribe to protocol events.",
    links: [
      {
        label: "External actions",
        to: "/docs/examples/protocol-external-actions-reference",
      },
      {
        label: "Webhooks + replay",
        to: "/docs/examples/protocol-event-subscriptions-and-replay",
      },
      {
        label: "App registration + tokens",
        to: "/docs/examples/protocol-app-registration-and-tokens",
      },
    ],
  },
  {
    title: "Agent Integrations",
    description:
      "Use the thin agent layer, readiness checks, and toolset helpers when you want agents to act through the protocol safely.",
    links: [
      {
        label: "Agent integration paths",
        to: "/docs/examples/protocol-agent-integration-paths",
      },
      {
        label: "Agent quickstart",
        to: "/docs/examples/protocol-agent-quickstart",
      },
      {
        label: "Agent toolset",
        to: "/docs/examples/protocol-agent-toolset",
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
      description="OpenSocial protocol SDK and third-party integration documentation"
    >
      <main className="os-home">
        <header className="os-hero">
          <span className="os-eyebrow">Documentation</span>
          <h1>{siteConfig.title}</h1>
          <p>{siteConfig.tagline}</p>
          <div className="os-links">
            <Link className="button button--primary button--lg" to="/docs">
              Open SDK docs
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
