import Layout from "@theme/Layout";
import Link from "@docusaurus/Link";
import useDocusaurusContext from "@docusaurus/useDocusaurusContext";

const quickLinks = [
  {
    label: "Concepts",
    to: "/docs/examples/protocol-overview-and-exclusions",
  },
  {
    label: "Auth",
    to: "/docs/examples/protocol-app-registration-and-tokens",
  },
  {
    label: "Dispatch",
    to: "/docs/examples/protocol-external-actions-reference",
  },
  {
    label: "Webhooks",
    to: "/docs/examples/protocol-event-subscriptions-and-replay",
  },
  {
    label: "Agents",
    to: "/docs/examples/protocol-agent-quickstart",
  },
  {
    label: "Recovery",
    to: "/docs/examples/protocol-operator-recovery",
  },
];

const sections = [
  {
    title: "Concepts",
    description:
      "Learn the coordination-first model, exclusions, discovery flow, and how apps fit into the protocol before writing code.",
    links: [
      {
        label: "Protocol overview",
        to: "/docs/examples/protocol-overview-and-exclusions",
      },
      {
        label: "Manifest + discovery",
        to: "/docs/examples/protocol-manifest-and-discovery",
      },
      {
        label: "Versioning + compatibility",
        to: "/docs/examples/protocol-versioning-and-compatibility",
      },
    ],
  },
  {
    title: "Build + Connect",
    description:
      "Register an app, authenticate, send stable actions, and consume webhooks and replay without touching internal systems.",
    links: [
      {
        label: "Partner quickstart",
        to: "/docs/examples/protocol-partner-quickstart",
      },
      {
        label: "App registration + tokens",
        to: "/docs/examples/protocol-app-registration-and-tokens",
      },
      {
        label: "External actions",
        to: "/docs/examples/protocol-external-actions-reference",
      },
    ],
  },
  {
    title: "Operate + Recover",
    description:
      "Run webhook consumers safely, reason about replay, and add agent integrations on top of the stable protocol boundary.",
    links: [
      {
        label: "Webhooks + replay",
        to: "/docs/examples/protocol-event-subscriptions-and-replay",
      },
      {
        label: "Webhook consumer",
        to: "/docs/examples/protocol-webhook-consumer",
      },
      {
        label: "Agent quickstart",
        to: "/docs/examples/protocol-agent-quickstart",
      },
    ],
  },
];

const highlights = [
  {
    title: "Read state",
    body: "Use manifest, discovery, and typed client helpers to understand the contract before sending traffic.",
  },
  {
    title: "Connect safely",
    body: "Register apps, store tokens, request consent, and use scoped access instead of private backend access.",
  },
  {
    title: "Dispatch actions",
    body: "Call stable coordination primitives for intents, requests, chats, and circles through a typed protocol surface.",
  },
  {
    title: "Operate with recovery",
    body: "Handle webhook delivery, replay, dead-letter recovery, and agent readiness from day one.",
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
          <span className="os-eyebrow">Developer Platform</span>
          <h1>{siteConfig.title}</h1>
          <p>{siteConfig.tagline}</p>
          <div className="os-inline-links">
            {quickLinks.map((link) => (
              <Link key={link.to} className="os-chip" to={link.to}>
                {link.label}
              </Link>
            ))}
          </div>
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
        <section className="os-lead-grid">
          <div className="os-lead-card os-lead-card--dark">
            <span className="os-card-label">Suggested path</span>
            <ol className="os-path-list">
              <li>Read the protocol concepts.</li>
              <li>Bootstrap from manifest and discovery.</li>
              <li>Register your app and store the token.</li>
              <li>Choose direct actions, webhooks, or agents.</li>
              <li>Use replay and recovery when operating live traffic.</li>
            </ol>
          </div>
          <div className="os-lead-card">
            <span className="os-card-label">What is published here</span>
            <div className="os-code-block">
              <code>
                concepts
                <br />
                auth
                <br />
                connect
                <br />
                dispatch
                <br />
                webhooks
                <br />
                sdk helpers
                <br />
                agents
                <br />
                recovery
              </code>
            </div>
          </div>
        </section>
        <section className="os-highlights">
          {highlights.map((highlight) => (
            <article key={highlight.title} className="os-highlight">
              <h2>{highlight.title}</h2>
              <p>{highlight.body}</p>
            </article>
          ))}
        </section>
        <div className="os-grid">
          {sections.map((section) => (
            <SectionCard key={section.title} {...section} />
          ))}
        </div>
      </main>
    </Layout>
  );
}
