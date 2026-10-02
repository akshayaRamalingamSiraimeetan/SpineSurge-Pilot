import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { useAppStore } from "@/lib/store/index";
import { api } from "@/lib/api";
import { buildReportModel, reportHasContent, type ReportModel } from "@/lib/report/reportModel";

/**
 * PDF = pure function of a ReportModel (lib/report/reportModel.ts). No DOM
 * scraping, no randomness: the same model always produces the same document.
 */

const ACCENT: [number, number, number] = [255, 69, 58];
const TEXT: [number, number, number] = [71, 85, 105];
const HEAD: [number, number, number] = [30, 41, 59];
const TABLE_STYLES = {
    theme: 'grid' as const,
    styles: { fontSize: 9, cellPadding: 4, textColor: TEXT, lineColor: [210, 215, 225] as [number, number, number], lineWidth: 0.3, font: 'helvetica', overflow: 'linebreak' as const },
    headStyles: { fillColor: ACCENT, textColor: [255, 255, 255] as [number, number, number], fontStyle: 'bold' as const, fontSize: 9.5, halign: 'center' as const },
    alternateRowStyles: { fillColor: [248, 250, 252] as [number, number, number] },
    margin: { left: 15, right: 15, bottom: 20 },
};

export function renderReportPDF(model: ReportModel): jsPDF {
    const doc = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4' });
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const p = model.patient;

    // ── Header ───────────────────────────────────────────────────────────────
    doc.setFillColor(...ACCENT);
    doc.rect(0, 0, pageWidth, 40, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.text('SPINESURGE', 15, 17);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.text('Department of Spine Surgery · Plan Documentation', 15, 24);
    doc.text(
        model.kind === 'comparison' ? 'COMPARISON REPORT' : model.kind === 'planning3d' ? '3D SURGICAL PLAN' : 'PLANNING REPORT',
        15, 31,
    );
    const rx = pageWidth - 15;
    doc.text(`REF: ${model.refNo}`, rx, 15, { align: 'right' });
    doc.text(`PLAN DATE: ${model.planDate}`, rx, 21, { align: 'right' });
    if (model.kind === 'comparison') {
        doc.text(`PRE-OP: ${model.preOpDate ?? '—'}`, rx, 27, { align: 'right' });
        doc.text(`POST-OP: ${model.postOpDate ?? '—'}`, rx, 33, { align: 'right' });
    } else {
        doc.text(`SURGERY DATE: ${model.visit?.surgeryDate || 'TBD'}`, rx, 27, { align: 'right' });
    }

    let y = 50;
    const ensure = (h: number) => {
        if (y + h > pageHeight - 22) { doc.addPage(); y = 20; }
    };
    const heading = (title: string) => {
        ensure(16);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(12);
        doc.setTextColor(...HEAD);
        doc.text(title.toUpperCase(), 15, y);
        doc.setDrawColor(...ACCENT);
        doc.setLineWidth(0.8);
        doc.line(15, y + 2, pageWidth - 15, y + 2);
        y += 9;
    };
    const afterTable = () => { y = ((doc as any).lastAutoTable?.finalY ?? y) + 10; };

    for (const section of model.sections) {
        switch (section.type) {
            case 'patient_summary': {
                heading(section.title);
                const left: [string, string][] = [
                    ['Name', p?.name || '—'],
                    ['Age / Sex', `${p?.age ?? '—'} / ${p?.gender ?? '—'}`],
                    ['Patient ID', p?.id || '—'],
                    ['DOB', p?.dob || '—'],
                    ['Diagnosis', model.visit?.diagnosis || '—'],
                ];
                const right: [string, string][] = [
                    ['Surgeon', model.surgeon.name],
                    ['Title', model.surgeon.title],
                    ['Department', model.surgeon.department],
                    ['Visit', model.visit?.visitNumber || '—'],
                ];
                doc.setFontSize(9);
                const rows = Math.max(left.length, right.length);
                ensure(rows * 5 + 4);
                for (let i = 0; i < rows; i++) {
                    for (const [col, list] of [[15, left], [pageWidth / 2 + 5, right]] as const) {
                        const item = list[i];
                        if (!item) continue;
                        doc.setFont('helvetica', 'bold'); doc.setTextColor(...TEXT);
                        doc.text(`${item[0]}:`, col, y);
                        doc.setFont('helvetica', 'normal');
                        doc.text(String(item[1]), col + 24, y);
                    }
                    y += 5;
                }
                y += 6;
                break;
            }
            case 'images': {
                if (model.images.length === 0) break;
                heading(section.title);
                const maxW = pageWidth - 30;
                if (model.images.length >= 2) {
                    const gap = 5;
                    const w = (maxW - gap) / 2;
                    const h = Math.min(110, Math.max(...model.images.slice(0, 2).map((im) => (w * im.height) / im.width)));
                    ensure(h + 8);
                    model.images.slice(0, 2).forEach((im, i) => {
                        const fitW = Math.min(w, (h * im.width) / im.height);
                        const fitH = (fitW * im.height) / im.width;
                        const x = 15 + i * (w + gap) + (w - fitW) / 2;
                        doc.addImage(im.dataUrl, 'JPEG', x, y, fitW, fitH);
                        doc.setFontSize(8); doc.setTextColor(100, 100, 100);
                        doc.text(im.label, 15 + i * (w + gap) + w / 2, y + h + 4, { align: 'center' });
                    });
                    y += h + 10;
                } else {
                    const im = model.images[0];
                    let w = Math.min(maxW, 130);
                    let h = (w * im.height) / im.width;
                    if (h > 150) { h = 150; w = (h * im.width) / im.height; }
                    ensure(h + 6);
                    doc.addImage(im.dataUrl, 'JPEG', (pageWidth - w) / 2, y, w, h);
                    y += h + 8;
                }
                break;
            }
            case 'measurement_table':
            case 'compare_table':
            case 'alignment_summary': {
                if (model.kind === 'comparison' && section.type !== 'alignment_summary') {
                    if (model.comparisonRows.length === 0) break;
                    heading(section.title);
                    autoTable(doc, {
                        ...TABLE_STYLES,
                        startY: y,
                        head: [['Parameter', 'Image A', 'Image B', 'Difference']],
                        body: model.comparisonRows.map((r) => [r.parameter, r.a, r.b, r.diff]),
                        columnStyles: { 0: { fontStyle: 'bold' }, 1: { halign: 'center' }, 2: { halign: 'center' }, 3: { halign: 'center' } },
                    });
                    afterTable();
                } else if (model.kind === 'single' && section.type === 'measurement_table') {
                    if (model.measurementRows.length === 0) break;
                    heading(section.title);
                    autoTable(doc, {
                        ...TABLE_STYLES,
                        startY: y,
                        head: [['#', 'Parameter', 'Level / Comments', 'Value']],
                        body: model.measurementRows.map((r, i) => [String(i + 1), r.parameter, r.level, r.value]),
                        columnStyles: { 0: { cellWidth: 12, halign: 'center' }, 3: { halign: 'center' } },
                    });
                    afterTable();
                }
                break;
            }
            case 'surgical_plan':
            case 'instrumentation': {
                if (model.implantRows.length === 0) break;
                heading(section.title);
                autoTable(doc, {
                    ...TABLE_STYLES,
                    startY: y,
                    head: [['#', 'Implant', 'Location', 'Size']],
                    body: model.implantRows.map((r, i) => [String(i + 1), r.type, r.location, r.size]),
                    columnStyles: { 0: { cellWidth: 12, halign: 'center' } },
                });
                afterTable();
                break;
            }
            case 'notes': {
                if (!model.notes.trim()) break;
                heading(section.title);
                doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5); doc.setTextColor(...TEXT);
                const lines = doc.splitTextToSize(model.notes, pageWidth - 30) as string[];
                for (const line of lines) { ensure(5); doc.text(line, 15, y); y += 5; }
                y += 6;
                break;
            }
            default:
                break;
        }
    }

    // ── Footer ───────────────────────────────────────────────────────────────
    const pages = doc.getNumberOfPages();
    for (let i = 1; i <= pages; i++) {
        doc.setPage(i);
        const fy = pageHeight - 8;
        doc.setDrawColor(200, 200, 200); doc.setLineWidth(0.3);
        doc.line(15, fy - 3, pageWidth - 15, fy - 3);
        doc.setFontSize(8); doc.setTextColor(130, 140, 150); doc.setFont('helvetica', 'normal');
        doc.text('Generated by SpineSurge Pro', 15, fy);
        doc.text(model.refNo, pageWidth / 2, fy, { align: 'center' });
        doc.text(`Page ${i} of ${pages}`, pageWidth - 15, fy, { align: 'right' });
    }
    return doc;
}

