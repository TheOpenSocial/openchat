import Layout from "@theme/Layout";
import Link from "@docusaurus/Link";
import useDocusaurusContext from "@docusaurus/useDocusaurusContext";

const navGroups = [
  {
    label: "Get started",
    items: [
      { label: "Overview", to: "/docs" },
      { label: "Quickstart", to: "/docs/examples/protocol-partner-quickstart" },
      { label: "Manifest and discovery", to: "/docs/examples/protocol-manifest-and-discovery" },
      { label: "App registration", to: "/docs/examples/protocol-app-registration-and-tokens" },
    ],
  },
  {
    label: "Concepts",
    items: [
      { label: "What OpenSocial is", to: "/docs/examples/protocol-vision-and-purpose" },
      { label: "Protocol model", to: "/docs/examples/protocol-core-concepts" },
      { label: "What is not included", to: "/docs/examples/protocol-overview-and-exclusions" },
    ],
  },
  {
    label: "Build",
    items: [
      { label: "Actions reference", to: "/docs/examples/protocol-external-actions-reference" },
      { label: "Webhooks", to: "/docs/examples/protocol-event-subscriptions-and-replay" },
      { label: "Webhook consumer", to: "/docs/examples/protocol-webhook-consumer" },
      { label: "Auth troubleshooting", to: "/docs/examples/protocol-consent-and-auth-troubleshooting" },
    ],
  },
  {
    label: "Agents SDK",
    items: [
      { label: "Integration paths", to: "/docs/examples/protocol-agent-integration-paths" },
      { label: "Quickstart", to: "/docs/examples/protocol-agent-quickstart" },
      { label: "Readiness", to: "/docs/examples/protocol-agent-readiness" },
      { label: "Toolset", to: "/docs/examples/protocol-agent-toolset" },
    ],
  },
];

const useCases = [
  {
    title: "Intent-based matching",
    body: "Create and update intents, request introductions, and respond with stable coordination actions.",
  },
  {
    title: "Delegated assistants",
    body: "Let an app or agent act for a user only after explicit consent, scoped access, and clear capability grants.",
  },
  {
    title: "Event-driven integrations",
    body: "Subscribe to protocol events, verify webhook signatures, and keep your product in sync as activity happens.",
  },
];

const gettingStarted = [
  {
    title: "Understand the model",
    body: "Start with the concepts and exclusions so your integration maps to the right layer.",
    to: "/docs/examples/protocol-vision-and-purpose",
  },
  {
    title: "Connect safely",
    body: "Read manifest and discovery, register an app, and store credentials correctly.",
    to: "/docs/examples/protocol-app-registration-and-tokens",
  },
  {
    title: "Dispatch and consume",
    body: "Call supported actions, receive events, and add recovery only where you need it.",
    to: "/docs/examples/protocol-external-actions-reference",
  },
];

const resources = [
  {
    title: "SDK index",
    body: "The shortest path through the public docs.",
    to: "/docs/examples/protocol-sdk-index",
  },
  {
    title: "Examples",
    body: "Concrete onboarding, actions, webhook, and agent examples.",
    to: "/docs/examples/protocol-partner-quickstart",
  },
  {
    title: "Production",
    body: "Readiness, compatibility, and delivery recovery guidance.",
    to: "/docs/examples/protocol-production-readiness-checklist",
  },
];

function NavGroup({ group }) {
  return (
    <section className="os-overview-nav-group">
      <div className="os-overview-nav-label">{group.label}</div>
      <div className="os-overview-nav-items">
        {group.items.map((item, index) => (
          <Link
            key={item.to}
            className={`os-overview-nav-link${index === 0 && group.label === "Get started" ? " os-overview-nav-link--active" : ""}`}
            to={item.to}
          >
            {item.label}
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
      description="OpenSocial SDK docs for apps, integrations, and agents"
    >
      <main className="os-overview-shell">
        <aside className="os-overview-sidebar">
          {navGroups.map((group) => (
            <NavGroup key={group.label} group={group} />
          ))}
        </aside>

        <section className="os-overview-main">
          <header className="os-overview-header">
            <div className="os-overview-kicker">Overview</div>
            <h1>Intent-first social coordination for apps and agents.</h1>
            <p>
              OpenSocial is a protocol for systems that help people express
              intent, receive introductions, start conversations, and form
              recurring groups. Use the SDK when you need a stable contract for
              authentication, delegated access, actions, and events.
            </p>
          </header>

          <section className="os-quickstart-card">
            <div className="os-quickstart-copy">
              <div className="os-section-label">Quickstart</div>
              <h2>Read the contract, register an app, and start integrating.</h2>
              <p>
                Start with the protocol model, connect through manifest and
                discovery, and then build with the documented SDK surface.
              </p>
              <div className="os-links">
                <Link className="button button--primary button--lg" to="/docs/examples/protocol-partner-quickstart">
                  Get started
                </Link>
                <Link className="button button--secondary button--lg" to="/docs/examples/protocol-sdk-index">
                  Browse docs
                </Link>
              </div>
            </div>

            <div className="os-snippet">
              <div className="os-snippet-header">
                <span>typescript</span>
                <span>SDK</span>
              </div>
              <pre>
                <code>{`import { createProtocolClientFromBaseUrl } from "@opensocial/protocol-client";

const client = createProtocolClientFromBaseUrl("https://api.opensocial.so/api");

const manifest = await client.getManifest();
const discovery = await client.getDiscovery();`}</code>
              </pre>
            </div>
          </section>

          <section className="os-overview-section">
            <div className="os-section-heading">
              <h2>Use cases</h2>
              <p>Common ways to build on OpenSocial.</p>
            </div>
            <div className="os-card-grid">
              {useCases.map((item) => (
                <article key={item.title} className="os-simple-card">
                  <h3>{item.title}</h3>
                  <p>{item.body}</p>
                </article>
              ))}
            </div>
          </section>

          <section className="os-overview-section">
            <div className="os-section-heading">
              <h2>Start building</h2>
              <p>Follow this order if you are integrating for the first time.</p>
            </div>
            <div className="os-card-grid">
              {gettingStarted.map((item) => (
                <Link key={item.to} className="os-simple-card os-simple-card--link" to={item.to}>
                  <h3>{item.title}</h3>
                  <p>{item.body}</p>
                </Link>
              ))}
            </div>
          </section>

          <section className="os-overview-section">
            <div className="os-section-heading">
              <h2>Resources</h2>
              <p>Use these guides to move from concept to production.</p>
            </div>
            <div className="os-card-grid">
              {resources.map((item) => (
                <Link key={item.to} className="os-simple-card os-simple-card--link" to={item.to}>
                  <h3>{item.title}</h3>
                  <p>{item.body}</p>
                </Link>
              ))}
            </div>
          </section>
        </section>
      </main>
    </Layout>
  );
}
