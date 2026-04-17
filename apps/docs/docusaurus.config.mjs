import { themes as prismThemes } from "prism-react-renderer";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/** @type {import('@docusaurus/types').Config} */
const config = {
  title: "OpenSocial",
  tagline: "SDK docs for apps, agents, authentication, actions, and events",
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
          editUrl: "https://github.com/TheOpenSocial/openchat/tree/main/",
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
          to: "/",
          label: "Home",
          position: "left",
        },
        {
          type: "docSidebar",
          sidebarId: "docsSidebar",
          position: "left",
          label: "Docs",
        },
        {
          to: "/docs/examples/protocol-partner-quickstart",
          label: "Quickstart",
          position: "left",
        },
        {
          to: "/docs/examples/protocol-external-actions-reference",
          label: "Reference",
          position: "left",
        },
        {
          to: "/docs/examples/protocol-agent-integration-paths",
          label: "Agents",
          position: "left",
        },
        {
          href: "https://github.com/TheOpenSocial/openchat",
          label: "GitHub",
          position: "right",
        },
      ],
    },
    footer: {
      style: "light",
      links: [
        {
          title: "Concepts",
          items: [
            {
              label: "Overview",
              to: "/docs",
            },
            {
              label: "Vision + purpose",
              to: "/docs/examples/protocol-vision-and-purpose",
            },
            {
              label: "Core concepts",
              to: "/docs/examples/protocol-core-concepts",
            },
            {
              label: "Protocol shape",
              to: "/docs/examples/protocol-overview-and-exclusions",
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
              label: "Auth + tokens",
              to: "/docs/examples/protocol-app-registration-and-tokens",
            },
            {
              label: "Actions reference",
              to: "/docs/examples/protocol-external-actions-reference",
            },
            {
              label: "Webhooks + replay",
              to: "/docs/examples/protocol-event-subscriptions-and-replay",
            },
          ],
        },
        {
          title: "Production",
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
              label: "Delivery recovery",
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
