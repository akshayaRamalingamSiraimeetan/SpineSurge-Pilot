import { useRef, useState } from 'react';
import { ImagePlus, Moon, Sun, Monitor, ChevronDown, Check } from 'lucide-react';
import { DropdownMenu, DropdownMenuItem, DropdownMenuContent, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { METRICS } from '@/features/planning2d/metrics';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useTheme } from '@/components/theme-provider';
import { readLogoFile, useSettings } from '@/lib/settings';
import { cn } from '@/lib/utils';

/**
 * User settings (BUGS UI6-11): appearance, report defaults and measuring
 * behaviour. Kept small on purpose; stored in this browser.
 */
const Row = ({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) => (
    <div className="flex items-center justify-between gap-4 py-2.5">
        <div className="min-w-0">
            <div className="text-sm font-medium text-[var(--text)]">{title}</div>
            {hint && <div className="text-xs text-[var(--text-3)] mt-0.5">{hint}</div>}
        </div>
        <div className="shrink-0">{children}</div>
    </div>
);

const Group = ({ title, children }: { title: string; children: React.ReactNode }) => (
    <div className="py-2">
        <div className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-3)] mb-1">{title}</div>
        <div className="divide-y divide-[var(--border)]">{children}</div>
    </div>
);

const Switch = ({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) => (
    <button
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={cn('relative h-5 w-9 rounded-full transition-colors', checked ? 'bg-[var(--accent)]' : 'bg-[var(--surface-3)] border border-[var(--border-2)]')}
    >
        <span className={cn('absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all', checked ? 'left-[18px]' : 'left-0.5')} />
    </button>
);

export function SettingsDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
    const { theme, setTheme } = useTheme();
    const s = useSettings();
    const fileRef = useRef<HTMLInputElement>(null);
    const [logoError, setLogoError] = useState<string | null>(null);
    const [toolbarReset, setToolbarReset] = useState(false);

    const onLogo = async (file: File | undefined) => {
        if (!file) return;
        try { s.set({ defaultLogo: await readLogoFile(file) }); setLogoError(null); }
        catch (e) { setLogoError(e instanceof Error ? e.message : 'Could not read the logo'); }
    };

    const themes = [
        { v: 'light', label: 'Light', icon: Sun },
        { v: 'dark', label: 'Dark', icon: Moon },
        { v: 'system', label: 'System', icon: Monitor },
    ] as const;

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>Settings</DialogTitle>
                    <DialogDescription>Preferences for this browser.</DialogDescription>
                </DialogHeader>

                <Group title="Appearance">
                    <Row title="Theme">
                        <div className="flex gap-1 p-0.5 rounded-lg bg-[var(--surface-3)]">
                            {themes.map(({ v, label, icon: Icon }) => (
                                <button key={v} onClick={() => setTheme(v)}
                                    className={cn('flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium transition-colors',
                                        theme === v ? 'bg-[var(--surface)] text-[var(--text)] shadow-sm' : 'text-[var(--text-3)] hover:text-[var(--text-2)]')}>
                                    <Icon className="h-3 w-3" />{label}
                                </button>
                            ))}
                        </div>
                    </Row>
                </Group>

                <Group title="Reports">
                    <Row title="Default hospital logo" hint={logoError ?? 'Used on reports unless a report sets its own.'}>
                        <div className="flex items-center gap-2">
                            <button onClick={() => fileRef.current?.click()} title="Upload logo"
                                className="h-10 w-10 rounded-lg border border-[var(--border-2)] bg-white grid place-items-center overflow-hidden">
                                {s.defaultLogo ? <img src={s.defaultLogo.dataUrl} alt="Logo" className="max-h-full max-w-full object-contain" /> : <ImagePlus className="h-4 w-4 text-gray-400" />}
                            </button>
                            {s.defaultLogo && (
                                <button onClick={() => s.set({ defaultLogo: null })} className="text-xs text-[var(--text-3)] hover:text-[var(--text)]">Remove</button>
                            )}
                            <input ref={fileRef} type="file" accept="image/*" className="hidden"
                                onChange={(e) => { void onLogo(e.target.files?.[0]); e.target.value = ''; }} />
                        </div>
                    </Row>
                    <Row title="Default institution" hint="Pre-filled in the report header.">
                        <input
                            value={s.defaultInstitution}
                            onChange={(e) => s.set({ defaultInstitution: e.target.value })}
                            placeholder="Hospital name"
                            className="w-44 bg-transparent border border-[var(--border-2)] rounded-md px-2 py-1.5 text-xs text-[var(--text)] focus:outline-none focus:border-[var(--accent)]"
                        />
                    </Row>
                </Group>

                <Group title="Planning">
                    <Row title="Target measurements" hint="Shown in Planning → Targets, compared with the plan.">
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <button className="flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-md bg-[var(--surface-2)] text-[var(--text)] hover:bg-[var(--surface-3)]">
                                    {s.targetKeys.length === 0 ? 'None' : `${s.targetKeys.length} selected`}
                                    <ChevronDown className="h-3.5 w-3.5 text-[var(--text-3)]" />
                                </button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-64 max-h-80 overflow-y-auto">
                                {(['alignment', 'extended'] as const).map((tab, ti) => (
                                    <div key={tab}>
                                        {ti > 0 && <DropdownMenuSeparator />}
                                        <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-[var(--text-3)]">{tab === 'alignment' ? 'Alignment' : 'Extended'}</DropdownMenuLabel>
                                        {METRICS.filter((m) => m.tab === tab).map((m) => {
                                            const on = s.targetKeys.includes(m.key);
                                            // Round red indicator — clearly visible in both themes (UI12-01)
                                            return (
                                                <DropdownMenuItem
                                                    key={m.key}
                                                    role="menuitemcheckbox"
                                                    aria-checked={on}
                                                    onSelect={(e) => {
                                                        e.preventDefault();
                                                        s.set({ targetKeys: on ? s.targetKeys.filter((k) => k !== m.key) : [...s.targetKeys, m.key] });
                                                    }}
                                                    className="gap-2.5 cursor-pointer"
                                                >
                                                    <span className={cn('flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border-2 transition-colors',
                                                        on ? 'bg-[var(--accent)] border-[var(--accent)]' : 'bg-transparent border-[var(--text-3)]')}>
                                                        {on && <Check className="h-3 w-3 text-white" strokeWidth={3.5} />}
                                                    </span>
                                                    <span className={on ? 'font-medium text-[var(--text)]' : 'text-[var(--text-2)]'}>{m.label}</span>
                                                </DropdownMenuItem>
                                            );
                                        })}
                                    </div>
                                ))}
                            </DropdownMenuContent>
                        </DropdownMenu>
                    </Row>
                </Group>

                <Group title="Measuring">
                    <Row title="Snap to existing points" hint="Clicks near a placed point reuse it exactly.">
                        <Switch checked={s.snapToPoints} onChange={(v) => s.set({ snapToPoints: v })} />
                    </Row>
                    <Row title="Reuse landmarks" hint="New tools pre-fill points already placed (femoral heads, S1, C7…).">
                        <Switch checked={s.reuseLandmarks} onChange={(v) => s.set({ reuseLandmarks: v })} />
                    </Row>
                    <Row title="Image toolbar position" hint="Dock it back to the right edge of the canvas.">
                        <button onClick={() => { s.resetToolbar(); setToolbarReset(true); }}
                            className="text-xs font-medium px-2.5 py-1.5 rounded-md border border-[var(--border-2)] text-[var(--text-2)] hover:text-[var(--text)] hover:bg-[var(--surface-3)]">
                            {toolbarReset ? 'Reset ✓' : 'Reset'}
                        </button>
                    </Row>
                </Group>
            </DialogContent>
        </Dialog>
    );
}
