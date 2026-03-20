import { Platform } from "react-native";

/** Aligned with `tailwind.config.js` semantic colors */
export const appTheme = {
  colors: {
    background: "#212121",
    panel: "#2f2f2f",
    panelStrong: "#303030",
    ink: "#ececec",
    muted: "#9b9b9b",
    hairline: "#424242",
    accent: "#10a37f",
    success: "#10a37f",
    danger: "#f43f5e",
    info: "#38bdf8",
  },
  fonts: {
    heading: Platform.select({
      ios: "System",
      android: "sans-serif-medium",
      default: "sans-serif",
    }),
    body: Platform.select({
      ios: "System",
      android: "sans-serif",
      default: "sans-serif",
    }),
  },
  motion: {
    /** Screen / tab cross-fade + slide */
    screenEnterMs: 280,
    /** Subtle press fade */
    pressOpacity: 0.88,
  },
} as const;
