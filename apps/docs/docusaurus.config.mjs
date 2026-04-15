import { themes as prismThemes } from "prism-react-renderer";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/** @type {import('@docusaurus/types').Config} */
const config = {
  title: "OpenSocial Docs",
  tagline: "Protocol, backend, mobile, and ops documentation",
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
  presets: [
    [
      "classic",
      {
        docs: {
          path: path.resolve(__dirname, "../../docs"),
          routeBasePath: "docs",
          sidebarPath: path.resolve(__dirname, "./sidebars.mjs"),
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
          label: "Docs",
        },
        {
          to: "/docs/examples/protocol-sdk-index",
          label: "Protocol SDK",
          position: "left",
        },
        {
          to: "/docs/protocol-backlog",
          label: "Backlog",
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
      style: "dark",
      links: [
        {
          title: "Docs",
          items: [
            {
              label: "Overview",
              to: "/docs",
            },
            {
              label: "Protocol SDK",
              to: "/docs/examples/protocol-sdk-index",
            },
            {
              label: "Manual QA",
              to: "/docs/manual-qa-script",
            },
          ],
        },
        {
          title: "Operations",
          items: [
            {
              label: "Sandbox World",
              to: "/docs/staging-sandbox-world",
            },
            {
              label: "Queue Replay Runbook",
              to: "/docs/queue-replay-runbook",
            },
            {
              label: "Backend Launch Ops",
              to: "/docs/backend-launch-ops-pack",
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
