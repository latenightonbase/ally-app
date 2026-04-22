import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: [
    "./app/**/*.{js,jsx,ts,tsx}",
    "./components/**/*.{js,jsx,ts,tsx}",
  ],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Nunito_400Regular", "System"],
        "sans-medium": ["Nunito_500Medium", "System"],
        "sans-semibold": ["Nunito_600SemiBold", "System"],
        "sans-bold": ["Nunito_700Bold", "System"],
      },
      colors: {
        primary: "var(--color-primary)",
        "primary-soft": "var(--color-primary-soft)",
        secondary: "var(--color-secondary)",
        background: "var(--color-background)",
        surface: "var(--color-surface)",
        foreground: "var(--color-foreground)",
        muted: "var(--color-muted)",
        faint: "var(--color-faint)",
        border: "var(--color-border)",
        accent: "var(--color-accent)",
        danger: "var(--color-danger)",
      },
      borderRadius: {
        "4xl": "2rem",
      },
    },
  },
  plugins: [],
};

export default config;
