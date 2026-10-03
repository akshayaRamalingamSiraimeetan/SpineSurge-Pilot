import { useEffect, useRef, useState } from 'react';
import { FileText } from 'lucide-react';
import { useAppStore } from '@/lib/store/index';
import { cn } from '@/lib/utils';
import { useTheme } from '@/components/theme-provider';
import { buildReportModel, reportHasContent, type ReportModel } from '@/lib/report/reportModel';
import { useSettings } from '@/lib/settings';
import { useReportConfig } from '@/lib/report/useReportConfig';

/**
 * On-screen report preview — renders the SAME ReportModel the PDF uses, as a
 * page with the chosen size/orientation/accent. Live: rebuilt (debounced,
 * stale results dropped) whenever Assessment, Planning or Compare data change.
 */
const PAGE_MM = { a4: [210, 297], letter: [216, 279] } as const;

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
    const canvas             = useAppStore(s => s.canvas);
    const patients           = useAppStore(s => s.patients);
    const updateContextState = useAppStore(s => s.updateContextState);
    const [config] = useReportConfig();
    const defaultLogo = useSettings(s => s.defaultLogo);
    const defaultInstitution = useSettings(s => s.defaultInstitution);
    const configKey = JSON.stringify(config);

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
    }, [activeContextId, activeState?.measurements, activeState?.implants, activeState?.toolState?.plans, configKey,
        measurements, implants, threeDImplants, currentImage, comparison, canvas, patients, defaultLogo, defaultInstitution]);

    // Notes: controlled + per context so late-loaded notes show (RPT-21).
    const savedNotes: string = activeState?.toolState?.clinicalNotes ?? '';
    const [notes, setNotes] = useState(savedNotes);
    useEffect(() => { setNotes(savedNotes); }, [activeContextId, savedNotes]);
    const saveNotes = () => {
        if (!activeContextId || notes === savedNotes) return;
        void updateContextState(activeContextId, { toolState: { ...(activeState?.toolState || {}), clinicalNotes: notes } });
    };

    if (!model) {
        return (
            <div className="flex w-full h-full items-center justify-center">
                <div className="text-muted-foreground text-sm">{error ?? 'Preparing report preview…'}</div>
            </div>
        );
    }

    const d = model.doc;
    const [pw, ph] = PAGE_MM[d.pageSize] ?? PAGE_MM.a4;
    const [wMm, hMm] = d.orientation === 'landscape' ? [ph, pw] : [pw, ph];
    const p = model.patient;
    const empty = !reportHasContent(model);
    const card = isDark ? "bg-[var(--surface)] text-[var(--text)]" : "bg-[var(--surface)] text-[var(--text)]";

    const Title = ({ text }: { text: string }) => (
        <div>
            <h2 className="font-bold uppercase tracking-wider" style={{ color: d.accentColor, fontSize: `${1.05 * d.fontScale}rem` }}>{text}</h2>
            <div className="h-0.5 w-full mt-2 mb-4" style={{ backgroundColor: d.accentColor, opacity: 0.25 }} />
        </div>
    );

    return (
        <div className={cn("w-full h-full overflow-y-auto p-8 flex flex-col items-center gap-4", isDark ? "bg-[var(--bg)]" : "bg-[var(--surface)]")}>
            <div className="text-xs text-muted-foreground h-4">{error ?? (building ? 'Updating preview…' : 'Live preview — updates as you work')}</div>
            <div
                className={cn("shadow-xl rounded-sm shrink-0 overflow-hidden", card)}
                style={{ width: `${wMm}mm`, minHeight: `${hMm}mm`, maxWidth: '100%', fontSize: `${0.875 * d.fontScale}rem` }}
            >
                <header className="flex justify-between items-start gap-4 px-[14mm] py-[8mm] text-white" style={{ background: d.accentColor }}>
                    {d.logo && (
                        <div className="shrink-0 rounded-md bg-white p-1.5 grid place-items-center" style={{ height: '18mm', width: '18mm' }}>
                            <img src={d.logo.dataUrl} alt="Hospital logo" className="max-h-full max-w-full object-contain" />
                        </div>
                    )}
                    <div className="flex-1 min-w-0">
                        <h1 className="font-bold tracking-tight" style={{ fontSize: `${1.5 * d.fontScale}rem` }}>{d.title || 'Surgical Planning Report'}</h1>
                        <p className="opacity-90 mt-1">{[d.institution, d.department].filter(Boolean).join(' · ')}</p>
                    </div>
                    <div className="text-right text-xs space-y-1 opacity-95">
                        <p>REF {model.refNo}</p>
                        <p>Plan date {model.planDate}</p>
                        <p>Surgery date {model.visit?.surgeryDate || 'TBD'}</p>
                    </div>
                </header>

                <div className="px-[14mm] py-[8mm] space-y-8">
                    {empty && (
                        <div className="flex flex-col items-center gap-2 py-16 text-muted-foreground text-sm">
                            <FileText className="w-8 h-8 opacity-40" />
                            Nothing to report yet. Import an image and take measurements in Assessment, plan implants in Planning,
                            or add Image B in Compare — they appear here automatically.
                        </div>
                    )}
                    {model.sections.map((section) => {
                        switch (section.type) {
                            case 'patient_summary':
                                return (
                                    <section key={section.id}>
                                        <Title text={section.title} />
                                        <div className="grid grid-cols-2 gap-8">
                                            <dl className="grid grid-cols-3 gap-y-1.5">
                                                <dt className="opacity-70">Name</dt><dd className="col-span-2 font-medium">{p?.name || '—'}</dd>
                                                <dt className="opacity-70">Age / Sex</dt><dd className="col-span-2 font-medium">{p?.age || '—'} / {p?.gender ?? '—'}</dd>
                                                <dt className="opacity-70">Patient ID</dt><dd className="col-span-2 font-medium">{p?.id || '—'}</dd>
                                                <dt className="opacity-70">Diagnosis</dt><dd className="col-span-2 font-medium">{model.visit?.diagnosis || '—'}</dd>
                                            </dl>
                                            <dl className="grid grid-cols-3 gap-y-1.5">
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
                                        <Title text={section.title} />
                                        <div className={cn("grid gap-4", model.images.length > 1 ? "grid-cols-2" : "grid-cols-1")}>
                                            {model.images.map((im) => (
                                                <figure key={im.label} className={cn("flex flex-col items-center gap-2", im.fullWidth && "col-span-2")}>
                                                    <img src={im.dataUrl} alt={im.label} className="max-w-full max-h-[420px] object-contain rounded" />
                                                    <figcaption className="text-xs uppercase opacity-70">{im.label}</figcaption>
                                                </figure>
                                            ))}
                                        </div>
                                    </section>
                                );
                            case 'measurement_table':
                                if (model.measurementRows.length === 0) return null;
                                return (
                                    <section key={section.id}>
                                        <Title text={section.title} />
                                        <Table head={['#', 'Parameter', 'Level / Comments', 'Value']}
                                            rows={model.measurementRows.map((r, i) => [String(i + 1), r.parameter, r.level, r.value])} />
                                    </section>
                                );
                            case 'surgical_plan':
                            case 'instrumentation':
                                if (model.implantRows.length === 0 && model.plans.length === 0) return null;
                                return (
                                    <section key={section.id} className="space-y-6">
                                        <Title text={section.title} />
                                        {/* Every saved 2D plan (UI9-05) */}
                                        {model.plans.map((plan) => (
                                            <div key={plan.name} className="space-y-3">
                                                <div>
                                                    <div className="font-semibold">{plan.name}</div>
                                                    <div className="text-xs opacity-60">
                                                        Saved {new Date(plan.savedAt).toLocaleString()}{plan.osteotomies.length ? ` · ${plan.osteotomies.join(', ')}` : ''}
                                                    </div>
                                                </div>
                                                {plan.image && (
                                                    <img src={plan.image.dataUrl} alt={plan.name} className="mx-auto max-w-full max-h-[420px] object-contain rounded" />
                                                )}
                                                {plan.targetRows.length > 0 && (
                                                    <Table head={['Target', 'Measured', 'Target', 'Difference', 'Plan']}
                                                        rows={plan.targetRows.map((r) => [r.parameter, r.measured, r.target, r.diff, r.plan])} />
                                                )}
                                                {plan.compareRows.length > 0 && (
                                                    <Table head={['Measurement', 'Preop', 'Plan', 'Difference']}
                                                        rows={plan.compareRows.map((r) => [r.name, r.preop, r.plan, r.diff])} />
                                                )}
                                                {plan.implantRows.length > 0 && (
                                                    <Table head={['#', 'Implant', 'Location', 'Size']}
                                                        rows={plan.implantRows.map((r, i) => [String(i + 1), r.type, r.location, r.size])} />
                                                )}
                                            </div>
                                        ))}
                                        {model.implantRows.length > 0 && (
                                            <Table head={['#', 'Implant', 'Location', 'Size / Trajectory']}
                                                rows={model.implantRows.map((r, i) => [String(i + 1), r.type, r.location, r.size])} />
                                        )}
                                    </section>
                                );
                            case 'compare_table':
                                if (model.comparisonRows.length === 0) return null;
                                return (
                                    <section key={section.id}>
                                        <Title text={section.title} />
                                        <Table head={['Parameter', 'Image A', 'Image B', 'Difference']} diffCol
                                            rows={model.comparisonRows.map(r => [r.parameter, r.a, r.b, r.diff])} />
                                    </section>
                                );
                            case 'notes':
                                if (empty) return null;
                                return (
                                    <section key={section.id}>
                                        <Title text={section.title} />
                                        <textarea
                                            className={cn(
                                                "w-full min-h-[90px] p-3 rounded-lg border resize-y outline-none",
                                                isDark ? "bg-black/20 border-gray-800" : "bg-[var(--surface-2)] border-[var(--border)]",
                                            )}
                                            placeholder={activeContextId ? "Add clinical notes…" : "Save this study (add patient details) to keep notes"}
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
                <footer className="flex justify-between px-[14mm] py-[5mm] text-[10px] opacity-60 border-t" style={{ borderColor: 'var(--border)' }}>
                    <span>{d.footerText}</span>
                    <span>{model.refNo}</span>
                    {d.showPageNumbers ? <span>Page 1</span> : <span />}
                </footer>
            </div>
        </div>
    );
}

function Table({ head, rows, diffCol }: { head: string[]; rows: string[][]; diffCol?: boolean }) {
    return (
        <div className="w-full rounded-lg border overflow-hidden" style={{ borderColor: 'var(--border)' }}>
            <table className="w-full text-left">
                <thead className="text-xs uppercase" style={{ backgroundColor: 'var(--surface-2)' }}>
                    <tr>{head.map(h => <th key={h} className="px-3 py-2 font-semibold">{h}</th>)}</tr>
                </thead>
                <tbody>
                    {rows.map((r, i) => (
                        <tr key={i} className="border-t" style={{ borderColor: 'var(--border)' }}>
                            {r.map((c, j) => (
                                <td key={j} className="px-3 py-2" style={diffCol && j === 3
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
