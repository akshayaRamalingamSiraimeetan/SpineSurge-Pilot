import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { useAppStore } from "@/lib/store/index";
import { api } from "@/lib/api";
import { buildReportModel, reportHasContent, type ReportModel } from "@/lib/report/reportModel";

/**
 * PDF = pure function of a ReportModel (lib/report/reportModel.ts), formatted
 * with the document settings from the Report tab's right panel.
 */

const TEXT: [number, number, number] = [71, 85, 105];
const HEAD: [number, number, number] = [30, 41, 59];

export const hexToRgb = (hex: string): [number, number, number] => {
    const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex.trim());
    return m ? [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)] : [255, 69, 58];
};

export function renderReportPDF(model: ReportModel): jsPDF {
    const d = model.doc;
    const accent = hexToRgb(d.accentColor);
    const fs = (n: number) => n * (d.fontScale || 1);
    const doc = new jsPDF({ orientation: d.orientation === 'landscape' ? 'l' : 'p', unit: 'mm', format: d.pageSize });
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const M = 15;
    const p = model.patient;

    const tableStyles = {
        theme: 'grid' as const,
        styles: { fontSize: fs(9), cellPadding: 3.5, textColor: TEXT, lineColor: [210, 215, 225] as [number, number, number], lineWidth: 0.3, font: 'helvetica', overflow: 'linebreak' as const },
        headStyles: { fillColor: accent, textColor: [255, 255, 255] as [number, number, number], fontStyle: 'bold' as const, fontSize: fs(9.5), halign: 'center' as const },
        alternateRowStyles: { fillColor: [248, 250, 252] as [number, number, number] },
        margin: { left: M, right: M, bottom: 20 },
    };

    // ── Header band ──────────────────────────────────────────────────────────
    doc.setFillColor(...accent);
    doc.rect(0, 0, pageWidth, 36, 'F');
    // Hospital logo on a white tile at the left of the header (UI6-10)
    let titleX = M;
    if (d.logo?.dataUrl) {
        const box = 24, pad = 2;
        doc.setFillColor(255, 255, 255);
        doc.roundedRect(M, 6, box, box, 2, 2, 'F');
        const s = Math.min((box - 2 * pad) / d.logo.width, (box - 2 * pad) / d.logo.height);
        const w = d.logo.width * s, h = d.logo.height * s;
        try {
            doc.addImage(d.logo.dataUrl, d.logo.dataUrl.startsWith('data:image/jpeg') ? 'JPEG' : 'PNG', M + (box - w) / 2, 6 + (box - h) / 2, w, h);
            titleX = M + box + 5;
        } catch { /* unreadable logo: header without it */ }
    }
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(fs(15));
    doc.text(d.title || 'Surgical Planning Report', titleX, 15);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(fs(9));
    const org = [d.institution, d.department].filter(Boolean).join(' · ');
    if (org) doc.text(org, titleX, 22);
    doc.text(`REF ${model.refNo}`, pageWidth - M, 13, { align: 'right' });
    doc.text(`Plan date ${model.planDate}`, pageWidth - M, 19, { align: 'right' });
    doc.text(`Surgery date ${model.visit?.surgeryDate || 'TBD'}`, pageWidth - M, 25, { align: 'right' });

    let y = 46;
    const ensure = (h: number) => { if (y + h > pageHeight - 22) { doc.addPage(); y = 20; } };
    const heading = (title: string) => {
        ensure(16);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(fs(12));
        doc.setTextColor(...HEAD);
        doc.text(title.toUpperCase(), M, y);
        doc.setDrawColor(...accent);
        doc.setLineWidth(0.8);
        doc.line(M, y + 2, pageWidth - M, y + 2);
        y += 9;
    };
    const afterTable = () => { y = ((doc as any).lastAutoTable?.finalY ?? y) + 10; };

    for (const section of model.sections) {
        switch (section.type) {
            case 'patient_summary': {
                heading(section.title);
                const left: [string, string][] = [
                    ['Name', p?.name || '—'],
                    ['Age / Sex', `${p?.age || '—'} / ${p?.gender ?? '—'}`],
                    ['Patient ID', p?.id || '—'],
                    ['Diagnosis', model.visit?.diagnosis || '—'],
                ];
                const right: [string, string][] = [
                    ['Surgeon', model.surgeon.name],
                    ['Title', model.surgeon.title],
                    ['Department', model.surgeon.department],
                ];
                doc.setFontSize(fs(9));
                const rows = Math.max(left.length, right.length);
                ensure(rows * 5 + 4);
                for (let i = 0; i < rows; i++) {
                    for (const [col, list] of [[M, left], [pageWidth / 2 + 5, right]] as const) {
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
                const maxW = pageWidth - 2 * M;
                const maxH = Math.min(150, pageHeight - 60);
                if (model.images.some((im) => im.fullWidth)) {
                    // 3D screenshots: stacked, full width
                    for (const im of model.images) {
                        let w = pageWidth - 2 * M;
                        let h = (w * im.height) / im.width;
                        const maxH = pageHeight - 60;
                        if (h > maxH) { h = maxH; w = (h * im.width) / im.height; }
                        ensure(h + 10);
                        doc.addImage(im.dataUrl, 'JPEG', (pageWidth - w) / 2, y, w, h);
                        doc.setFontSize(fs(8)); doc.setTextColor(100, 100, 100);
                        doc.text(im.label, pageWidth / 2, y + h + 4, { align: 'center' });
                        y += h + 10;
                    }
                } else if (model.images.length >= 2) {
                    const gap = 6;
                    const w = (maxW - gap) / 2;
                    const h = Math.min(maxH, Math.max(...model.images.slice(0, 2).map((im) => (w * im.height) / im.width)));
                    ensure(h + 8);
                    model.images.slice(0, 2).forEach((im, i) => {
                        const fitW = Math.min(w, (h * im.width) / im.height);
                        const fitH = (fitW * im.height) / im.width;
                        doc.addImage(im.dataUrl, 'JPEG', M + i * (w + gap) + (w - fitW) / 2, y, fitW, fitH);
                        doc.setFontSize(fs(8)); doc.setTextColor(100, 100, 100);
                        doc.text(im.label, M + i * (w + gap) + w / 2, y + h + 4, { align: 'center' });
                    });
                    y += h + 10;
                } else {
                    const im = model.images[0];
                    let w = Math.min(maxW, 140);
                    let h = (w * im.height) / im.width;
                    if (h > maxH) { h = maxH; w = (h * im.width) / im.height; }
                    ensure(h + 6);
                    doc.addImage(im.dataUrl, 'JPEG', (pageWidth - w) / 2, y, w, h);
                    y += h + 8;
                }
                break;
            }
            case 'measurement_table': {
                if (model.measurementRows.length === 0) break;
                heading(section.title);
                autoTable(doc, {
                    ...tableStyles, startY: y,
                    head: [['#', 'Parameter', 'Level / Comments', 'Value']],
                    body: model.measurementRows.map((r, i) => [String(i + 1), r.parameter, r.level, r.value]),
                    columnStyles: { 0: { cellWidth: 12, halign: 'center' }, 3: { halign: 'center' } },
                });
                afterTable();
                break;
            }
            case 'surgical_plan':
            case 'instrumentation': {
                if (model.implantRows.length === 0 && model.plans.length === 0) break;
                heading(section.title);
                // Every saved 2D plan: image, targets, preop vs plan, implants (UI9-05)
                for (const plan of model.plans) {
                    ensure(14);
                    doc.setFont('helvetica', 'bold'); doc.setFontSize(fs(11)); doc.setTextColor(...HEAD);
                    doc.text(`${plan.name}`, M, y);
                    doc.setFont('helvetica', 'normal'); doc.setFontSize(fs(8.5)); doc.setTextColor(120, 120, 120);
                    doc.text(`Saved ${new Date(plan.savedAt).toLocaleString()}${plan.osteotomies.length ? ' · ' + plan.osteotomies.join(', ') : ''}`, M, y + 5, { maxWidth: pageWidth - 2 * M });
                    y += 10;
                    if (plan.image) {
                        const maxW = Math.min(pageWidth - 2 * M, 120);
                        let w = maxW, h = (w * plan.image.height) / plan.image.width;
                        const maxH = Math.min(130, pageHeight - 60);
                        if (h > maxH) { h = maxH; w = (h * plan.image.width) / plan.image.height; }
                        ensure(h + 6);
                        doc.addImage(plan.image.dataUrl, 'JPEG', (pageWidth - w) / 2, y, w, h);
                        y += h + 6;
                    }
                    if (plan.targetRows.length) {
                        autoTable(doc, { ...tableStyles, startY: y,
                            head: [['Target', 'Measured', 'Target', 'Difference', 'Plan']],
                            body: plan.targetRows.map((r) => [r.parameter, r.measured, r.target, r.diff, r.plan]),
                            columnStyles: { 0: { fontStyle: 'bold' } } });
                        afterTable();
                    }
                    if (plan.compareRows.length) {
                        autoTable(doc, { ...tableStyles, startY: y,
                            head: [['Measurement', 'Preop', 'Plan', 'Difference']],
                            body: plan.compareRows.map((r) => [r.name, r.preop, r.plan, r.diff]) });
                        afterTable();
                    }
                    if (plan.implantRows.length) {
                        autoTable(doc, { ...tableStyles, startY: y,
                            head: [['#', 'Implant', 'Location', 'Size']],
                            body: plan.implantRows.map((r, i) => [String(i + 1), r.type, r.location, r.size]),
                            columnStyles: { 0: { cellWidth: 12, halign: 'center' } } });
                        afterTable();
                    }
                }
                if (model.implantRows.length === 0) break;
                autoTable(doc, {
                    ...tableStyles, startY: y,
                    head: [['#', 'Implant', 'Location', 'Size / Trajectory']],
                    body: model.implantRows.map((r, i) => [String(i + 1), r.type, r.location, r.size]),
                    columnStyles: { 0: { cellWidth: 12, halign: 'center' } },
                });
                afterTable();
                break;
            }
            case 'compare_table': {
                if (model.comparisonRows.length === 0) break;
                heading(section.title);
                autoTable(doc, {
                    ...tableStyles, startY: y,
                    head: [['Parameter', 'Image A', 'Image B', 'Difference']],
                    body: model.comparisonRows.map((r) => [r.parameter, r.a, r.b, r.diff]),
                    columnStyles: { 0: { fontStyle: 'bold' }, 1: { halign: 'center' }, 2: { halign: 'center' }, 3: { halign: 'center' } },
                });
                afterTable();
                break;
            }
            case 'notes': {
                if (!model.notes.trim()) break;
                heading(section.title);
                doc.setFont('helvetica', 'normal'); doc.setFontSize(fs(9.5)); doc.setTextColor(...TEXT);
                const lines = doc.splitTextToSize(model.notes, pageWidth - 2 * M) as string[];
                for (const line of lines) { ensure(5); doc.text(line, M, y); y += 5 * (d.fontScale || 1); }
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
        doc.line(M, fy - 3, pageWidth - M, fy - 3);
        doc.setFontSize(fs(8)); doc.setTextColor(130, 140, 150); doc.setFont('helvetica', 'normal');
        if (d.footerText) doc.text(d.footerText, M, fy);
        doc.text(model.refNo, pageWidth / 2, fy, { align: 'center' });
        if (d.showPageNumbers) doc.text(`Page ${i} of ${pages}`, pageWidth - M, fy, { align: 'right' });
    }
    return doc;
}

const fileNameFor = (m: ReportModel) =>
    `${(m.doc.title || 'Report').replace(/[^a-z0-9]+/gi, '_')}_${(m.patient?.name || 'Case').replace(/[^a-z0-9]/gi, '_')}_${m.refNo}.pdf`;

/** Build the model from the current store and return a PDF blob (no side effects). */
export async function buildReportPDF(): Promise<{ blob: Blob; model: ReportModel }> {
    const model = await buildReportModel(useAppStore.getState(), { withImages: true });
    if (!reportHasContent(model)) {
        throw new Error('Nothing to report yet — add an image, measurements or implants first.');
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
        await api.uploadReport(model.visitId, model.studyId, blob, `${model.doc.title || 'Report'} ${model.refNo}`, useAppStore.getState().token);
        return { saved: true };
    } catch (e) {
        return { saved: false, uploadError: e instanceof Error ? e.message : 'Upload failed' };
    }
}
