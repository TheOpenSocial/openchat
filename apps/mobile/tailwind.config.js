/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./App.tsx", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        /** App canvas (ChatGPT-like dark gray) */
        canvas: "#212121",
        /** Elevated panels, bubbles, composer */
        surface: "#2f2f2f",
        surfaceMuted: "#262626",
        /** Hairlines and input outlines */
        hairline: "#424242",
        /** Primary text */
        ink: "#ececec",
        /** Secondary text */
        muted: "#9b9b9b",
        /** OpenAI-style accent */
        accent: "#10a37f",
        accentMuted: "rgba(16, 163, 127, 0.14)",
        /** Legacy aliases (keep for gradual migration) */
        chatBg: "#212121",
        chatPanel: "#2f2f2f",
        chatBorder: "#424242",
        chatText: "#ececec",
        chatMuted: "#9b9b9b",
        chatAccent: "#10a37f",
      },
      fontSize: {
        /** Slightly tighter body for chat density */
        chat: ["15px", { lineHeight: "22px" }],
      },
    },
  },
  plugins: [],
};
