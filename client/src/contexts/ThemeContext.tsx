import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { Theme, themes, applyTheme } from '../hooks/useTheme';

interface ThemeContextType {
  currentTheme: Theme;
  changeTheme: (theme: Theme) => void;
  themes: Theme[];
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ children, profileId = 'default' }: { children: ReactNode; profileId?: string }) {
  const [currentTheme, setCurrentTheme] = useState<Theme>(themes[0]);

  useEffect(() => {
    const loadTheme = async () => {
      try {
        const response = await fetch(`/api/user-state/theme?profile=${profileId}`);
        if (response.ok) {
          const data = await response.json();
          if (data.themeName) {
            const theme = themes.find((t) => t.name === data.themeName);
            if (theme) {
              setCurrentTheme(theme);
              applyTheme(theme);
              return;
            }
          }
        }
      } catch (error) {
        console.error('Error loading theme:', error);
      }
      // Default theme if no saved theme or error
      applyTheme(themes[0]);
    };
    
    loadTheme();
  }, [profileId]);

      const changeTheme = useCallback((theme: Theme) => {
        setCurrentTheme(theme);
        applyTheme(theme);
        
        // Save to server
        const tabId = sessionStorage.getItem('bct-tab-id') || '';
        fetch(`/api/user-state/theme?profile=${profileId}`, {
          method: 'PUT',
          headers: { 
            'Content-Type': 'application/json',
            'X-Tab-ID': tabId,
          },
          body: JSON.stringify({ themeName: theme.name }),
        })
        .then(async response => {
          if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Failed to save theme: ${response.status} ${errorText}`);
          }
          console.log('Successfully saved theme:', theme.name);
        })
        .catch(error => {
          console.error('Error saving theme:', error);
          alert(`Failed to save theme: ${error.message}`);
        });
      }, [profileId]);

      // Real-time sync disabled - user will manually refresh if needed

  return (
    <ThemeContext.Provider value={{ currentTheme, changeTheme, themes }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}
