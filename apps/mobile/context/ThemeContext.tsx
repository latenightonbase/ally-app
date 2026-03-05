import React, { createContext, useContext, useEffect, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { ThemeId, ThemeDefinition, THEMES, DEFAULT_THEME, getTheme } from "../constants/themes";

interface ThemeContextType {
  themeId: ThemeId;
  theme: ThemeDefinition;
  setTheme: (id: ThemeId) => void;
  themes: ThemeDefinition[];
}

const ThemeContext = createContext<ThemeContextType>({
  themeId: DEFAULT_THEME,
  theme: getTheme(DEFAULT_THEME),
  setTheme: () => {},
  themes: THEMES,
});

export const useTheme = () => useContext(ThemeContext);

const STORAGE_KEY = "ally-theme";

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [themeId, setThemeId] = useState<ThemeId>(DEFAULT_THEME);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((stored) => {
      if (stored && THEMES.some((t) => t.id === stored)) {
        setThemeId(stored as ThemeId);
      }
    });
  }, []);

  const setTheme = (id: ThemeId) => {
    setThemeId(id);
    AsyncStorage.setItem(STORAGE_KEY, id);
  };

  const theme = getTheme(themeId);

  return (
    <ThemeContext.Provider
      value={{ themeId, theme, setTheme, themes: THEMES }}
    >
      {children}
    </ThemeContext.Provider>
  );
}
