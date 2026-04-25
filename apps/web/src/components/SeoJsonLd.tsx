import {
  createOrganizationJsonLd,
  createSoftwareApplicationJsonLd,
  createWebsiteJsonLd,
} from "@/src/lib/seo";

export function SeoJsonLd() {
  const graph = [
    createOrganizationJsonLd(),
    createWebsiteJsonLd(),
    createSoftwareApplicationJsonLd(),
  ];

  return (
    <script
      dangerouslySetInnerHTML={{
        __html: JSON.stringify(graph).replace(/</g, "\\u003c"),
      }}
      type="application/ld+json"
    />
  );
}
