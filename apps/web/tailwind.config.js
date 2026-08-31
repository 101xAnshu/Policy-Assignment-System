/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        // Warp-inspired charcoal palette
        background: "#1a1a1a",
        surface: "#242424",
        "surface-raised": "#2e2e2e",
        "surface-highlight": "#383838",
        border: "#3a3a3a",

        // Text hierarchy
        primary: "#e8e8e8",
        secondary: "#888888",
        tertiary: "#666666",

        // Warm orange accent
        accent: {
          DEFAULT: "#e8772e",
          50: "#fef3e8",
          100: "#fce0c6",
          200: "#f9c18d",
          300: "#f5a054",
          400: "#e8772e",
          500: "#d4631a",
          600: "#b04f14",
          700: "#8c3d10",
        },

        // Semantic colors — used only for status
        status: {
          success: "#3fba6b",
          error: "#e5484d",
          warning: "#f5a623",
          info: "#889096",
        },
      },
      fontFamily: {
        heading: ["Geist", "Inter", "system-ui", "sans-serif"],
        sans: ["Inter", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "monospace"],
      },
      borderRadius: {
        DEFAULT: "8px",
      },
    },
  },
  plugins: [],
};
