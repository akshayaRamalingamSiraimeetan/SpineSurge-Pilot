import { useShallow } from 'zustand/react/shallow';
import { Trash2 } from 'lucide-react';
import { useAppStore } from '@/lib/store';
import type { PlanImplant } from '@/lib/store/types';
import { rodLength, screwLength, trajectoryAngles, withScrewLength } from './implantModel';

/**
 * Right-sidebar panel for the 3D plan: implant list + editor for the selected
 * implant. Edits go through the same store actions as dragging, so every view
 * updates together.
 */

const LEVELS = ['C1', 'C2', 'C3', 'C4', 'C5', 'C6', 'C7', 'T1', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'T8', 'T9', 'T10', 'T11', 'T12', 'L1', 'L2', 'L3', 'L4', 'L5', 'S1', 'S2'];

const label = (i: PlanImplant) =>
    i.type === 'screw' ? `Screw ${i.level ?? ''}${i.side ?? ''}`.trim()
    : i.type === 'rod' ? 'Rod' : `Cage ${i.level ?? ''}`.trim();

const Field = ({ name, children }: { name: string; children: React.ReactNode }) => (
    <label className="flex items-center justify-between gap-3 text-xs py-1">
        <span className="text-[var(--text-3)]">{name}</span>
        {children}
    </label>
);
const numCls = 'w-20 bg-[var(--surface-2)] border border-[var(--border)] rounded px-2 py-1 text-right text-xs focus:outline-none focus:border-cyan-500/50';

