export const THREAD_RUNTIME_COPY = {
  sending: {
    contextLabel: "Working",
    thinkingLabel: "Got it. Shaping your next step…",
  },
  loading: {
    contextLabel: "Working",
    thinkingLabel: "Preparing your thread…",
  },
  matching: {
    contextLabel: "Working",
    thinkingLabel: "Finding your best next step…",
  },
  waiting: {
    contextLabelFallback: "In progress",
    contextLabelWithHint: "In progress",
    thinkingLabel: "Still with you while replies come in…",
  },
  ready: {
    contextLabel: "Ready",
  },
  noMatch: {
    contextLabel: "No match yet",
  },
  idle: {
    contextLabelWithHint: "Updated",
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
