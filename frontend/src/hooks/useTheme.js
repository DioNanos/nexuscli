import { useState, useEffect, useCallback } from 'react';

const THEME_STORAGE_KEY = 'nexuscli_theme';
const THEME_EVENT = 'nexus-theme-change';

function updateThemeMeta(theme) {
  const isLight = theme === 'light';
  const themeColor = isLight ? '#f7f7f8' : '#1a1a1a';
  const metaTheme = document.querySelector('meta[name="theme-color"]');
  if (metaTheme) metaTheme.setAttribute('content', themeColor);

  const metaMsTile = document.querySelector('meta[name="msapplication-TileColor"]');
  if (metaMsTile) metaMsTile.setAttribute('content', themeColor);

  const metaNav = document.querySelector('meta[name="msapplication-navbutton-color"]');
  if (metaNav) metaNav.setAttribute('content', themeColor);

  const metaApple = document.querySelector('meta[name="apple-mobile-web-app-status-bar-style"]');
  if (metaApple) metaApple.setAttribute('content', isLight ? 'default' : 'black-translucent');
}

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
    const saved = localStorage.getItem(THEME_STORAGE_KEY);
    if (saved) return saved;

    // Default to dark theme (matches current design)
    return 'dark';
  });

  useEffect(() => {
    const handleThemeEvent = (event) => {
      const nextTheme =
        event?.detail?.theme ||
        (event?.key === THEME_STORAGE_KEY ? event.newValue : null);
      if (nextTheme === 'dark' || nextTheme === 'light') {
        setThemeState((prev) => (prev === nextTheme ? prev : nextTheme));
      }
    };

    window.addEventListener(THEME_EVENT, handleThemeEvent);
    window.addEventListener('storage', handleThemeEvent);
    return () => {
      window.removeEventListener(THEME_EVENT, handleThemeEvent);
      window.removeEventListener('storage', handleThemeEvent);
    };
  }, []);

  // Apply theme class to root element
  useEffect(() => {
    const root = document.documentElement;

    if (theme === 'light') {
      root.classList.add('light-theme');
    } else {
      root.classList.remove('light-theme');
    }

    // Persist to localStorage
    localStorage.setItem(THEME_STORAGE_KEY, theme);
    updateThemeMeta(theme);
  }, [theme]);

  const toggleTheme = useCallback(() => {
    setThemeState(prev => {
      const nextTheme = prev === 'dark' ? 'light' : 'dark';
      window.dispatchEvent(new CustomEvent(THEME_EVENT, { detail: { theme: nextTheme } }));
      return nextTheme;
    });
  }, []);

  const setTheme = useCallback((newTheme) => {
    if (newTheme === 'dark' || newTheme === 'light') {
      setThemeState(newTheme);
      window.dispatchEvent(new CustomEvent(THEME_EVENT, { detail: { theme: newTheme } }));
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
