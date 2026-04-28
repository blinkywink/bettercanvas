import { useState, useRef, useEffect } from 'react';
import { useTheme } from '../contexts/ThemeContext';

export function ThemeSettings() {
  const { currentTheme, changeTheme, themes } = useTheme();
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="p-2 rounded-md transition-colors"
        style={{ color: currentTheme.colors.textSecondary }}
        onMouseEnter={(e) => {
          e.currentTarget.style.backgroundColor = currentTheme.colors.background;
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.backgroundColor = 'transparent';
        }}
        title="Theme Settings"
      >
        <svg
          className="w-6 h-6"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01"
          />
        </svg>
      </button>

      {isOpen && (
        <div
          className="absolute right-0 mt-2 w-72 rounded-lg shadow-lg border z-50 p-4 max-h-[80vh] overflow-y-auto"
          style={{
            backgroundColor: currentTheme.colors.surface,
            borderColor: currentTheme.colors.border,
          }}
        >
          <h3 className="text-sm font-semibold mb-3" style={{ color: currentTheme.colors.text }}>
            Choose Theme
          </h3>
          <div className="space-y-2">
            {themes.map((theme) => (
              <button
                key={theme.name}
                onClick={() => {
                  changeTheme(theme);
                  setIsOpen(false);
                }}
                className="w-full flex items-center justify-between gap-3 p-3 rounded-md border-2 transition-all"
                style={{
                  borderColor:
                    currentTheme.name === theme.name
                      ? currentTheme.colors.primary
                      : currentTheme.colors.border,
                  backgroundColor:
                    currentTheme.name === theme.name
                      ? currentTheme.colors.background
                      : 'transparent',
                }}
                onMouseEnter={(e) => {
                  if (currentTheme.name !== theme.name) {
                    e.currentTarget.style.borderColor = currentTheme.colors.primary;
                    e.currentTarget.style.backgroundColor = currentTheme.colors.background;
                  }
                }}
                onMouseLeave={(e) => {
                  if (currentTheme.name !== theme.name) {
                    e.currentTarget.style.borderColor = currentTheme.colors.border;
                    e.currentTarget.style.backgroundColor = 'transparent';
                  }
                }}
              >
                <div className="flex items-center gap-3">
                  <span className="text-sm font-medium" style={{ color: currentTheme.colors.text }}>
                    {theme.name}
                  </span>
                  {currentTheme.name === theme.name && (
                    <svg
                      className="w-4 h-4"
                      style={{ color: currentTheme.colors.primary }}
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M5 13l4 4L19 7"
                      />
                    </svg>
                  )}
                </div>
                <div className="flex gap-1">
                  {/* Show only surface and primary colors (colors 2 and 3) */}
                  <div
                    className="w-4 h-4 rounded"
                    style={{ backgroundColor: theme.colors.surface }}
                    title="Surface"
                  />
                  <div
                    className="w-4 h-4 rounded"
                    style={{ backgroundColor: theme.colors.primary }}
                    title="Primary"
                  />
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
