import { useMemo, useState } from 'react';
import { useAppStore } from '@/lib/store';
import { getTargets, setTargets, type PlanTargets } from './plan';
import { metricByKey, metricValue } from './metrics';
import { useSettings } from '@/lib/settings';

/**
 * Planning → Targets (UI9-05): the corrections the surgeon aims for. Only
 * Thoracic Kyphosis, Lumbar Lordosis and SVA, and only once measured in
 * Assessment. Stored with the session (and inside each saved plan).
 */
/** Mount with `key={activeContextId}` so a different study starts fresh. */
export function TargetsPanel() {
    const activeContextId = useAppStore((s) => s.activeContextId);
    const ctxState = useAppStore((s) => s.contextStates.find((c) => c.contextId === s.activeContextId));
    const storeMeasurements = useAppStore((s) => s.measurements);
    const canvas = useAppStore((s) => s.canvas);
    const measurements = ctxState?.measurements ?? storeMeasurements;
    const mmPerPx = canvas.calibrationApplied ? canvas.pixelToMm : null;

    const saved = getTargets(ctxState?.toolState);
    const [local, setLocal] = useState<PlanTargets>(saved);
    const [drafts, setDrafts] = useState<Record<string, string>>({});
    const targets = activeContextId ? saved : local;

    // Which measurements can be targets is chosen in Settings (UI10-02)
    const targetKeys = useSettings((s) => s.targetKeys);
    const rows = useMemo(() => targetKeys
        .map((k) => metricByKey(k))
        .filter((mt): mt is NonNullable<typeof mt> => !!mt)
        .map((mt) => ({ key: mt.key, label: mt.label, current: metricValue(measurements, mt.key, mmPerPx) }))
        .filter((r) => r.current), [targetKeys, measurements, mmPerPx]);
    const targetNames = targetKeys.map((k) => metricByKey(k)?.label).filter(Boolean) as string[];

    const commit = (key: string, raw: string) => {
        const n = parseFloat(raw);
        const next: PlanTargets = { ...targets };
        if (raw.trim() === '' || !Number.isFinite(n)) delete next[key];
        else next[key] = n;
        if (!setTargets(next)) setLocal(next);
        setDrafts((d) => { const c = { ...d }; delete c[key]; return c; });
    };

    return (
        <div style={{ padding: '12px 12px 16px' }}>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--text-3)', marginBottom: 10 }}>
                Correction targets
            </div>
            {rows.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '28px 12px', fontSize: 11.5, color: 'var(--text-3)', lineHeight: 1.5 }}>
                    {targetNames.length === 0
                        ? <>Choose target measurements in <b style={{ color: 'var(--text-2)' }}>Settings</b>.</>
                        : <>Measure {targetNames.map((n, i) => <span key={n}>{i > 0 ? (i === targetNames.length - 1 ? ' or ' : ', ') : ''}<b style={{ color: 'var(--text-2)' }}>{n}</b></span>)} in Assessment to set targets.</>}
                </div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {rows.map((r) => {
                        const target = targets[r.key];
                        const draft = drafts[r.key] ?? (target != null ? String(target) : '');
                        const unit = r.current!.unit;
                        return (
                            <div key={r.key} style={{ background: 'var(--surface-2)', borderRadius: 10, padding: '10px 12px' }}>
                                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)', marginBottom: 8 }}>{r.label}</div>
                                <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
                                    <div style={{ flex: 1 }}>
                                        <div style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--text-3)', marginBottom: 3 }}>Measured</div>
                                        <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>{r.current!.value.toFixed(1)} {unit}</div>
                                    </div>
                                    <div style={{ color: 'var(--text-3)', fontSize: 16, paddingBottom: 2 }}>→</div>
                                    <label style={{ flex: 1 }}>
                                        <div style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--text-3)', marginBottom: 3 }}>Target</div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                            <input
                                                type="number" step="any" value={draft} placeholder="—"
                                                onChange={(e) => setDrafts((d) => ({ ...d, [r.key]: e.target.value }))}
                                                onBlur={(e) => commit(r.key, e.target.value)}
                                                onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                                                style={{ width: '100%', minWidth: 0, background: 'var(--surface)', border: 'none', borderRadius: 6, padding: '4px 7px', fontSize: 13, fontWeight: 700, color: 'var(--accent)', outline: 'none' }}
                                            />
                                            <span style={{ fontSize: 11, color: 'var(--text-3)' }}>{unit}</span>
                                        </div>
                                    </label>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
