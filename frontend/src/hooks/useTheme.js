import { useState, useEffect, useCallback } from 'react';

/**
 * useTheme - Theme management hook
 *
 * Manages dark/light theme with localStorage persistence.
 * Applies theme class to document root element.
 *
 * @returns {{ theme: string, toggleTheme: Function, setTheme: Function }}
 */
export function useTheme() {
  const [theme, setThemeState] = useState(() => {
    // Check localStorage first
    const saved = localStorage.getItem('nexuscli_theme');
    if (saved) return saved;

    // Default to dark theme (matches current design)
    return 'dark';
  });

  // Apply theme class to root element
  useEffect(() => {
    const root = document.documentElement;

    if (theme === 'light') {
      root.classList.add('light-theme');
    } else {
      root.classList.remove('light-theme');
    }

    // Persist to localStorage
    localStorage.setItem('nexuscli_theme', theme);
  }, [theme]);

  const toggleTheme = useCallback(() => {
    setThemeState(prev => prev === 'dark' ? 'light' : 'dark');
  }, []);

  const setTheme = useCallback((newTheme) => {
    if (newTheme === 'dark' || newTheme === 'light') {
      setThemeState(newTheme);
    }
  }, []);

  return {
    theme,
    isDark: theme === 'dark',
    isLight: theme === 'light',
    toggleTheme,
    setTheme
  };
}

export default useTheme;
