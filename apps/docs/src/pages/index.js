import Layout from "@theme/Layout";
import Link from "@docusaurus/Link";
import useDocusaurusContext from "@docusaurus/useDocusaurusContext";

const quickLinks = [
  { label: "Vision", to: "/docs/examples/protocol-vision-and-purpose" },
  { label: "Concepts", to: "/docs/examples/protocol-core-concepts" },
  { label: "Auth", to: "/docs/examples/protocol-app-registration-and-tokens" },
  { label: "Dispatch", to: "/docs/examples/protocol-external-actions-reference" },
  { label: "Webhooks", to: "/docs/examples/protocol-event-subscriptions-and-replay" },
  { label: "Agents", to: "/docs/examples/protocol-agent-quickstart" },
];

const pillars = [
  {
    title: "Read",
    body: "Start from manifest and discovery. Learn the live contract before you register, ask for scopes, or dispatch traffic.",
    to: "/docs/examples/protocol-manifest-and-discovery",
  },
  {
    title: "Connect",
    body: "Register apps, issue tokens, request consent, and treat delegated access as a first-class protocol concern.",
    to: "/docs/examples/protocol-app-registration-and-tokens",
  },
  {
    title: "Dispatch",
    body: "Use narrow coordination primitives for intents, requests, chats, and circles instead of private backend access.",
    to: "/docs/examples/protocol-external-actions-reference",
  },
  {
    title: "Operate",
    body: "Consume webhooks, replay events, recover dead letters, and keep partner integrations healthy in production.",
    to: "/docs/examples/protocol-operator-recovery",
  },
];

const tracks = [
  {
    title: "Start here",
    description:
      "Understand why the protocol exists, what it excludes, and how the domain maps to the integration surface.",
    links: [
      { label: "Protocol SDK index", to: "/docs/examples/protocol-sdk-index" },
      {
        label: "Vision and purpose",
        to: "/docs/examples/protocol-vision-and-purpose",
      },
      {
        label: "Core concepts",
        to: "/docs/examples/protocol-core-concepts",
      },
    ],
  },
  {
    title: "Ship an integration",
    description:
      "Bootstrap from manifest and discovery, register your app, authenticate, then start dispatching stable actions.",
    links: [
      {
        label: "Read, connect, dispatch, operate",
        to: "/docs/examples/protocol-read-connect-dispatch-operate",
      },
      {
        label: "Partner quickstart",
        to: "/docs/examples/protocol-partner-quickstart",
      },
      {
        label: "Manifest and discovery",
        to: "/docs/examples/protocol-manifest-and-discovery",
      },
      {
        label: "External actions reference",
        to: "/docs/examples/protocol-external-actions-reference",
      },
    ],
  },
  {
    title: "Run in production",
    description:
      "Handle webhooks, replay, recovery, consent, and agent readiness with a narrow operational surface.",
    links: [
      {
        label: "Webhooks and replay",
        to: "/docs/examples/protocol-event-subscriptions-and-replay",
      },
      {
        label: "Operator recovery",
        to: "/docs/examples/protocol-operator-recovery",
      },
      {
        label: "Production readiness checklist",
        to: "/docs/examples/protocol-production-readiness-checklist",
      },
    ],
  },
];

const facts = [
  "Coordination-first, not feed-first",
  "SDK-only public surface",
  "Typed actions and events",
  "Consent and grants built in",
];

function TrackCard({ title, description, links }) {
  return (
    <section className="os-card os-track-card">
      <div className="os-card-kicker">Documentation track</div>
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
      description="OpenSocial developer platform documentation for apps, agents, and partner systems"
    >
      <main className="os-home">
        <header className="os-hero">
          <div className="os-hero-grid">
            <div className="os-hero-copy">
              <span className="os-eyebrow">OpenSocial Developer Platform</span>
              <h1>Build on the coordination layer, not the app internals.</h1>
              <p>
                OpenSocial exposes a protocol-first surface for reading state,
                connecting third-party systems, dispatching coordination actions,
                subscribing to events, and operating agents safely.
              </p>
              <div className="os-inline-links">
                {quickLinks.map((link) => (
                  <Link key={link.to} className="os-chip" to={link.to}>
                    {link.label}
                  </Link>
                ))}
              </div>
              <div className="os-links">
                <Link className="button button--primary button--lg" to="/docs">
                  Explore the docs
                </Link>
                <Link
                  className="button button--secondary button--lg"
                  to="/docs/examples/protocol-partner-quickstart"
                >
                  Start a partner integration
                </Link>
              </div>
            </div>
            <aside className="os-hero-panel">
              <div className="os-card-kicker">Public SDK scope</div>
              <div className="os-code-block os-code-block--hero">
                <code>
                  manifest
                  <br />
                  discovery
                  <br />
                  auth + consent
                  <br />
                  read state
                  <br />
                  dispatch actions
                  <br />
                  webhooks + replay
                  <br />
                  agent wrappers
                </code>
              </div>
              <ul className="os-fact-list">
                {facts.map((fact) => (
                  <li key={fact}>{fact}</li>
                ))}
              </ul>
            </aside>
          </div>
        </header>

        <section className="os-pillar-grid">
          {pillars.map((pillar) => (
            <Link key={pillar.to} className="os-pillar" to={pillar.to}>
              <span className="os-card-kicker">{pillar.title}</span>
              <h2>{pillar.title}</h2>
              <p>{pillar.body}</p>
            </Link>
          ))}
        </section>

        <section className="os-intent-band">
          <div>
            <span className="os-card-kicker">Mental model</span>
            <h2>Use the protocol in this order.</h2>
          </div>
          <ol className="os-sequence">
            <li>Read manifest and discovery.</li>
            <li>Register your app and store the token.</li>
            <li>Request delegated access only when needed.</li>
            <li>Dispatch narrow actions through the SDK.</li>
            <li>Operate with webhooks, replay, and recovery.</li>
          </ol>
        </section>

        <div className="os-grid">
          {tracks.map((track) => (
            <TrackCard key={track.title} {...track} />
          ))}
        </div>
      </main>
    </Layout>
  );
}
