import type { Metadata } from "next";

import { LegalPage } from "@/src/features/auth/legal-page";
import { createPublicMetadata } from "@/src/lib/seo";

export const metadata: Metadata = createPublicMetadata({
  title: "Security",
  description:
    "How OpenSocial thinks about security, safety, reliability, and responsible disclosure.",
  path: "/security",
});

export default function SecurityPage() {
  return (
    <LegalPage
      activePath="/security"
      eyebrow="Security"
      lede="OpenSocial handles social intent and connection workflows, so security is part of the product design, not a separate afterthought."
      sections={[
        {
          title: "Security principles",
          paragraphs: [
            "We design OpenSocial so important social actions are explicit, reviewable, and controlled by application-owned state transitions.",
            "Agentic behavior can suggest, enrich, and prioritize, but final writes, permissions, and safety-sensitive decisions should remain deterministic and understandable.",
          ],
        },
        {
          title: "Data protection",
          paragraphs: [
            "We use access controls, constrained API surfaces, operational visibility, and infrastructure boundaries to reduce the risk of unauthorized access.",
            "Sensitive workflows are designed to avoid unnecessary exposure of private information and to make it clear when information is being used to create a connection.",
          ],
        },
        {
          title: "Abuse prevention",
          paragraphs: [
            "OpenSocial is designed to reduce spam, impersonation, unwanted outreach, and ambiguous social automation.",
            "We expect to use moderation, rate limits, reputation signals, explicit acceptance, and review workflows as the product matures.",
          ],
        },
        {
          title: "Responsible disclosure",
          paragraphs: [
            "If you believe you have found a security issue, please report it to security@opensocial.so with enough detail for us to reproduce and understand the risk.",
            "Please do not access, modify, delete, or disclose data that does not belong to you while investigating an issue.",
          ],
        },
        {
          title: "Disclosure scope",
          paragraphs: [
            "Helpful reports include the affected route or API, reproduction steps, expected impact, browser or device details, and any screenshots or logs that do not expose another person's private data.",
            "We do not currently operate a public bug bounty program. We still appreciate responsible reports and will review them as quickly as the team can.",
          ],
        },
        {
          title: "Operational maturity",
          paragraphs: [
            "Security work is ongoing. The product is evolving, and this page will mature alongside incident response, monitoring, access review, and vulnerability disclosure processes.",
            "Effective date: April 25, 2026.",
          ],
        },
      ]}
      title="Security and trust"
    />
  );
}
