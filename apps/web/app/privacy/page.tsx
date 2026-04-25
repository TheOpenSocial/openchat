import type { Metadata } from "next";

import { LegalPage } from "@/src/features/auth/legal-page";
import { createPublicMetadata } from "@/src/lib/seo";

export const metadata: Metadata = createPublicMetadata({
  title: "Privacy",
  description:
    "How OpenSocial approaches privacy, consent, data use, and user control.",
  path: "/privacy",
});

export default function PrivacyPage() {
  return (
    <LegalPage
      activePath="/privacy"
      eyebrow="Privacy"
      lede="OpenSocial is designed around intent, consent, and control. This page explains what we collect, why we use it, and the choices we aim to give people as the product grows."
      sections={[
        {
          title: "What we collect",
          paragraphs: [
            "OpenSocial may collect account details, profile information, waitlist submissions, product usage signals, device and browser information, and the content people choose to provide when they express an intent or use the product.",
            "We collect this information to operate the service, help people coordinate safely, improve product quality, prevent abuse, understand demand, and communicate about access or important product updates.",
          ],
        },
        {
          title: "How we use information",
          paragraphs: [
            "We use information to understand user intent, route requests, support explicit opt-in connections, maintain safety controls, and keep the service reliable.",
            "We do not want the product to depend on dark patterns, hidden social activity, or opaque automation. The user should understand what is happening and stay in control of meaningful social actions.",
          ],
        },
        {
          title: "AI and human boundaries",
          paragraphs: [
            "AI may help interpret intent, summarize context, rank possible matches, detect risk, and support coordination workflows.",
            "Our product direction is that AI should not impersonate a user, create false closeness, or quietly socialize on someone's behalf. Human connection should remain human.",
          ],
        },
        {
          title: "Cookies and analytics",
          paragraphs: [
            "We may use cookies, local storage, and similar technologies to remember preferences, keep sessions working, measure product performance, and understand how public pages are used.",
            "Where required, we will provide additional controls for analytics, marketing, or optional tracking.",
          ],
        },
        {
          title: "Sharing and disclosure",
          paragraphs: [
            "We may share information with service providers that help us operate infrastructure, security, analytics, communications, and product workflows.",
            "We may also disclose information if required by law, to protect people, to investigate abuse, or to preserve the security and integrity of OpenSocial.",
          ],
        },
        {
          title: "Retention and deletion",
          paragraphs: [
            "We keep information for as long as needed to provide OpenSocial, maintain security, comply with legal obligations, resolve disputes, and improve the product.",
            "As account controls mature, we plan to make it easier to access, update, export, or delete information connected to your account. Until then, privacy requests can be sent to privacy@opensocial.so.",
          ],
        },
        {
          title: "International use",
          paragraphs: [
            "OpenSocial may process information in countries other than where you live. When we transfer information, we use reasonable safeguards appropriate to the service and the stage of the product.",
            "If regional privacy rights apply to you, contact privacy@opensocial.so and we will review the request according to applicable law.",
          ],
        },
        {
          title: "Children",
          paragraphs: [
            "OpenSocial is not intended for children under 13, and we do not knowingly collect personal information from children under 13.",
            "If you believe a child has provided personal information, contact privacy@opensocial.so so we can review and remove it where appropriate.",
          ],
        },
        {
          title: "User control",
          paragraphs: [
            "Our goal is to give users clear controls over profile information, preferences, communication, and how social requests become connections.",
            "If you need privacy help before formal account controls are available, contact privacy@opensocial.so.",
          ],
        },
        {
          title: "Updates",
          paragraphs: [
            "We may update this policy as OpenSocial changes. If changes are material, we will take reasonable steps to notify users through the product or another appropriate channel.",
            "Effective date: April 25, 2026.",
          ],
        },
      ]}
      title="Privacy at OpenSocial"
    />
  );
}
