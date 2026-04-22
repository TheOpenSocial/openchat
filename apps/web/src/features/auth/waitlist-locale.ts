export const waitlistLocales = ["en", "es", "fr"] as const;

export type WaitlistLocale = (typeof waitlistLocales)[number];

export function isWaitlistLocale(
  value: string | undefined,
): value is WaitlistLocale {
  return value === "en" || value === "es" || value === "fr";
}
