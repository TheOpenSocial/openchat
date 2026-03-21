export const supportedLocales = ["en", "es"] as const;
export type AppLocale = (typeof supportedLocales)[number];

const catalogs = {
  en: {
    localeLabel: "Language",
    localeEnglish: "English",
    localeSpanish: "Spanish",
    offlineNotice: "You're offline — reconnect to sync.",
    sendBlockedOffline: "Can't send while offline.",
    agentComposerModeChat: "Chat",
    agentComposerModeIntent: "Plans & intents",
    agentHistoryLoading: "Loading your conversation…",
    agentWorkflowThinking: "Thinking…",
    agentWorkflowRouting: "Finding the right path…",
    agentComposerHintChat:
      "Message here for replies and next steps in this thread.",
    agentComposerHintIntent:
      "Describe what you want to do—we’ll route it to the right people.",
    agentImageUrlOptional:
      "Image link (optional) — attach a picture if it helps.",
  },
  es: {
    localeLabel: "Idioma",
    localeEnglish: "Inglés",
    localeSpanish: "Español",
    offlineNotice: "No tienes conexión. Reconéctate para sincronizar.",
    sendBlockedOffline: "No se puede enviar sin conexión.",
    agentComposerModeChat: "Chat",
    agentComposerModeIntent: "Planes e intenciones",
    agentHistoryLoading: "Cargando tu conversación…",
    agentWorkflowThinking: "Pensando…",
    agentWorkflowRouting: "Buscando la mejor ruta…",
    agentComposerHintChat:
      "Escribe aquí para respuestas y próximos pasos en este hilo.",
    agentComposerHintIntent:
      "Describe lo que quieres hacer y lo enviaremos a las personas correctas.",
    agentImageUrlOptional:
      "Enlace de imagen (opcional): adjunta una foto si ayuda.",
  },
} as const;

type Key = keyof (typeof catalogs)["en"];

export function t(key: Key, locale: AppLocale = "en"): string {
  return catalogs[locale][key];
}
