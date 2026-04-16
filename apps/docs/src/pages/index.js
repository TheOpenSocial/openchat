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
    label: "Core concepts",
    items: [
      { label: "Vision and purpose", to: "/docs/examples/protocol-vision-and-purpose" },
      { label: "Protocol model", to: "/docs/examples/protocol-core-concepts" },
      { label: "Exclusions", to: "/docs/examples/protocol-overview-and-exclusions" },
      { label: "Read, connect, dispatch", to: "/docs/examples/protocol-read-connect-dispatch-operate" },
    ],
  },
  {
    label: "Build",
    items: [
      { label: "Actions reference", to: "/docs/examples/protocol-external-actions-reference" },
      { label: "Webhooks and replay", to: "/docs/examples/protocol-event-subscriptions-and-replay" },
      { label: "Webhook consumer", to: "/docs/examples/protocol-webhook-consumer" },
      { label: "Consent and auth", to: "/docs/examples/protocol-consent-and-auth-troubleshooting" },
    ],
  },
  {
    label: "Agents SDK",
    items: [
      { label: "Overview", to: "/docs/examples/protocol-agent-integration-paths" },
      { label: "Quickstart", to: "/docs/examples/protocol-agent-quickstart" },
      { label: "Readiness", to: "/docs/examples/protocol-agent-readiness" },
      { label: "Toolset", to: "/docs/examples/protocol-agent-toolset" },
    ],
  },
];

const buildPaths = [
  {
    title: "Protocol SDK",
    body: "Connect a product or service through the public contract for discovery, auth, delegated access, and action dispatch.",
    to: "/docs/examples/protocol-partner-quickstart",
    cta: "Start with the SDK",
  },
  {
    title: "Events and webhooks",
    body: "Subscribe to OpenSocial events, verify signatures, replay failed deliveries, and keep downstream systems in sync.",
    to: "/docs/examples/protocol-event-subscriptions-and-replay",
    cta: "Start with webhooks",
  },
  {
    title: "Agents SDK",
    body: "Build agentic integrations on top of the same protocol boundary with readiness checks, tool catalogs, and safe dispatch.",
    to: "/docs/examples/protocol-agent-quickstart",
    cta: "Start with agents",
  },
];

const surfaces = [
  {
    title: "Manifest and discovery",
    body: "Read the live protocol shape before you register an app or hardcode assumptions into your client.",
    to: "/docs/examples/protocol-manifest-and-discovery",
  },
  {
    title: "Auth and delegated access",
    body: "Separate app identity from user authority. Tokens, scopes, consent requests, and grants are distinct layers.",
    to: "/docs/examples/protocol-consent-and-auth-troubleshooting",
  },
  {
    title: "Actions",
    body: "Write through stable coordination primitives for intents, requests, chats, and circles.",
    to: "/docs/examples/protocol-external-actions-reference",
  },
  {
    title: "Recovery",
    body: "Inspect deliveries, replay dead letters, and recover integrations without touching private infrastructure.",
    to: "/docs/examples/protocol-operator-recovery",
  },
];

const resources = [
  {
    title: "Examples",
    body: "Repository scripts for onboarding, actions, webhooks, operations, and agent flows.",
    to: "/docs/examples/protocol-sdk-index",
  },
  {
    title: "Production checklist",
    body: "Use the readiness checklist to make sure your integration is safe before it goes live.",
    to: "/docs/examples/protocol-production-readiness-checklist",
  },
  {
    title: "Compatibility",
    body: "Understand how the protocol evolves and which assumptions are safe for long-lived integrations.",
    to: "/docs/examples/protocol-versioning-and-compatibility",
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

function SurfaceCard({ surface, variant }) {
  return (
    <Link className={`os-surface-card os-surface-card--${variant}`} to={surface.to}>
      <div className="os-surface-band" />
      <h3>{surface.title}</h3>
      <p>{surface.body}</p>
    </Link>
  );
}

export default function Home() {
  const { siteConfig } = useDocusaurusContext();

  return (
    <Layout
      title={siteConfig.title}
      description="OpenSocial developer platform documentation for apps, agents, and partner systems"
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
            <h1>Build on an intent-first social coordination network.</h1>
            <p>
              OpenSocial is a protocol and developer platform for systems that
              help people express intent, coordinate introductions, form
              connections, and continue conversations. Public integrations use
              stable concepts, auth, actions, events, and recovery flows
              instead of private backend internals.
            </p>
          </header>

          <section className="os-quickstart-card">
            <div className="os-quickstart-copy">
              <div className="os-section-label">Developer quickstart</div>
              <h2>Read the contract, register an app, then integrate through stable primitives.</h2>
              <p>
                Start with manifest and discovery, issue a narrow app identity,
                request only the scopes you need, and dispatch through the
                documented protocol surface.
              </p>
              <div className="os-links">
                <Link className="button button--primary button--lg" to="/docs/examples/protocol-partner-quickstart">
                  Get started
                </Link>
                <Link className="button button--secondary button--lg" to="/docs/examples/protocol-sdk-index">
                  Browse the SDK
                </Link>
              </div>
            </div>

            <div className="os-snippet">
              <div className="os-snippet-header">
                <span>typescript</span>
                <span>Quickstart</span>
              </div>
              <pre>
                <code>{`import { createProtocolClientFromBaseUrl } from "@opensocial/protocol-client";

const client = createProtocolClientFromBaseUrl("https://api.opensocial.so/api");

const [manifest, discovery] = await Promise.all([
  client.getManifest(),
  client.getDiscovery(),
]);

const registration = await client.registerApp({
  registration: {
    appId: "partner.example",
    name: "Partner Example",
  },
  manifest: {
    ...manifest,
    appId: "partner.example",
  },
  requestedScopes: ["protocol.read", "actions.invoke"],
  requestedCapabilities: ["intent.write", "request.write"],
});`}</code>
              </pre>
            </div>
          </section>

          <section className="os-overview-section">
            <div className="os-section-heading">
              <h2>Build paths</h2>
              <p>
                Choose the integration layer that matches your system. Every
                path uses the same protocol boundary and event vocabulary.
              </p>
            </div>
            <div className="os-path-grid">
              {buildPaths.map((path) => (
                <Link key={path.to} className="os-path-card" to={path.to}>
                  <h3>{path.title}</h3>
                  <p>{path.body}</p>
                  <span>{path.cta}</span>
                </Link>
              ))}
            </div>
          </section>

          <section className="os-overview-section">
            <div className="os-section-heading">
              <h2>Core surfaces</h2>
              <p>
                These are the surfaces that matter most across a real
                integration lifecycle: connect, authorize, dispatch, and recover.
              </p>
            </div>
            <div className="os-surface-grid">
              {surfaces.map((surface, index) => (
                <SurfaceCard
                  key={surface.to}
                  surface={surface}
                  variant={(index % 4) + 1}
                />
              ))}
            </div>
          </section>

          <section className="os-overview-section">
            <div className="os-section-heading">
              <h2>Resources</h2>
              <p>
                Use these to move from concept to implementation to
                production-readiness.
              </p>
            </div>
            <div className="os-resource-grid">
              {resources.map((resource) => (
                <Link key={resource.to} className="os-resource-card" to={resource.to}>
                  <h3>{resource.title}</h3>
                  <p>{resource.body}</p>
                </Link>
              ))}
            </div>
          </section>
        </section>
      </main>
    </Layout>
  );
}
