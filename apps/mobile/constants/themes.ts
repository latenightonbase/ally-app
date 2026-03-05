export type ThemeId =
  | "sand-light"
  | "sand-dark"
  | "terra-light"
  | "terra-dark"
  | "lav-light"
  | "lav-dark"
  | "honey-light"
  | "honey-dark";

export type ThemeColors = Record<`--${string}`, string> & {
  "--color-primary": string;
  "--color-primary-soft": string;
  "--color-secondary": string;
  "--color-accent": string;
  "--color-background": string;
  "--color-surface": string;
  "--color-foreground": string;
  "--color-muted": string;
  "--color-danger": string;
};

export interface ThemeDefinition {
  id: ThemeId;
  label: string;
  isDark: boolean;
  colors: ThemeColors;
  preview: {
    background: string;
    primary: string;
    surface: string;
  };
}

export const THEMES: ThemeDefinition[] = [
  {
    id: "sand-light",
    label: "Sand & Sage",
    isDark: false,
    colors: {
      "--color-primary": "#7C9A72",
      "--color-primary-soft": "rgba(124, 154, 114, 0.12)",
      "--color-secondary": "#C4A95B",
      "--color-accent": "#A8C49E",
      "--color-background": "#FAF7F2",
      "--color-surface": "#F5F0E8",
      "--color-foreground": "#2D2A26",
      "--color-muted": "#A09A90",
      "--color-danger": "#C75D5D",
    },
    preview: { background: "#FAF7F2", primary: "#7C9A72", surface: "#F5F0E8" },
  },
  {
    id: "sand-dark",
    label: "Sand & Sage Dark",
    isDark: true,
    colors: {
      "--color-primary": "#98B88E",
      "--color-primary-soft": "rgba(152, 184, 142, 0.15)",
      "--color-secondary": "#D4B96B",
      "--color-accent": "#7C9A72",
      "--color-background": "#1A1714",
      "--color-surface": "#2A2520",
      "--color-foreground": "#F5F0E8",
      "--color-muted": "#6B6560",
      "--color-danger": "#D47A7A",
    },
    preview: { background: "#1A1714", primary: "#98B88E", surface: "#2A2520" },
  },
  {
    id: "terra-light",
    label: "Terracotta & Clay",
    isDark: false,
    colors: {
      "--color-primary": "#C47A5A",
      "--color-primary-soft": "rgba(196, 122, 90, 0.12)",
      "--color-secondary": "#A65D3F",
      "--color-accent": "#D4947A",
      "--color-background": "#F8F4EE",
      "--color-surface": "#F5F0E8",
      "--color-foreground": "#2E1F14",
      "--color-muted": "#A3917F",
      "--color-danger": "#C75050",
    },
    preview: { background: "#F8F4EE", primary: "#C47A5A", surface: "#F5F0E8" },
  },
  {
    id: "terra-dark",
    label: "Terracotta Dark",
    isDark: true,
    colors: {
      "--color-primary": "#D4917A",
      "--color-primary-soft": "rgba(212, 145, 122, 0.15)",
      "--color-secondary": "#B87A5E",
      "--color-accent": "#C47A5A",
      "--color-background": "#1B1210",
      "--color-surface": "#2C1F1A",
      "--color-foreground": "#F5F0E8",
      "--color-muted": "#7A6A5C",
      "--color-danger": "#D47A7A",
    },
    preview: { background: "#1B1210", primary: "#D4917A", surface: "#2C1F1A" },
  },
  {
    id: "lav-light",
    label: "Lavender & Stone",
    isDark: false,
    colors: {
      "--color-primary": "#8B7AAF",
      "--color-primary-soft": "rgba(139, 122, 175, 0.12)",
      "--color-secondary": "#A393C5",
      "--color-accent": "#B3A5D0",
      "--color-background": "#FAF7F2",
      "--color-surface": "#F5F0E8",
      "--color-foreground": "#2A2535",
      "--color-muted": "#908A82",
      "--color-danger": "#B85C5C",
    },
    preview: { background: "#FAF7F2", primary: "#8B7AAF", surface: "#F5F0E8" },
  },
  {
    id: "lav-dark",
    label: "Lavender Dark",
    isDark: true,
    colors: {
      "--color-primary": "#A899C8",
      "--color-primary-soft": "rgba(168, 153, 200, 0.15)",
      "--color-secondary": "#B3A5D0",
      "--color-accent": "#8B7AAF",
      "--color-background": "#16131C",
      "--color-surface": "#221E2C",
      "--color-foreground": "#EDE8F4",
      "--color-muted": "#605A6C",
      "--color-danger": "#D47A7A",
    },
    preview: { background: "#16131C", primary: "#A899C8", surface: "#221E2C" },
  },
  {
    id: "honey-light",
    label: "Honey & Forest",
    isDark: false,
    colors: {
      "--color-primary": "#3D6B4E",
      "--color-primary-soft": "rgba(61, 107, 78, 0.12)",
      "--color-secondary": "#D4A843",
      "--color-accent": "#6B9B78",
      "--color-background": "#F8F4EE",
      "--color-surface": "#F5F0E8",
      "--color-foreground": "#1C2E1F",
      "--color-muted": "#8A9080",
      "--color-danger": "#C75D5D",
    },
    preview: { background: "#F8F4EE", primary: "#3D6B4E", surface: "#F5F0E8" },
  },
  {
    id: "honey-dark",
    label: "Honey & Forest Dark",
    isDark: true,
    colors: {
      "--color-primary": "#6B9B78",
      "--color-primary-soft": "rgba(107, 155, 120, 0.15)",
      "--color-secondary": "#E0BA58",
      "--color-accent": "#3D6B4E",
      "--color-background": "#111A14",
      "--color-surface": "#1C2B20",
      "--color-foreground": "#EDE8D8",
      "--color-muted": "#5C695E",
      "--color-danger": "#D47A7A",
    },
    preview: { background: "#111A14", primary: "#6B9B78", surface: "#1C2B20" },
  },
];

export const DEFAULT_THEME: ThemeId = "sand-light";

export function getTheme(id: ThemeId): ThemeDefinition {
  return THEMES.find((t) => t.id === id) ?? THEMES[0];
}
