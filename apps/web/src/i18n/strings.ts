export const supportedLocales = ["en", "es", "fr"] as const;
export type AppLocale = (typeof supportedLocales)[number];

const catalogs = {
  en: {
    localeLabel: "Language",
    localeEnglish: "English",
    localeSpanish: "Spanish",
    localeFrench: "French",
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
    agentVoiceTranscriptOptional:
      "Voice note (optional) — we attach the transcript with your message.",
    agentImageUrlOptional:
      "Image link (optional) — attach a picture if it helps.",
  },
  es: {
    localeLabel: "Idioma",
    localeEnglish: "Inglés",
    localeSpanish: "Español",
    localeFrench: "Francés",
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
    agentVoiceTranscriptOptional:
      "Nota de voz (opcional): adjuntamos la transcripción con tu mensaje.",
    agentImageUrlOptional:
      "Enlace de imagen (opcional): adjunta una foto si ayuda.",
  },
  fr: {
    localeLabel: "Langue",
    localeEnglish: "Anglais",
    localeSpanish: "Espagnol",
    localeFrench: "Français",
    offlineNotice: "Vous êtes hors ligne. Reconnectez-vous pour synchroniser.",
    sendBlockedOffline: "Impossible d'envoyer hors ligne.",
    agentComposerModeChat: "Chat",
    agentComposerModeIntent: "Plans et intentions",
    agentHistoryLoading: "Chargement de votre conversation…",
    agentWorkflowThinking: "Réflexion…",
    agentWorkflowRouting: "Recherche du bon chemin…",
    agentComposerHintChat:
      "Écrivez ici pour les réponses et les prochaines étapes dans ce fil.",
    agentComposerHintIntent:
      "Décrivez ce que vous voulez faire et nous l'orienterons vers les bonnes personnes.",
    agentVoiceTranscriptOptional:
      "Note vocale (optionnel) : nous joignons la transcription à votre message.",
    agentImageUrlOptional:
      "Lien d'image (optionnel) : joignez une image si cela aide.",
  },
} as const;

type Key = keyof (typeof catalogs)["en"];

export function t(key: Key, locale: AppLocale = "en"): string {
  return catalogs[locale][key];
}
