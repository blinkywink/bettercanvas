// Theme definitions and utilities

export interface Theme {
  name: string;
  colors: {
    primary: string;
    secondary: string;
    accent: string;
    background: string;
    surface: string;
    text: string;
    textSecondary: string;
    border: string;
    success: string;
    warning: string;
    error: string;
    calendarBg: string;
    calendarBorder: string;
    calendarBorderOther: string;
  };
}

export const themes: Theme[] = [
  // Ocean theme (only theme)
  {
    name: 'Ocean',
    colors: {
      primary: '#38bdf8', // sky-400
      secondary: '#22d3ee', // cyan-400
      accent: '#2dd4bf', // teal-400
      background: '#0c1226', // very dark blue
      surface: '#1e293b', // slate-800 (dark gray surfaces)
      text: '#e0f2fe', // sky-100 (light blue text)
      textSecondary: '#94a3b8', // slate-400
      border: '#1e3a5f', // dark blue-gray borders
      success: '#34d399', // emerald-400
      warning: '#fbbf24', // amber-400
      error: '#f87171', // red-400
      calendarBg: '#1e293b', // slate-800 (dark gray)
      calendarBorder: '#334155', // slate-700
      calendarBorderOther: '#475569', // slate-600
    },
  },
];

// This file now only exports types and themes
// The actual useTheme hook is in contexts/ThemeContext.tsx

export function applyTheme(theme: Theme) {
  const root = document.documentElement;
  root.style.setProperty('--theme-primary', theme.colors.primary);
  root.style.setProperty('--theme-secondary', theme.colors.secondary);
  root.style.setProperty('--theme-accent', theme.colors.accent);
  root.style.setProperty('--theme-background', theme.colors.background);
  root.style.setProperty('--theme-surface', theme.colors.surface);
  root.style.setProperty('--theme-text', theme.colors.text);
  root.style.setProperty('--theme-text-secondary', theme.colors.textSecondary);
  root.style.setProperty('--theme-border', theme.colors.border);
  root.style.setProperty('--theme-success', theme.colors.success);
  root.style.setProperty('--theme-warning', theme.colors.warning);
  root.style.setProperty('--theme-error', theme.colors.error);
  root.style.setProperty('--theme-calendar-bg', theme.colors.calendarBg);
  root.style.setProperty('--theme-calendar-border', theme.colors.calendarBorder);
  root.style.setProperty('--theme-calendar-border-other', theme.colors.calendarBorderOther);
}
