/**
 * English-only copy hub. Swap `locale` or wire a catalog when adding real i18n.
 */
const locale = "en" as const;

const catalogs = {
  en: {
    offlineNotice: "You're offline — reconnect to sync.",
    sendBlockedOffline: "Can't send while offline.",
    agentComposerModeChat: "Agent chat",
    agentComposerModeIntent: "Intent queue",
    agentHistoryLoading: "Loading agent conversation…",
    agentWorkflowThinking: "Thinking…",
    agentWorkflowRouting: "Routing your request now...",
    agentComposerHintChat: "Chat runs a full agent turn on your thread.",
    agentComposerHintIntent: "Queue an intent for matching and inbox flows.",
  },
} as const;

type Key = keyof (typeof catalogs)["en"];

export function t(key: Key): string {
  return catalogs[locale][key];
}