const fileNameFor = (m: ReportModel) =>
    `Spinesurge_Report_${(m.patient?.name || 'Scan').replace(/[^a-z0-9]/gi, '_')}_${m.refNo}.pdf`;

/** Build the model from the current store and return a PDF blob (no side effects). */
export async function buildReportPDF(): Promise<{ blob: Blob; model: ReportModel }> {
    const model = await buildReportModel(useAppStore.getState(), { withImages: true });
    if (!reportHasContent(model)) {
        throw new Error(model.kind === 'planning3d' ? 'No implants planned for the report.' : 'Nothing to report yet — add measurements or select them for the report.');
    }
    return { blob: renderReportPDF(model).output('blob'), model };
}

/**
 * Export: download + (optionally) file the PDF on the active study.
 * Upload errors are reported separately from generation errors (RPT-17).
 */
export async function exportReportPDF(opts: { saveToRecord?: boolean } = { saveToRecord: true }): Promise<{ saved: boolean; uploadError?: string }> {
    const { blob, model } = await buildReportPDF();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileNameFor(model);
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);

    if (!opts.saveToRecord || !model.patient) return { saved: false };
    if (!model.visitId) return { saved: false, uploadError: 'This session is not linked to a visit, so the report was downloaded but not filed.' };
    try {
        await api.uploadReport(model.visitId, model.studyId, blob, `Report ${model.refNo}`, useAppStore.getState().token);
        return { saved: true };
    } catch (e) {
        return { saved: false, uploadError: e instanceof Error ? e.message : 'Upload failed' };
    }
}
