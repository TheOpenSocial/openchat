/** @type {import('@docusaurus/plugin-content-docs').SidebarsConfig} */
const sidebars = {
  docsSidebar: [
    "index",
    {
      type: "category",
      label: "Get started",
      items: [
        "examples/protocol-sdk-index",
        "examples/protocol-partner-quickstart",
        "examples/protocol-manifest-and-discovery",
        "examples/protocol-app-registration-and-tokens",
      ],
    },
    {
      type: "category",
      label: "Concepts",
      items: [
        "examples/protocol-vision-and-purpose",
        "examples/protocol-overview-and-exclusions",
        "examples/protocol-core-concepts",
        "examples/protocol-read-connect-dispatch-operate",
      ],
    },
    {
      type: "category",
      label: "Authentication",
      items: [
        "examples/protocol-consent-and-auth-troubleshooting",
        "examples/protocol-app-registration-and-tokens",
      ],
    },
    {
      type: "category",
      label: "Build",
      items: [
        "examples/protocol-external-actions-reference",
        "examples/protocol-event-subscriptions-and-replay",
        "examples/protocol-webhook-consumer",
      ],
    },
    {
      type: "category",
      label: "Production",
      items: [
        "examples/protocol-production-readiness-checklist",
        "examples/protocol-versioning-and-compatibility",
        "examples/protocol-operator-recovery",
      ],
    },
    {
      type: "category",
      label: "Agents SDK",
      items: [
        "examples/protocol-agent-integration-paths",
        "examples/protocol-agent-quickstart",
        "examples/protocol-agent-readiness",
        "examples/protocol-agent-toolset",
      ],
    },
  ],
};

export default sidebars;
