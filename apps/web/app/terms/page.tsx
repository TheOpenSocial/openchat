import type { Metadata } from "next";

import { LegalPage } from "@/src/features/auth/legal-page";
import { createPublicMetadata } from "@/src/lib/seo";

export const metadata: Metadata = createPublicMetadata({
  title: "Terms",
  description:
    "The basic terms for using OpenSocial and joining the early access waitlist.",
  path: "/terms",
});

export default function TermsPage() {
  return (
    <LegalPage
      activePath="/terms"
      eyebrow="Terms"
      lede="These terms describe the basic expectations for using OpenSocial, joining early access, and treating other people with consent and respect."
      sections={[
        {
          title: "Using OpenSocial",
          paragraphs: [
            "OpenSocial is an intent-first social coordination product. You may use it to express what you want to do, discover relevant people, and coordinate connections where everyone involved has a clear choice.",
            "You are responsible for the information you provide, the requests you make, and the way you interact with other people through the product.",
          ],
        },
        {
          title: "Eligibility and accounts",
          paragraphs: [
            "You must be at least 13 years old to use OpenSocial. If the law where you live requires a higher age, you must meet that higher age.",
            "You are responsible for keeping your account information accurate and for protecting access to your account.",
          ],
        },
        {
          title: "Respect and consent",
          paragraphs: [
            "You may not use OpenSocial to harass, deceive, impersonate, spam, exploit, or harm other people.",
            "Connections should be explicit. The product is designed around consent, safety, and user control, and we may limit, suspend, or remove access when behavior conflicts with those principles.",
          ],
        },
        {
          title: "Early access",
          paragraphs: [
            "Joining the waitlist does not guarantee access, timing, availability, or specific product features.",
            "During early access, features may change quickly, availability may be limited, and some functionality may be experimental.",
          ],
        },
        {
          title: "Product availability",
          paragraphs: [
            "We work to keep OpenSocial reliable, but the product may be unavailable, delayed, changed, or discontinued as we develop it.",
            "We may update, suspend, or restrict parts of the product to improve safety, security, performance, or product quality.",
          ],
        },
        {
          title: "Intellectual property",
          paragraphs: [
            "OpenSocial, its interface, brand, software, and related materials belong to OpenSocial or its licensors.",
            "You keep ownership of content you provide, but you give OpenSocial the limited permission needed to host, process, display, transmit, and operate that content for the service. If content is used to improve product quality, we will handle it according to our Privacy Policy and applicable law.",
          ],
        },
        {
          title: "Safety and enforcement",
          paragraphs: [
            "We may review reports, investigate suspected misuse, remove content, limit features, or suspend access when needed to protect people or the service.",
            "We may also preserve or disclose information when required by law, to enforce these terms, or to protect the rights, safety, and security of OpenSocial, users, or the public.",
          ],
        },
        {
          title: "No professional advice",
          paragraphs: [
            "OpenSocial may help people discover and coordinate with others, but it does not provide legal, medical, financial, or professional advice.",
            "You are responsible for deciding whether to meet, collaborate, share information, or rely on another person.",
          ],
        },
        {
          title: "Disclaimers and liability",
          paragraphs: [
            "OpenSocial is provided as is and as available, especially during early access. We do not promise that the product will be uninterrupted, error-free, or always match a specific expectation.",
            "To the maximum extent allowed by law, OpenSocial is not responsible for indirect, incidental, special, consequential, or punitive damages, or for loss of data, profits, goodwill, or business opportunities.",
          ],
        },
        {
          title: "Governing law and updates",
          paragraphs: [
            "These terms are governed by the laws that apply to OpenSocial's operating entity, unless local law requires otherwise. We may add more specific jurisdiction and dispute terms as the company structure and launch markets are finalized.",
            "We may update these terms as OpenSocial changes. Effective date: April 25, 2026.",
          ],
        },
      ]}
      title="Terms of use"
    />
  );
}
