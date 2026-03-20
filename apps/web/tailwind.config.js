/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{ts,tsx}", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#e7f1ff",
        ash: "#8da2c9",
        ember: "#ffb74a",
        ocean: "#1d4ed8",
        night: "#070b17",
      },
      keyframes: {
        rise: {
          "0%": { opacity: "0", transform: "translateY(10px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        pulseSoft: {
          "0%, 100%": { opacity: "0.42" },
          "50%": { opacity: "1" },
        },
      },
      animation: {
        rise: "rise 0.34s cubic-bezier(0.22, 1, 0.36, 1) forwards",
        pulseSoft: "pulseSoft 2.2s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};
