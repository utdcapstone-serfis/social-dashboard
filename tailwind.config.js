/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Palette lifted from the Serfis reference artifact.
        void: "#06030F", // page background
        plum: {
          950: "#0B0620", // raised surfaces
          900: "#0F032D", // panels
          800: "#1A1140", // hover / inset
          700: "#2A1A5E", // borders, strong dividers
        },
        violet: {
          deep: "#4E2BCC",
          DEFAULT: "#6A3FE6", // primary action
          bright: "#905BF4", // active nav, chart accent
          soft: "#C084FC", // heliotrope: links, kickers
        },
        accent: {
          blue: "#3B5BFF",
          fuchsia: "#D946EF",
        },
        ink: {
          DEFAULT: "#EFEFEF", // primary text
          muted: "#A9A3BF", // secondary text (≥ 7:1 on void)
          faint: "#8A82A6", // tertiary text (≥ 4.6:1 on plum.900)
        },
        // Semantic: metric deltas and status badges.
        up: "#3BE08C",
        down: "#FF6B8A",
        warn: "#FBBF24",
      },
      fontFamily: {
        sans: ['"Space Grotesk"', "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ['"Space Mono"', "ui-monospace", "Menlo", "monospace"],
      },
      boxShadow: {
        glow: "0 0 24px -6px rgba(144,91,244,.55)",
      },
    },
  },
  plugins: [],
};
