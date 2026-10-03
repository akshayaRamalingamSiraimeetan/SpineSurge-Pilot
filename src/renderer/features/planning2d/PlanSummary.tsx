import { useMemo, useState } from 'react';
import { Save, Trash2, FolderOpen, FilePlus2 } from 'lucide-react';
import { useAppStore } from '@/lib/store';
import type { Implant, Measurement } from '@/lib/canvas/CanvasManager';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import {
    getSavedPlans, getTargets, imageBoxOf, isPlanMeasurement, loadPlan, deleteSavedPlan,
    preopVsPlanRows, registerMeasurements, saveWorkingPlan, type SavedPlan,
} from './plan';
import { metricByKey, metricValue } from './metrics';
import { useSettings } from '@/lib/settings';

/**
 * Right panel in Planning (UI9-05):
 *   • Plans — the working plan is a draft; Save stores it as Plan N; load or
 *     delete saved plans (the report lists every saved plan).
 *   • Targets — Measured · Target · Difference · Plan for TK / LL / SVA.
 *   • Preop vs Plan — every preop measurement re-measured on the planned image.
 */
const th: React.CSSProperties = { fontSize: 10, fontWeight: 700, color: 'var(--text-3)', textAlign: 'right', padding: '0 0 6px' };
const td: React.CSSProperties = { fontSize: 12.5, padding: '5px 0', textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: 'var(--text-2)' };

