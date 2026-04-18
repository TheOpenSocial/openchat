export const THREAD_RUNTIME_COPY = {
  sending: {
    contextLabel: "In motion",
    thinkingLabel: "Got it. Turning that into a strong next step…",
  },
  loading: {
    contextLabel: "Getting ready",
    thinkingLabel: "Getting your conversation ready…",
  },
  matching: {
    contextLabel: "Looking",
    thinkingLabel: "Looking for the best next move…",
  },
  waiting: {
    contextLabelFallback: "Waiting",
    contextLabelWithHint: "Waiting",
    thinkingLabel: "Still with you while replies come in…",
  },
  ready: {
    contextLabel: "Ready",
  },
  noMatch: {
    contextLabel: "Nothing strong yet",
  },
  idle: {
    contextLabelWithHint: "Ready",
  },
} as const;

export const THREAD_RUNTIME_PRIORITY = {
  sending: 6,
  loading: 5,
  matching: 4,
  waiting: 3,
  ready: 2,
  no_match: 1,
  idle: 0,
} as const;

export const THREAD_RUNTIME_MOTION = {
  presentationDowngradeDelayMs: 380,
  statusTransition: {
    fromOpacity: 0.3,
    fromTranslateY: 4,
    durationMs: 220,
  },
  keyboardTabBar: {
    hideDurationMs: 170,
    showDurationMs: 220,
    hiddenOffsetY: 28,
  },
} as const;

export const THREAD_THINKING_MOTION = {
  dotMinOpacity: 0.25,
  dotMaxOpacity: 1,
  pulseInDurationMs: 320,
  pulseOutDurationMs: 420,
  pulseDelayMs: 120,
} as const;
