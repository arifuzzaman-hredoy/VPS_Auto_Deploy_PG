'use client';

import { useEffect, useState } from 'react';

type Theme = 'light' | 'dark';

const STORAGE_KEY = 'hredoy-deploy-os-theme';

export function ThemeToggle() {
  const [theme, setThemeState] = useState<Theme>('dark');

  useEffect(() => {
    const activeTheme = document.documentElement.dataset.theme === 'light' ? 'light' : 'dark';
    setThemeState(activeTheme);
  }, []);

  const applyTheme = (nextTheme: Theme) => {
    document.documentElement.dataset.theme = nextTheme;
    window.localStorage.setItem(STORAGE_KEY, nextTheme);
    setThemeState(nextTheme);
  };

  return (
    <div className="theme-switcher" role="group" aria-label="Color theme">
      <button
        type="button"
        className={theme === 'light' ? 'active' : undefined}
        aria-pressed={theme === 'light'}
        onClick={() => applyTheme('light')}
      >
        <SunIcon />
        <span>Light</span>
      </button>
      <button
        type="button"
        className={theme === 'dark' ? 'active' : undefined}
        aria-pressed={theme === 'dark'}
        onClick={() => applyTheme('dark')}
      >
        <MoonIcon />
        <span>Dark</span>
      </button>
    </div>
  );
}

function SunIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="3.5" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.42 1.42M17.65 17.65l1.42 1.42M2 12h2M20 12h2M4.93 19.07l1.42-1.42M17.65 6.35l1.42-1.42" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M20.2 15.5A8.5 8.5 0 0 1 8.5 3.8 8.5 8.5 0 1 0 20.2 15.5Z" />
    </svg>
  );
}
