import { useEffect, useRef, useState } from 'react';
import { useAppStore } from '@/lib/store/index';
import { cn } from '@/lib/utils';
import { useTheme } from '@/components/theme-provider';
import { buildReportModel, type ReportModel } from '@/lib/report/reportModel';

/**
 * On-screen report preview. Renders the SAME ReportModel the PDF is built
 * from (lib/report/reportModel.ts), so preview and export always match.
 * The model is rebuilt (debounced, stale results dropped) when its inputs change.
 */
export default function ReportBuilderWorkspace() {
    const { resolvedTheme } = useTheme();
    const isDark = resolvedTheme === "dark";

    const activeContextId    = useAppStore(s => s.activeContextId);
    const contextStates      = useAppStore(s => s.contextStates);
    const measurements       = useAppStore(s => s.measurements);
    const implants           = useAppStore(s => s.implants);
    const threeDImplants     = useAppStore(s => s.threeDImplants);
    const currentImage       = useAppStore(s => s.currentImage);
    const comparison         = useAppStore(s => s.comparison);
    const isComparisonMode   = useAppStore(s => s.isComparisonMode);
    const canvas             = useAppStore(s => s.canvas);
    const patients           = useAppStore(s => s.patients);
    const updateContextState = useAppStore(s => s.updateContextState);

    const activeState = contextStates.find((s) => s.contextId === activeContextId);

    const [model, setModel] = useState<ReportModel | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [building, setBuilding] = useState(false);
    const buildSeq = useRef(0);

    useEffect(() => {
        const seq = ++buildSeq.current;
        setBuilding(true);
        const timer = setTimeout(async () => {
            try {
                const next = await buildReportModel(useAppStore.getState(), { withImages: true });
                if (seq !== buildSeq.current) return;
                setModel(next);
                setError(null);
            } catch (e) {
                if (seq !== buildSeq.current) return;
                setError(e instanceof Error ? e.message : 'Could not build the report preview');
            } finally {
                if (seq === buildSeq.current) setBuilding(false);
            }
        }, 250);
        return () => clearTimeout(timer);
    }, [activeContextId, activeState?.reportConfig, activeState?.measurements, activeState?.implants,
        measurements, implants, threeDImplants, currentImage, comparison, isComparisonMode, canvas, patients]);

    // Notes: controlled + keyed per context so late-loaded notes show (RPT-21).
    const savedNotes: string = activeState?.toolState?.clinicalNotes ?? '';
    const [notes, setNotes] = useState(savedNotes);
    useEffect(() => { setNotes(savedNotes); }, [activeContextId, savedNotes]);

    const saveNotes = () => {
        if (!activeContextId || notes === savedNotes) return;
        void updateContextState(activeContextId, {
            toolState: { ...(activeState?.toolState || {}), clinicalNotes: notes },
        });
    };

    if (!model) {
        return (
            <div className="flex w-full h-full items-center justify-center">
                <div className="text-muted-foreground text-sm">
                    {error ?? 'Preparing report preview…'}
                </div>
            </div>
        );
    }

    const p = model.patient;
    const card = isDark ? "bg-[#141416] text-[#F5F5F7]" : "bg-white text-slate-900";

    return (
        <div className={cn("w-full h-full overflow-y-auto p-8 flex flex-col items-center gap-6", isDark ? "bg-[#0A0A0B]" : "bg-gray-100")}>
            {(building || error) && (
                <div className="text-xs text-muted-foreground">{error ?? 'Updating preview…'}</div>
            )}
            <div className={cn("w-full max-w-[210mm] min-h-[297mm] p-[16mm] shadow-xl rounded-sm shrink-0", card)}>
                <header className="flex justify-between items-start border-b pb-6 mb-8" style={{ borderColor: 'rgba(255, 69, 58, 0.3)' }}>
                    <div>
                        <h1 className="text-3xl font-bold tracking-tight mb-1" style={{ color: '#FF453A' }}>SPINESURGE</h1>
                        <p className="text-sm opacity-70">Department of Spine Surgery · Plan Documentation</p>
                    </div>
                    <div className="text-right text-sm space-y-1 opacity-80">
                        <p>REF: {model.refNo}</p>
                        <p>PLAN DATE: {model.planDate}</p>
                        {model.kind === 'comparison' ? (
                            <>
                                <p>PRE-OP: {model.preOpDate ?? '—'}</p>
                                <p>POST-OP: {model.postOpDate ?? '—'}</p>
                            </>
                        ) : (
                            <p>SURGERY DATE: {model.visit?.surgeryDate || 'TBD'}</p>
                        )}
                    </div>
                </header>

                <div className="space-y-10">
                    {model.sections.map((section) => {
                        const title = (
                            <div>
                                <h2 className="text-lg font-bold uppercase tracking-wider" style={{ color: '#FF453A' }}>{section.title}</h2>
                                <div className="h-0.5 w-full mt-2 mb-5" style={{ backgroundColor: 'rgba(255, 69, 58, 0.2)' }} />
                            </div>
                        );
                        switch (section.type) {
                            case 'patient_summary':
                                return (
                                    <section key={section.id}>
                                        {title}
                                        <div className="grid grid-cols-2 gap-8 text-sm">
                                            <dl className="grid grid-cols-3 gap-y-2">
                                                <dt className="opacity-70">Name</dt><dd className="col-span-2 font-medium">{p?.name || '—'}</dd>
                                                <dt className="opacity-70">Age / Sex</dt><dd className="col-span-2 font-medium">{p?.age ?? '—'} / {p?.gender ?? '—'}</dd>
                                                <dt className="opacity-70">Patient ID</dt><dd className="col-span-2 font-medium">{p?.id || '—'}</dd>
                                                <dt className="opacity-70">Diagnosis</dt><dd className="col-span-2 font-medium">{model.visit?.diagnosis || '—'}</dd>
                                            </dl>
                                            <dl className="grid grid-cols-3 gap-y-2">
                                                <dt className="opacity-70">Surgeon</dt><dd className="col-span-2 font-medium">{model.surgeon.name}</dd>
                                                <dt className="opacity-70">Title</dt><dd className="col-span-2 font-medium">{model.surgeon.title}</dd>
                                                <dt className="opacity-70">Department</dt><dd className="col-span-2 font-medium">{model.surgeon.department}</dd>
                                            </dl>
                                        </div>
                                    </section>
                                );
                            case 'images':
                                if (model.images.length === 0) return null;
                                return (
                                    <section key={section.id}>
                                        {title}
                                        <div className={cn("grid gap-4", model.images.length > 1 ? "grid-cols-2" : "grid-cols-1")}>
                                            {model.images.map((im) => (
                                                <figure key={im.label} className="flex flex-col items-center gap-2">
                                                    <img src={im.dataUrl} alt={im.label} className="max-w-full max-h-[420px] object-contain rounded shadow" />
                                                    <figcaption className="text-xs uppercase opacity-70">{im.label}</figcaption>
                                                </figure>
                                            ))}
                                        </div>
                                    </section>
                                );
                            case 'measurement_table':
                            case 'compare_table':
                                if (model.kind === 'comparison') {
                                    if (model.comparisonRows.length === 0) return null;
                                    return (
                                        <section key={section.id}>
                                            {title}
                                            <Table head={['Parameter', 'Image A', 'Image B', 'Difference']}
                                                rows={model.comparisonRows.map(r => [r.parameter, r.a, r.b, r.diff])} />
                                        </section>
                                    );
                                }
                                if (section.type !== 'measurement_table' || model.measurementRows.length === 0) return null;
                                return (
                                    <section key={section.id}>
                                        {title}
                                        <Table head={['#', 'Parameter', 'Level / Comments', 'Value']}
                                            rows={model.measurementRows.map((r, i) => [String(i + 1), r.parameter, r.level, r.value])} />
                                    </section>
                                );
                            case 'surgical_plan':
                            case 'instrumentation':
                                if (model.implantRows.length === 0) return null;
                                return (
                                    <section key={section.id}>
                                        {title}
                                        <Table head={['#', 'Implant', 'Location', 'Size']}
                                            rows={model.implantRows.map((r, i) => [String(i + 1), r.type, r.location, r.size])} />
                                    </section>
                                );
                            case 'notes':
                                return (
                                    <section key={section.id}>
                                        {title}
                                        <textarea
                                            className={cn(
                                                "w-full min-h-[100px] p-4 rounded-lg border resize-y outline-none focus:border-[#FF453A]",
                                                isDark ? "bg-black/20 border-gray-800" : "bg-gray-50 border-gray-200",
                                            )}
                                            placeholder={activeContextId ? "Add clinical notes…" : "Save this case as a study to add notes"}
                                            disabled={!activeContextId}
                                            value={notes}
                                            onChange={(e) => setNotes(e.target.value)}
                                            onBlur={saveNotes}
                                        />
                                    </section>
                                );
                            default:
                                return null;
                        }
                    })}
                </div>
            </div>
        </div>
    );
}

function Table({ head, rows }: { head: string[]; rows: string[][] }) {
    return (
        <div className="w-full rounded-lg border overflow-hidden" style={{ borderColor: 'var(--border)' }}>
            <table className="w-full text-sm text-left">
                <thead className="text-xs uppercase" style={{ backgroundColor: 'var(--surface-2)' }}>
                    <tr>{head.map(h => <th key={h} className="px-4 py-3 font-semibold">{h}</th>)}</tr>
                </thead>
                <tbody>
                    {rows.map((r, i) => (
                        <tr key={i} className="border-t" style={{ borderColor: 'var(--border)' }}>
                            {r.map((c, j) => (
                                <td key={j} className="px-4 py-2.5" style={j === 3 && head[3] === 'Difference'
                                    ? { color: c.startsWith('+') ? '#34C759' : c.startsWith('-') ? '#FF453A' : undefined } : undefined}>
                                    {c}
                                </td>
                            ))}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}
