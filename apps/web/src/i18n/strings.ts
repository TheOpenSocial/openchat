/** English-only; extend with locale switching when adding real i18n. */
const locale = "en" as const;

const catalogs = {
  en: {
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
} as const;

type Key = keyof (typeof catalogs)["en"];

export function t(key: Key): string {
  return catalogs[locale][key];
}
