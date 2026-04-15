import { themes as prismThemes } from "prism-react-renderer";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/** @type {import('@docusaurus/types').Config} */
const config = {
  title: "OpenSocial Docs",
  tagline: "Protocol SDK and third-party integration documentation",
  url: "https://docs.opensocial.so",
  baseUrl: "/",
  organizationName: "TheOpenSocial",
  projectName: "openchat",
  onBrokenLinks: "warn",
  onBrokenMarkdownLinks: "warn",
  onDuplicateRoutes: "warn",
  i18n: {
    defaultLocale: "en",
    locales: ["en"],
  },
  markdown: {
    mermaid: true,
  },
  themes: ["@docusaurus/theme-mermaid"],
  presets: [
    [
      "classic",
      {
        docs: {
          path: path.resolve(__dirname, "../../docs"),
          routeBasePath: "docs",
          sidebarPath: path.resolve(__dirname, "./sidebars.mjs"),
          include: ["index.md", "examples/protocol-*.md"],
          editUrl:
            "https://github.com/TheOpenSocial/openchat/tree/main/",
          showLastUpdateTime: true,
        },
        blog: false,
        theme: {
          customCss: path.resolve(__dirname, "./src/css/custom.css"),
        },
      },
    ],
  ],
  themeConfig: {
    navbar: {
      title: "OpenSocial",
      items: [
        {
          type: "docSidebar",
          sidebarId: "docsSidebar",
          position: "left",
          label: "SDK Docs",
        },
        {
          to: "/docs/examples/protocol-sdk-index",
          label: "Protocol SDK",
          position: "left",
        },
        {
          to: "/docs/examples/protocol-overview-and-exclusions",
          label: "Concepts",
          position: "left",
        },
        {
          to: "/docs/examples/protocol-partner-quickstart",
          label: "Quickstart",
          position: "left",
        },
        {
          to: "/docs/examples/protocol-external-actions-reference",
          label: "API",
          position: "left",
        },
        {
          href: "https://github.com/TheOpenSocial/openchat",
          label: "GitHub",
          position: "right",
        },
      ],
    },
    announcementBar: {
      id: "sdk_scope",
      content:
        "Public docs cover the OpenSocial protocol SDK only: auth, connect, actions, events, webhooks, agents, and recovery.",
      backgroundColor: "#153b31",
      textColor: "#eef7f2",
      isCloseable: false,
    },
    footer: {
      style: "dark",
      links: [
        {
          title: "Concepts",
          items: [
            {
              label: "Overview",
              to: "/docs",
            },
            {
              label: "Protocol shape",
              to: "/docs/examples/protocol-overview-and-exclusions",
            },
            {
              label: "Manifest + discovery",
              to: "/docs/examples/protocol-manifest-and-discovery",
            },
          ],
        },
        {
          title: "Build",
          items: [
            {
              label: "Quickstart",
              to: "/docs/examples/protocol-partner-quickstart",
            },
            {
              label: "External actions",
              to: "/docs/examples/protocol-external-actions-reference",
            },
            {
              label: "Webhooks + replay",
              to: "/docs/examples/protocol-event-subscriptions-and-replay",
            },
          ],
        },
        {
          title: "Operate",
          items: [
            {
              label: "Agent quickstart",
              to: "/docs/examples/protocol-agent-quickstart",
            },
            {
              label: "Consent + auth troubleshooting",
              to: "/docs/examples/protocol-consent-and-auth-troubleshooting",
            },
            {
              label: "Operator recovery",
              to: "/docs/examples/protocol-operator-recovery",
            },
          ],
        },
      ],
      copyright: `Copyright ${new Date().getFullYear()} OpenSocial`,
    },
    prism: {
      theme: prismThemes.github,
      darkTheme: prismThemes.dracula,
    },
  },
};

export default config;
