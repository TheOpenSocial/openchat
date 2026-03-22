/**
 * Central timing for {@link WelcomeTitleSequence}.
 * Words move **in from the right** and **out to the left**, one at a time (no crossfade overlap).
 */
export const WELCOME_TITLE_TIMING = {
  /** Slide from off-screen right into center. */
  slideEnterMs: 720,
  /** Slide out toward the left while fading. */
  slideExitMs: 640,
  /** Hold at center, fully visible, before exiting. */
  holdMs: 1000,
  /** Hold on “Open” at center before “ Social” slides in from the right. */
  holdOpenMs: 1500,
  /** “ Social” slide-in duration (from the right). */
  suffixInMs: 780,
  /** Start position for hero lines (px); positive = right of center. */
  slideFromRightPx: 40,
  /** Exit distance (px); animated toward negative X. */
  slideExitLeftPx: 44,
  /** Suffix starts closer — shorter travel beside “Open”. */
  suffixSlideFromPx: 18,
  /** After final lockup, before completion callback / subtitle. */
  holdFinalMs: 1100,
  /** Subtitle fades in after the title has settled. */
  subtitleFadeMs: 720,
  subtitleDelayMs: 260,
  ctaRevealDelayMs: 260,
  ctaFadeInMs: 680,
} as const;

/**
 * Solo beats before the “Open” row → “Open Social.” lockup.
 */
export const WELCOME_TITLE_SOLO_WORDS = [
  "Agentic.",
  "Social.",
  "Open.",
] as const;

export const WELCOME_TITLE_TYPOGRAPHY = {
  titleSize: 40,
  letterSpacingIos: -0.8,
  letterSpacingAndroid: -0.4,
} as const;
