/** @type {import('@docusaurus/plugin-content-docs').SidebarsConfig} */
const sidebars = {
  docsSidebar: [
    "index",
    {
      type: "category",
      label: "Concepts",
      items: [
        "examples/protocol-sdk-index",
        "examples/protocol-vision-and-purpose",
        "examples/protocol-overview-and-exclusions",
        "examples/protocol-core-concepts",
        "examples/protocol-manifest-and-discovery",
      ],
    },
    {
      type: "category",
      label: "Connect",
      items: [
        "examples/protocol-read-connect-dispatch-operate",
        "examples/protocol-app-registration-and-tokens",
        "examples/protocol-partner-quickstart",
        "examples/protocol-consent-and-auth-troubleshooting",
      ],
    },
    {
      type: "category",
      label: "Read And Dispatch",
      items: [
        "examples/protocol-external-actions-reference",
        "examples/protocol-manifest-and-discovery",
        "examples/protocol-app-registration-and-tokens",
        "examples/protocol-event-subscriptions-and-replay",
        "examples/protocol-webhook-consumer",
        "examples/protocol-production-readiness-checklist",
        "examples/protocol-versioning-and-compatibility",
      ],
    },
    {
      type: "category",
      label: "Agents",
      items: [
        "examples/protocol-agent-integration-paths",
        "examples/protocol-agent-quickstart",
        "examples/protocol-agent-readiness",
        "examples/protocol-agent-toolset",
      ],
    },
    {
      type: "category",
      label: "Operate",
      items: ["examples/protocol-operator-recovery"],
    },
  ],
};

export default sidebars;
