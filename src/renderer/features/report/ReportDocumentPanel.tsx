import { useRef, useState } from 'react';
import { Download, Eye, FileText, RotateCcw, ImagePlus, Trash2 } from 'lucide-react';
import { readLogoFile, useSettings } from '@/lib/settings';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { useAppStore } from '@/lib/store';
import type { ReportDocumentSettings } from '@/lib/store/types';
import { useReportConfig } from '@/lib/report/useReportConfig';
import { DEFAULT_REPORT_DOCUMENT } from './defaultConfig';
import { buildReportPDF, exportReportPDF } from '@/lib/pdf/generateReportPDF';
import { cn } from '@/lib/utils';

/**
 * Report tab, right panel: document formatting (like a word processor's
 * page/format panel) + preview / export. Every control changes both the live
 * preview and the exported PDF.
 */
const ACCENTS = ['#FF453A', '#0A84FF', '#30D158', '#5E5CE6', '#FF9F0A', '#1F2937'];

const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
    <div className="px-4 py-3 border-b border-[var(--border)]">
        <div className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-3)] mb-2">{title}</div>
        <div className="space-y-2">{children}</div>
    </div>
);
const inputCls = 'w-full bg-transparent border border-[var(--border-2)] rounded-md px-2 py-1.5 text-xs text-[var(--text)] focus:outline-none focus:border-[var(--accent)]';
const Seg = <T extends string | number>({ value, options, onChange }: { value: T; options: { v: T; label: string }[]; onChange: (v: T) => void }) => (
    <div className="flex gap-1 p-0.5 rounded-lg bg-[var(--surface-3)]">
        {options.map((o) => (
            <button key={String(o.v)} onClick={() => onChange(o.v)}
                className={cn('flex-1 px-2 py-1 rounded-md text-xs font-medium transition-colors',
                    value === o.v ? 'bg-[var(--surface)] text-[var(--text)] shadow-sm' : 'text-[var(--text-3)] hover:text-[var(--text-2)]')}>
                {o.label}
            </button>
        ))}
    </div>
);

