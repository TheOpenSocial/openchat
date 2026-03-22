export const COUNTRY_OPTIONS = [
  "Argentina",
  "Australia",
  "Austria",
  "Belgium",
  "Brazil",
  "Canada",
  "Chile",
  "China",
  "Colombia",
  "Costa Rica",
  "Denmark",
  "Finland",
  "France",
  "Germany",
  "Greece",
  "India",
  "Indonesia",
  "Ireland",
  "Israel",
  "Italy",
  "Japan",
  "Mexico",
  "Netherlands",
  "New Zealand",
  "Norway",
  "Peru",
  "Portugal",
  "Singapore",
  "South Africa",
  "South Korea",
  "Spain",
  "Sweden",
  "Switzerland",
  "Thailand",
  "Turkey",
  "United Arab Emirates",
  "United Kingdom",
  "United States",
  "Uruguay",
  "Vietnam",
] as const;

const FALLBACK_REGION_TO_COUNTRY: Record<string, string> = {
  AR: "Argentina",
  AU: "Australia",
  AT: "Austria",
  BE: "Belgium",
  BR: "Brazil",
  CA: "Canada",
  CL: "Chile",
  CN: "China",
  CO: "Colombia",
  CR: "Costa Rica",
  DK: "Denmark",
  FI: "Finland",
  FR: "France",
  DE: "Germany",
  GR: "Greece",
  IN: "India",
  ID: "Indonesia",
  IE: "Ireland",
  IL: "Israel",
  IT: "Italy",
  JP: "Japan",
  MX: "Mexico",
  NL: "Netherlands",
  NZ: "New Zealand",
  NO: "Norway",
  PE: "Peru",
  PT: "Portugal",
  SG: "Singapore",
  ZA: "South Africa",
  KR: "South Korea",
  ES: "Spain",
  SE: "Sweden",
  CH: "Switzerland",
  TH: "Thailand",
  TR: "Turkey",
  AE: "United Arab Emirates",
  GB: "United Kingdom",
  US: "United States",
  UY: "Uruguay",
  VN: "Vietnam",
};

export function guessCountryFromLocale() {
  try {
    const locale = Intl.DateTimeFormat().resolvedOptions().locale;
    const regionMatch = locale.match(/[-_](\w{2})$/);
    const region = regionMatch?.[1]?.toUpperCase();
    if (!region) {
      return null;
    }

    if (typeof Intl.DisplayNames === "function") {
      const displayNames = new Intl.DisplayNames(["en"], { type: "region" });
      const label = displayNames.of(region);
      if (
        label &&
        COUNTRY_OPTIONS.includes(label as (typeof COUNTRY_OPTIONS)[number])
      ) {
        return label;
      }
    }

    return FALLBACK_REGION_TO_COUNTRY[region] ?? null;
  } catch {
    return null;
  }
}