export function PlanPanel() {
    const { implants, selectedId } = useAppStore(useShallow((s) => ({ implants: s.threeDImplants, selectedId: s.dicom3D.selectedImplantId })));
    const st = useAppStore.getState;
    const selected = implants.find((i) => i.id === selectedId) ?? null;

    const update = (imp: PlanImplant) => st().updateThreeDImplant(imp.id, imp);
    const remove = (id: string) => {
        st().removeThreeDImplant(id);
        if (st().dicom3D.selectedImplantId === id) st().setSelectedDicomImplant(null);
    };
    const clear = () => {
        st().threeDImplants.forEach((i) => st().removeThreeDImplant(i.id));
        st().setSelectedDicomImplant(null);
        st().setDicom3DMode('view');
    };
    const num = (v: string, fallback: number) => {
        const n = parseFloat(v);
        return Number.isFinite(n) && n > 0 ? n : fallback;
    };

    return (
        <div className="flex flex-col gap-4">
            <div>
                <div className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-3)] mb-1.5">Implants</div>
                {implants.length === 0 ? (
                    <div className="text-xs italic text-[var(--text-3)] py-1">No implants placed. Pick Screw, Rod or Cage on the left, then click in a view.</div>
                ) : (
                    <div className="flex flex-col gap-0.5">
                        {implants.map((i) => (
                            <div
                                key={i.id}
                                onClick={() => st().setSelectedDicomImplant(selectedId === i.id ? null : i.id)}
                                className={`flex items-center gap-2 px-2 py-1 rounded cursor-pointer text-xs ${selectedId === i.id ? 'bg-cyan-500/15 text-cyan-700 dark:text-cyan-200' : 'hover:bg-[var(--surface-2)]'}`}
                            >
                                <span className="w-1.5 h-1.5 rounded-full bg-[var(--text-2)]" />
                                <span>{label(i)}</span>
                                <span className="ml-auto font-mono text-[10px] text-[var(--text-3)]">
                                    {i.type === 'screw' ? `${screwLength(i).toFixed(0)}×${i.diameter}`
                                        : i.type === 'rod' ? `Ø${i.diameter}` : i.size.map((v) => v.toFixed(0)).join('×')}
                                </span>
                                <button className="text-[var(--text-3)] hover:text-red-400 px-1" title="Delete"
                                    onClick={(e) => { e.stopPropagation(); remove(i.id); }}>×</button>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {selected?.type === 'screw' && (() => {
                const a = trajectoryAngles(selected);
                return (
                    <div className="border-t border-[var(--border)] pt-3">
                        <div className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-3)] mb-1.5">Screw</div>
                        <Field name="Length (mm)">
                            <input type="number" step={5} min={10} max={120} className={numCls}
                                value={Math.round(screwLength(selected) * 10) / 10}
                                onChange={(e) => update(withScrewLength(selected, num(e.target.value, screwLength(selected))))} />
                        </Field>
                        <Field name="Diameter (mm)">
                            <input type="number" step={0.5} min={2} max={10} className={numCls} value={selected.diameter}
                                onChange={(e) => update({ ...selected, diameter: num(e.target.value, selected.diameter) })} />
                        </Field>
                        <Field name="Level">
                            <select className={numCls} value={selected.level ?? ''} onChange={(e) => update({ ...selected, level: e.target.value || undefined })}>
                                <option value="">—</option>
                                {LEVELS.map((l) => <option key={l} value={l} className="bg-[var(--sidebar)]">{l}</option>)}
                            </select>
                        </Field>
                        <Field name="Side">
                            <div className="flex gap-1">
                                {(['L', 'R'] as const).map((s) => (
                                    <button key={s} onClick={() => update({ ...selected, side: s })}
                                        className={`px-2 py-0.5 rounded border text-xs ${selected.side === s ? 'border-cyan-400/50 bg-cyan-500/15 text-cyan-700 dark:text-cyan-200' : 'border-[var(--border)] text-[var(--text-3)]'}`}>
                                        {s === 'L' ? 'Left' : 'Right'}
                                    </button>
                                ))}
                            </div>
                        </Field>
                        <Field name="Transverse angle"><span className="font-mono">{a.transverse.toFixed(1)}°</span></Field>
                        <Field name="Sagittal angle"><span className="font-mono">{a.sagittal.toFixed(1)}°</span></Field>
                        <p className="text-[10px] text-[var(--text-3)] mt-1">In any 2D view: drag the entry or tip to change trajectory and length, the diamond to change the diameter, the body to move it.</p>
                    </div>
                );
            })()}

            {selected?.type === 'rod' && (
                <div className="border-t border-[var(--border)] pt-3">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-3)] mb-1.5">Rod</div>
                    <Field name="Diameter (mm)">
                        <input type="number" step={0.5} min={3} max={8} className={numCls} value={selected.diameter}
                            onChange={(e) => update({ ...selected, diameter: num(e.target.value, selected.diameter) })} />
                    </Field>
                    <Field name="Length (mm)">
                        <span className="font-mono">{rodLength(selected.points).toFixed(1)}</span>
                    </Field>
                    <Field name="Points"><span className="font-mono">{selected.points.length}</span></Field>
                </div>
            )}

            {selected?.type === 'cage' && (
                <div className="border-t border-[var(--border)] pt-3">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-3)] mb-1.5">Cage</div>
                    {(['Width', 'Depth', 'Height'] as const).map((n, idx) => (
                        <Field key={n} name={`${n} (mm)`}>
                            <input type="number" step={1} min={4} max={60} className={numCls} value={selected.size[idx]}
                                onChange={(e) => {
                                    const size = [...selected.size] as [number, number, number];
                                    size[idx] = num(e.target.value, size[idx]);
                                    update({ ...selected, size });
                                }} />
                        </Field>
                    ))}
                    <Field name="Level">
                        <select className={numCls} value={selected.level ?? ''} onChange={(e) => update({ ...selected, level: e.target.value || undefined })}>
                            <option value="">—</option>
                            {LEVELS.map((l) => <option key={l} value={l} className="bg-[var(--sidebar)]">{l}</option>)}
                        </select>
                    </Field>
                </div>
            )}

            <button
                onClick={clear}
                disabled={implants.length === 0}
                className="mt-1 flex items-center justify-center gap-2 h-9 rounded-lg border text-xs font-semibold disabled:opacity-40 border-red-500/30 text-red-400 hover:bg-red-500/10"
            >
                <Trash2 className="w-4 h-4" /> Clear plan
            </button>
        </div>
    );
}
