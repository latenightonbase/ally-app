import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { ViewStyle } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { vars } from "nativewind";
import {
  ThemeId,
  ThemeDefinition,
  THEMES,
  DEFAULT_THEME,
  getTheme,
} from "../constants/themes";

interface ThemeContextType {
  themeId: ThemeId;
  theme: ThemeDefinition;
  setTheme: (id: ThemeId) => void;
  themes: ThemeDefinition[];
  /**
   * NativeWind CSS-var style payload. Apply to a wrapper `<View style={themeVars}>`
   * for any sub-tree rendered outside the root view (e.g. portals like
   * `@gorhom/bottom-sheet`) so NativeWind utility classes resolve against the
   * active theme instead of the root `:root` fallback.
   */
  themeVars: ViewStyle;
}

const defaultVars = vars(getTheme(DEFAULT_THEME).colors) as ViewStyle;

const ThemeContext = createContext<ThemeContextType>({
  themeId: DEFAULT_THEME,
  theme: getTheme(DEFAULT_THEME),
  setTheme: () => {},
  themes: THEMES,
  themeVars: defaultVars,
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
  const themeVars = useMemo(
    () => vars(theme.colors) as ViewStyle,
    [theme.colors],
  );

  return (
    <ThemeContext.Provider
      value={{ themeId, theme, setTheme, themes: THEMES, themeVars }}
    >
      {children}
    </ThemeContext.Provider>
  );
}
