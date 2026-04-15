/** @type {import('@docusaurus/plugin-content-docs').SidebarsConfig} */
const sidebars = {
  docsSidebar: [
    "index",
    {
      type: "category",
      label: "Getting Started",
      items: [
        "examples/protocol-sdk-index",
        "examples/protocol-overview-and-exclusions",
        "examples/protocol-manifest-and-discovery",
        "examples/protocol-app-registration-and-tokens",
        "examples/protocol-partner-quickstart",
      ],
    },
    {
      type: "category",
      label: "Core Integration",
      items: [
        "examples/protocol-external-actions-reference",
        "examples/protocol-event-subscriptions-and-replay",
        "examples/protocol-webhook-consumer",
        "examples/protocol-consent-and-auth-troubleshooting",
        "examples/protocol-production-readiness-checklist",
        "examples/protocol-versioning-and-compatibility",
      ],
    },
    {
      type: "category",
      label: "Agent Integrations",
      items: [
        "examples/protocol-agent-integration-paths",
        "examples/protocol-agent-quickstart",
        "examples/protocol-agent-readiness",
        "examples/protocol-agent-toolset",
      ],
    },
    {
      type: "category",
      label: "Operator Recovery",
      items: ["examples/protocol-operator-recovery"],
    },
  ],
};

export default sidebars;
