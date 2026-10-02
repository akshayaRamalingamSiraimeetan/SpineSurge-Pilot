import { Moon, Sun } from 'lucide-react';
import { useTheme } from '@/components/theme-provider';
import { cn } from '@/lib/utils';

/** Small light/dark switch — one implementation used everywhere. */
export function ThemeToggle({ className }: { className?: string }) {
    const { resolvedTheme, setTheme } = useTheme();
    const isDark = resolvedTheme === 'dark';
    return (
        <button
            onClick={() => setTheme(isDark ? 'light' : 'dark')}
            title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
            aria-label="Toggle light/dark mode"
            className={cn(
                'grid place-items-center h-8 w-8 rounded-lg border border-[var(--border-2)] text-[var(--text-2)] hover:text-[var(--text)] hover:bg-[var(--surface-3)] transition-colors',
                className,
            )}
        >
            {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </button>
    );
}
