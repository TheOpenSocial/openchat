/**
 * Welcome screen backdrop assets.
 *
 * **Default video:** bundled `assets/video/welcome-bg.mp4` (compressed from
 * [Pexels #10610204](https://www.pexels.com/video/woman-closing-mobile-phone-and-sitting-with-women-10610204/), Pexels license).
 *
 * **Override:** Pexels’ CDN often returns **403** to apps when hotlinking. To use a different
 * file, host an HTTPS MP4 (S3, R2, etc.) and set `EXPO_PUBLIC_WELCOME_VIDEO_URI`.
 */

/** HTTPS MP4 when set; otherwise `WelcomeBackdrop` uses the bundled `welcome-bg.mp4`. */
export const WELCOME_VIDEO_URI =
  process.env.EXPO_PUBLIC_WELCOME_VIDEO_URI?.trim() ?? "";

/**
 * High-quality still fallback — group of friends (Unsplash, [license](https://unsplash.com/license)).
 * Used when no video URI is set or while video fails to load.
 */
export const WELCOME_IMAGE_FALLBACK_URI =
  "https://images.unsplash.com/photo-1529156069898-49953e39b3ac?auto=format&fit=crop&w=1800&q=85";