export default function ReportDocumentPanel() {
    const isOpen = useAppStore((s) => s.isRightSidebarOpen);
    const hasContext = useAppStore((s) => !!s.activeContextId);
    const [config, save] = useReportConfig();
    const doc = config.document!;
    const set = (patch: Partial<ReportDocumentSettings>) => save({ ...config, document: { ...doc, ...patch } });

    const [busy, setBusy] = useState<'preview' | 'export' | null>(null);
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);
    const [saveToRecord, setSaveToRecord] = useState(true);
    const [message, setMessage] = useState<string | null>(null);
    const defaultLogo = useSettings((s) => s.defaultLogo);
    const logoInput = useRef<HTMLInputElement>(null);
    // undefined = use the default logo from Settings; null = no logo on this report
    const logo = doc.logo === undefined ? defaultLogo : doc.logo;
    const onLogoFile = async (file: File | undefined) => {
        if (!file) return;
        try { set({ logo: await readLogoFile(file) }); setMessage(null); }
        catch (e) { setMessage(e instanceof Error ? e.message : 'Could not read the logo'); }
    };

    const preview = async () => {
        setBusy('preview'); setMessage(null);
        try {
            const { blob } = await buildReportPDF();
            setPreviewUrl(URL.createObjectURL(blob));
        } catch (e) {
            setMessage(e instanceof Error ? e.message : 'Could not build the PDF');
        } finally { setBusy(null); }
    };
    const exportPdf = async () => {
        setBusy('export'); setMessage(null);
        try {
            const r = await exportReportPDF({ saveToRecord: saveToRecord && hasContext });
            setMessage(r.uploadError ? `Downloaded, but not filed: ${r.uploadError}` : r.saved ? 'Downloaded and saved to the patient record.' : 'Downloaded.');
        } catch (e) {
            setMessage(e instanceof Error ? e.message : 'Export failed');
        } finally { setBusy(null); }
    };

    return (
        <div style={{ width: isOpen ? 300 : 0, transition: 'width .3s', overflow: 'hidden', flexShrink: 0, background: 'var(--surface)', borderLeft: isOpen ? '1px solid var(--border)' : 'none' }}>
            <div style={{ width: 300, height: '100%', display: 'flex', flexDirection: 'column' }}>
                <div className="px-4 pt-5 pb-3 flex items-center gap-2.5 border-b border-[var(--border)]">
                    <div className="w-8 h-8 rounded-lg grid place-items-center text-white" style={{ background: doc.accentColor }}><FileText size={17} /></div>
                    <div>
                        <div className="text-sm font-semibold text-[var(--text)]">Document</div>
                        <div className="text-[10px] text-[var(--text-3)]">Formatting & export</div>
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto">
                    <Section title="Hospital logo">
                        <div className="flex items-center gap-3">
                            <div className="w-14 h-14 rounded-lg border border-[var(--border-2)] bg-white grid place-items-center overflow-hidden shrink-0">
                                {logo ? <img src={logo.dataUrl} alt="Logo" className="max-w-full max-h-full object-contain" /> : <ImagePlus size={18} className="text-gray-400" />}
                            </div>
                            <div className="flex flex-col gap-1 min-w-0">
                                <button onClick={() => logoInput.current?.click()} className="text-xs font-medium text-[var(--accent)] hover:opacity-80 text-left">
                                    {logo ? 'Replace logo' : 'Upload logo'}
                                </button>
                                {logo && (
                                    <button onClick={() => set({ logo: null })} className="flex items-center gap-1 text-[11px] text-[var(--text-3)] hover:text-[var(--text-2)]">
                                        <Trash2 size={11} /> Remove from this report
                                    </button>
                                )}
                                <span className="text-[10px] text-[var(--text-3)]">
                                    {doc.logo === undefined && defaultLogo ? 'Default from Settings' : 'Shown left of the report title'}
                                </span>
                            </div>
                        </div>
                        <input ref={logoInput} type="file" accept="image/*" className="hidden"
                            onChange={(e) => { void onLogoFile(e.target.files?.[0]); e.target.value = ''; }} />
                    </Section>

                    <Section title="Header">
                        <input className={inputCls} value={doc.title} placeholder="Report title" onChange={(e) => set({ title: e.target.value })} />
                        <input className={inputCls} value={doc.institution} placeholder="Hospital / institution" onChange={(e) => set({ institution: e.target.value })} />
                        <input className={inputCls} value={doc.department} placeholder="Department" onChange={(e) => set({ department: e.target.value })} />
                    </Section>

                    <Section title="Page">
                        <Seg value={doc.pageSize} options={[{ v: 'a4', label: 'A4' }, { v: 'letter', label: 'Letter' }]} onChange={(v) => set({ pageSize: v })} />
                        <Seg value={doc.orientation} options={[{ v: 'portrait', label: 'Portrait' }, { v: 'landscape', label: 'Landscape' }]} onChange={(v) => set({ orientation: v })} />
                    </Section>

                    <Section title="Style">
                        <div className="text-[11px] text-[var(--text-3)]">Accent colour</div>
                        <div className="flex gap-2">
                            {ACCENTS.map((c) => (
                                <button key={c} onClick={() => set({ accentColor: c })} title={c}
                                    className={cn('w-6 h-6 rounded-full border-2 transition-transform', doc.accentColor === c ? 'scale-110 border-[var(--text)]' : 'border-transparent')}
                                    style={{ background: c }} />
                            ))}
                        </div>
                        <div className="text-[11px] text-[var(--text-3)] pt-1">Text size</div>
                        <Seg value={doc.fontScale} options={[{ v: 0.9, label: 'Small' }, { v: 1, label: 'Normal' }, { v: 1.12, label: 'Large' }]} onChange={(v) => set({ fontScale: v })} />
                    </Section>

                    <Section title="Footer">
                        <input className={inputCls} value={doc.footerText} placeholder="Footer text" onChange={(e) => set({ footerText: e.target.value })} />
                        <label className="flex items-center gap-2 text-xs text-[var(--text-2)]">
                            <input type="checkbox" checked={doc.showPageNumbers} onChange={(e) => set({ showPageNumbers: e.target.checked })} />
                            Page numbers
                        </label>
                    </Section>

                    <div className="px-4 py-2">
                        <button onClick={() => set({ ...DEFAULT_REPORT_DOCUMENT })} className="flex items-center gap-1.5 text-[11px] text-[var(--text-3)] hover:text-[var(--text-2)]">
                            <RotateCcw size={12} /> Reset formatting
                        </button>
                    </div>
                </div>

                <div className="p-4 border-t border-[var(--border)] space-y-2">
                    <label className={cn('flex items-center gap-2 text-xs', hasContext ? 'text-[var(--text-2)]' : 'text-[var(--text-3)] opacity-60')}>
                        <input type="checkbox" checked={saveToRecord && hasContext} disabled={!hasContext} onChange={(e) => setSaveToRecord(e.target.checked)} />
                        Save a copy to the patient record
                    </label>
                    <div className="flex gap-2">
                        <Button variant="outline" className="flex-1 h-9 text-xs" disabled={busy !== null} onClick={preview}>
                            <Eye className="w-3.5 h-3.5 mr-1.5" />{busy === 'preview' ? 'Building…' : 'Preview PDF'}
                        </Button>
                        <Button className="flex-1 h-9 text-xs text-white" style={{ background: doc.accentColor }} disabled={busy !== null} onClick={exportPdf}>
                            <Download className="w-3.5 h-3.5 mr-1.5" />{busy === 'export' ? 'Exporting…' : 'Export PDF'}
                        </Button>
                    </div>
                    {message && <div className="text-[11px] text-[var(--text-3)]">{message}</div>}
                </div>
            </div>

            <Dialog open={!!previewUrl} onOpenChange={(open) => { if (!open && previewUrl) { URL.revokeObjectURL(previewUrl); setPreviewUrl(null); } }}>
                <DialogContent className="max-w-5xl w-[90vw] h-[90vh] p-0 overflow-hidden">
                    {previewUrl && <iframe src={previewUrl} title="Report preview" className="w-full h-full border-none" />}
                </DialogContent>
            </Dialog>
        </div>
    );
}
