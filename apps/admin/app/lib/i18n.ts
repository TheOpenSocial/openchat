export const supportedLocales = ["en", "es"] as const;
export type AppLocale = (typeof supportedLocales)[number];

const catalogs = {
  en: {
    language: "Language",
    english: "English",
    spanish: "Spanish",
    ready: "ready",
    busyPrefix: "busy",
    signOut: "Sign out",
    operatorContextNote:
      "Signed-in operator context is sent as RBAC headers on each request.",
  },
  es: {
    language: "Idioma",
    english: "Inglés",
    spanish: "Español",
    ready: "listo",
    busyPrefix: "ocupado",
    signOut: "Cerrar sesión",
    operatorContextNote:
      "El contexto del operador autenticado se envía como headers RBAC en cada solicitud.",
  },
} as const;

type Key = keyof (typeof catalogs)["en"];

export function t(key: Key, locale: AppLocale = "en"): string {
  return catalogs[locale][key];
}
