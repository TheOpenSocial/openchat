/** English-only; extend with locale switching when adding real i18n. */
const locale = "en" as const;

const catalogs = {
  en: {
    offlineNotice: "You're offline — reconnect to sync.",
    sendBlockedOffline: "Can't send while offline.",
    agentComposerModeChat: "Agent chat",
    agentComposerModeIntent: "Intent queue",
    agentHistoryLoading: "Loading agent conversation…",
    agentWorkflowThinking: "Thinking…",
    agentWorkflowRouting: "Routing your request...",
    agentComposerHintChat:
      "Runs POST /agent/threads/:id/respond then refreshes messages.",
    agentComposerHintIntent: "Queues POST /intents (optional agentThreadId).",
    agentVoiceTranscriptOptional:
      "Voice transcript (optional) — sent as voiceTranscript metadata with agent chat.",
    agentImageUrlOptional:
      "Image URL (optional) — sent as an attachment with agent chat.",
  },
} as const;

type Key = keyof (typeof catalogs)["en"];

export function t(key: Key): string {
  return catalogs[locale][key];
}