export function PlanSummary({ names }: { names: Record<string, string> }) {
    const activeContextId = useAppStore((s) => s.activeContextId);
    const ctxState = useAppStore((s) => s.contextStates.find((c) => c.contextId === s.activeContextId));
    const storeMeasurements = useAppStore((s) => s.measurements);
    const storeImplants = useAppStore((s) => s.implants);
    const canvas = useAppStore((s) => s.canvas);
    const managers = useAppStore((s) => s.managers);
    const measurements = ctxState?.measurements ?? storeMeasurements;
    const implants = ctxState?.implants ?? storeImplants;
    const mmPerPx = canvas.calibrationApplied ? canvas.pixelToMm : null;
    const plans = getSavedPlans(ctxState?.toolState);
    const activePlanId: string | null = ctxState?.toolState?.activePlanId ?? null;
    const activePlan = plans.find((p) => p.id === activePlanId) ?? null;
    const targets = getTargets(ctxState?.toolState);
    const [confirmDelete, setConfirmDelete] = useState<SavedPlan | null>(null);
    const [justSaved, setJustSaved] = useState<string | null>(null);

    const fragments = managers.main?.current?.data.fragments;
    const planned = useMemo(() => registerMeasurements(measurements, imageBoxOf(fragments ?? [])), [measurements, fragments]);

    const workingItems = measurements.filter(isPlanMeasurement).length + implants.length;
    // Is the working plan different from the loaded saved plan?
    const sig = (ms: Measurement[], is: Implant[]) => JSON.stringify([ms.map((m) => m.points), is.map((i) => [i.position, i.angle, i.properties])]);
    const dirty = activePlan
        ? sig(measurements.filter(isPlanMeasurement), implants as Implant[]) !== sig(activePlan.measurements, activePlan.implants)
        : workingItems > 0;

    const targetKeys = useSettings((s) => s.targetKeys);
    const targetRows = targetKeys.map((k) => {
        const mt = metricByKey(k);
        if (!mt) return null;
        return { key: k, label: mt.label, pre: metricValue(measurements, k, mmPerPx), plan: metricValue(planned, k, mmPerPx), target: targets[k] as number | undefined };
    }).filter((r): r is NonNullable<typeof r> => !!r && !!r.pre);
    // Targets have their own table; named measurements appear once (UI10-01)
    const compareRows = useMemo(
        () => preopVsPlanRows(measurements, planned, names, mmPerPx, targetKeys),
        [measurements, planned, names, mmPerPx, targetKeys],
    );
    const hasCuts = measurements.some((m) => m.toolKey.startsWith('ost-'));
    const u = (unit: string) => (unit === '°' ? '°' : ` ${unit}`);

    const save = (replace?: string) => {
        const p = saveWorkingPlan(replace);
        if (p) { setJustSaved(p.name); setTimeout(() => setJustSaved(null), 2500); }
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            {/* ── Plans ── */}
            <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                    <div style={{ fontSize: 12.5, color: 'var(--text)' }}>
                        <span style={{ fontWeight: 700 }}>{activePlan ? activePlan.name : 'New plan'}</span>
                        <span style={{ color: 'var(--text-3)' }}>{dirty ? ' · unsaved changes' : activePlan ? ' · saved' : ''}</span>
                    </div>
                    {justSaved && <span style={{ fontSize: 11, color: 'var(--range-good)' }}>Saved as {justSaved}</span>}
                </div>
                {!activeContextId ? (
                    <div style={{ fontSize: 11.5, color: 'var(--text-3)' }}>Add the patient details to save plans.</div>
                ) : (
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        {activePlan && dirty && (
                            <button onClick={() => save(activePlan.id)} style={btn(true)}>
                                <Save size={13} /> Update {activePlan.name}
                            </button>
                        )}
                        <button onClick={() => save()} disabled={workingItems === 0} style={btn(!activePlan || !dirty)}>
                            <Save size={13} /> Save as Plan {plans.length + 1}
                        </button>
                        {workingItems > 0 && (
                            <button onClick={() => void loadPlan(null)} style={btn(false)} title="Clear the working plan (saved plans are kept)">
                                <FilePlus2 size={13} /> New plan
                            </button>
                        )}
                    </div>
                )}
                {plans.length > 0 && (
                    <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 4 }}>
                        {plans.map((p) => (
                            <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', borderRadius: 8, background: p.id === activePlanId ? 'var(--accent-soft)' : 'var(--surface-2)' }}>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ fontSize: 12.5, fontWeight: 600, color: p.id === activePlanId ? 'var(--accent)' : 'var(--text)' }}>{p.name}</div>
                                    <div style={{ fontSize: 10.5, color: 'var(--text-3)' }}>
                                        {new Date(p.savedAt).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                                        {' · '}{p.measurements.filter((m) => m.toolKey.startsWith('ost-')).length} osteotomy · {p.implants.length} implant{p.implants.length === 1 ? '' : 's'}
                                    </div>
                                </div>
                                {p.id !== activePlanId && (
                                    <button title={`Continue with ${p.name}`} onClick={() => void loadPlan(p)} style={iconBtn}><FolderOpen size={14} /></button>
                                )}
                                <button title={`Delete ${p.name}`} onClick={() => setConfirmDelete(p)} style={iconBtn}><Trash2 size={13} /></button>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* ── Targets ── */}
            {targetRows.length > 0 && (
                <div>
                    <SectionTitle>Targets</SectionTitle>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead><tr>
                            <th style={{ ...th, textAlign: 'left' }}>Parameter</th><th style={th}>Measured</th><th style={th}>Target</th><th style={th}>Diff.</th><th style={th}>Plan</th>
                        </tr></thead>
                        <tbody>
                            {targetRows.map((r) => {
                                const unit = r.pre!.unit;
                                const diff = r.target != null ? r.target - r.pre!.value : null;
                                const planOff = r.target != null && r.plan ? Math.abs(r.plan.value - r.target) : null;
                                const tol = unit === '°' ? 5 : 10;
                                const planColor = planOff == null ? 'var(--text)' : planOff <= tol ? 'var(--range-good)' : planOff <= tol * 2 ? 'var(--range-borderline)' : 'var(--range-bad)';
                                return (
                                    <tr key={r.key} style={{ borderTop: '1px solid var(--border)' }}>
                                        <td style={{ ...td, textAlign: 'left', color: 'var(--text)' }}>{r.label}</td>
                                        <td style={td}>{r.pre!.value.toFixed(1)}{u(unit)}</td>
                                        <td style={{ ...td, color: 'var(--accent)' }}>{r.target != null ? `${r.target.toFixed(1)}${u(unit)}` : '—'}</td>
                                        <td style={td}>{diff != null ? `${diff > 0 ? '+' : ''}${diff.toFixed(1)}${u(unit)}` : '—'}</td>
                                        <td style={{ ...td, fontWeight: 700, color: planColor }}>{r.plan ? `${r.plan.value.toFixed(1)}${u(unit)}` : '—'}</td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                    <div style={{ fontSize: 10.5, color: 'var(--text-3)', marginTop: 6 }}>Plan colour: within 5° / 10 mm of target, within twice that, beyond.</div>
                </div>
            )}

            {/* ── Preop vs plan ── */}
            <div>
                <SectionTitle>Preop vs plan</SectionTitle>
                {compareRows.length === 0 ? (
                    <div style={{ fontSize: 11.5, color: 'var(--text-3)' }}>No preop measurements yet.</div>
                ) : (
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead><tr>
                            <th style={{ ...th, textAlign: 'left' }}>Measurement</th><th style={th}>Preop</th><th style={th}>Plan</th><th style={th}>Diff.</th>
                        </tr></thead>
                        <tbody>
                            {compareRows.map((r, i) => (
                                <tr key={i} style={{ borderTop: '1px solid var(--border)' }}>
                                    <td style={{ ...td, textAlign: 'left', color: 'var(--text)', maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r.name}>{r.name}</td>
                                    <td style={td}>{r.preop}</td>
                                    <td style={{ ...td, color: 'var(--text)', fontWeight: r.changed ? 700 : 400 }}>{r.plan}</td>
                                    <td style={{ ...td, color: r.changed ? 'var(--text)' : 'var(--text-3)' }}>{r.diff}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
                {!hasCuts && compareRows.length > 0 && (
                    <div style={{ fontSize: 10.5, color: 'var(--text-3)', marginTop: 6 }}>Add an osteotomy in Simulation to see planned values.</div>
                )}
            </div>

            <ConfirmDialog
                open={!!confirmDelete}
                onOpenChange={(o) => { if (!o) setConfirmDelete(null); }}
                title={`Delete ${confirmDelete?.name ?? 'plan'}?`}
                description="The saved plan is removed from this study and its report."
                confirmLabel="Delete plan"
                onConfirm={() => { if (confirmDelete) deleteSavedPlan(confirmDelete.id); }}
            />
        </div>
    );
}

const SectionTitle = ({ children }: { children: React.ReactNode }) => (
    <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 6 }}>{children}</div>
);
const btn = (primary: boolean): React.CSSProperties => ({
    display: 'flex', alignItems: 'center', gap: 5, height: 28, padding: '0 10px', borderRadius: 7, fontSize: 11.5, fontWeight: 600,
    background: primary ? 'var(--accent)' : 'var(--surface-2)', color: primary ? '#fff' : 'var(--text-2)', border: 'none', cursor: 'pointer',
});
const iconBtn: React.CSSProperties = { display: 'grid', placeItems: 'center', width: 26, height: 26, borderRadius: 6, color: 'var(--text-3)', background: 'transparent', border: 'none', cursor: 'pointer' };
