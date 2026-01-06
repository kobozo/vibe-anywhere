'use client';

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  ReactNode,
} from 'react';
import { AppTheme } from './types';
import { themes, DEFAULT_THEME } from './themes';

interface ThemeContextValue {
  theme: AppTheme;
  themeName: string;
  setTheme: (name: string) => void;
  availableThemes: string[];
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

const STORAGE_KEY = 'session-hub-theme';

function applyThemeToDOM(theme: AppTheme) {
  const root = document.documentElement;

  // Apply all color variables
  Object.entries(theme.colors).forEach(([key, value]) => {
    // Convert camelCase to kebab-case for CSS
    const cssKey = key.replace(/([A-Z])/g, '-$1').toLowerCase();
    root.style.setProperty(`--${cssKey}`, value);
  });

  // Apply terminal colors as separate variables
  Object.entries(theme.terminal).forEach(([key, value]) => {
    const cssKey = key.replace(/([A-Z])/g, '-$1').toLowerCase();
    root.style.setProperty(`--terminal-${cssKey}`, value);
  });
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [themeName, setThemeName] = useState<string>(DEFAULT_THEME);
  const [mounted, setMounted] = useState(false);

  // Load theme from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored && themes[stored]) {
      setThemeName(stored);
    }
    setMounted(true);
  }, []);

  // Apply theme whenever it changes
  useEffect(() => {
    if (mounted) {
      const theme = themes[themeName] || themes[DEFAULT_THEME];
      applyThemeToDOM(theme);
    }
  }, [themeName, mounted]);

  const setTheme = useCallback((name: string) => {
    if (themes[name]) {
      setThemeName(name);
      localStorage.setItem(STORAGE_KEY, name);
    }
  }, []);

  const theme = themes[themeName] || themes[DEFAULT_THEME];

  // Prevent flash of unstyled content - render children but with default CSS vars
  // The CSS has default values, so content will display correctly

  return (
    <ThemeContext.Provider
      value={{
        theme,
        themeName,
        setTheme,
        availableThemes: Object.keys(themes),
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within ThemeProvider');
  }
  return context;
}
