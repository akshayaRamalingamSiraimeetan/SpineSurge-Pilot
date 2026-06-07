/* Applies the persisted theme to <html data-theme> (the selector tokens.css keys dark mode on)
   and exposes the theme controls. */
import { useEffect } from 'react';
import { useUiStore } from '@/lib/store/ui';

export function useTheme() {
  const theme = useUiStore((s) => s.theme);
  const setTheme = useUiStore((s) => s.setTheme);
  const toggleTheme = useUiStore((s) => s.toggleTheme);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  return { theme, setTheme, toggleTheme };
}
