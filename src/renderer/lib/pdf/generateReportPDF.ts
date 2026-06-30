import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { useAppStore } from "@/lib/store/index";
import { api } from "@/lib/api";

export interface GeneratePDFOptions {
    previewOnly?: boolean; // if true, returns URL and doesn't download or save version
}

export async function generateReportPDF(options: GeneratePDFOptions = {}): Promise<string | null> {
    const state = useAppStore.getState();
    const {
        isComparisonMode,
        activeCanvasSide,
        comparison,
        measurements: storeMeasurements,
        activeContextId,
        contextStates,
        user,
        patients,
        activePatientId,
        isDicomMode,
        threeDImplants,
        token
    } = state;

    const ctxState = activeContextId ? contextStates.find((s) => s.contextId === activeContextId) : undefined;
    const reportConfig = ctxState?.reportConfig;
    const isSingleReportMode = reportConfig?.reportType === 'single';
    const effectiveComparisonMode = isComparisonMode && !isSingleReportMode;
    
    const hasPlanningData = (state.implants && state.implants.length > 0) || 
                            (threeDImplants && threeDImplants.length > 0) || 
                            (state.pedicleSimulations && state.pedicleSimulations.length > 0);

    let measurements = storeMeasurements;
    if (effectiveComparisonMode && activeCanvasSide) {
        measurements = comparison[activeCanvasSide].measurements;
    }

    const activePatient = patients.find(p => p.id === activePatientId);
    const selectedMeasurements = effectiveComparisonMode ? comparison.left.measurements : measurements.filter(m => m.selected && m.toolKey !== 'c7pl' && m.toolKey !== 'csvl' && !m?.measurement?.isCalibration);
    const hasContent = isDicomMode ? (threeDImplants.length > 0) : (selectedMeasurements.length > 0);
    if (!hasContent) {
        throw new Error(isDicomMode ? "No implants planned for the report." : "No measurements selected for the report.");
    }

    const doc = new jsPDF({
        orientation: 'p',
        unit: 'mm',
        format: 'a4'
    });

    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();

    // --- PROFESSIONAL BLUE HEADER WITH FLEX-LIKE LAYOUT ---
    doc.setFillColor(255, 69, 58);
    doc.rect(0, 0, pageWidth, 52, 'F');

    const headerStartY = 6;
    const headerEndY = 52;
    const headerCenterY = (headerStartY + headerEndY) / 2;
    const logoSize = 16;
    const logoX = 12;
    const logoY = headerCenterY - logoSize / 2;

    try {
        doc.addImage('/srmc-logo.png', 'PNG', logoX, logoY, logoSize, logoSize);
    } catch {
        // Fallback: Draw elegant medical cross
        doc.setFillColor(255, 255, 255);
        doc.roundedRect(logoX, logoY, logoSize, logoSize, 2, 2, 'F');
        doc.setStrokeColor(255, 69, 58);
        doc.setLineWidth(0.8);
        doc.roundedRect(logoX, logoY, logoSize, logoSize, 2, 2);
        const cx = logoX + logoSize / 2;
        const cy = logoY + logoSize / 2;
        const crossSize = logoSize * 0.35;
        doc.setFillColor(255, 69, 58);
        doc.rect(cx - crossSize / 4, cy - crossSize / 2, crossSize / 2, crossSize, 'F');
        doc.rect(cx - crossSize / 2, cy - crossSize / 4, crossSize, crossSize / 2, 'F');
    }

    // LEFT SIDE: Hospital Info (vertically centered)
    const leftX = logoX + logoSize + 8;
    const textStartY = headerCenterY - 9;

    doc.setTextColor(255, 255, 255);
    doc.setFontSize(16);
    doc.setFont("helvetica", "bold");
    doc.text("General Hospital", leftX, textStartY);
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.text("Department of Spine Surgery", leftX, textStartY + 5);
    doc.setFontSize(13);
    doc.setFont("helvetica", "bold");
    doc.text("SPINESURGE", leftX, textStartY + 11);
    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.text("PLAN DOCUMENTATION", leftX, textStartY + 15);

    // RIGHT SIDE: Report Metadata (vertically centered)
    const rightX = pageWidth - 12;
    const refNo = `SS-${Math.floor(100000 + Math.random() * 900000)}`;
    const surgeryDate = activePatient?.visits?.[0]?.surgeryDate || "TBD";
    
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(255, 255, 255);
    
    const rightStartY = headerCenterY - 9;
    doc.text(`REF: ${refNo}`, rightX, rightStartY, { align: 'right' });
    doc.text(`PLAN DATE: ${new Date().toLocaleDateString()}`, rightX, rightStartY + 6, { align: 'right' });

    if (effectiveComparisonMode) {
        const findScanDate = (url: string | null) => {
            if (!url) return null;
            for (const p of patients) {
                for (const s of p.studies) {
                    const scan = s.scans.find(sc => sc.imageUrl === url);
                    if (scan) return scan.date;
                }
            }
            return null;
        };

        const dateLeft = findScanDate(comparison.left.image) || new Date().toLocaleDateString();
        const dateRight = findScanDate(comparison.right.image) || new Date().toLocaleDateString();

        doc.text(`PRE-OP: ${dateLeft}`, rightX, rightStartY + 12, { align: 'right' });
        doc.text(`POST-OP: ${dateRight}`, rightX, rightStartY + 18, { align: 'right' });
    } else {
        doc.text(`SURGERY DATE: ${surgeryDate}`, rightX, rightStartY + 12, { align: 'right' });
    }

    // --- CLINICAL CASE OVERVIEW SECTION ---
    const caseOverviewY = 60;
    doc.setTextColor(30, 41, 59);
    doc.setFontSize(13);
    doc.setFont("helvetica", "bold");
    doc.text("CLINICAL CASE OVERVIEW", 15, caseOverviewY);
    doc.setDrawColor(255, 69, 58);
    doc.setLineWidth(1);
    doc.line(15, caseOverviewY + 2, pageWidth - 15, caseOverviewY + 2);
    
    let yPos = caseOverviewY + 10;
    const leftColX = 15;
    const rightColX = pageWidth / 2 + 8;
    
    // PATIENT SECTION
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(255, 69, 58);
    doc.text("PATIENT", leftColX, yPos);
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(71, 85, 105);
    let patientY = yPos + 6;
    
    const patientFields = [
        ["Name", activePatient?.name || "N/A"],
        ["Age / Sex", `${activePatient?.age || "N/A"} / ${activePatient?.gender || "-"}`],
        ["ID", activePatient?.id || "N/A"],
        ["DOB", activePatient?.dob || "N/A"],
        ["Visit No", String(activePatient?.visits?.length || "1")],
        ["Diagnosis", activePatient?.visits?.[0]?.diagnosis || "N/A"]
    ];
    
    patientFields.forEach(([label, value]) => {
        doc.setFont("helvetica", "bold");
        doc.text(`${label}:`, leftColX, patientY);
        doc.setFont("helvetica", "normal");
        doc.text(String(value), leftColX + 20, patientY);
        patientY += 5;
    });
    
    // SURGICAL TEAM SECTION
    let surgicalY = yPos;
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(255, 69, 58);
    doc.text("SURGICAL TEAM", rightColX, surgicalY);
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(71, 85, 105);
    surgicalY += 6;
    
    const surgicalFields = [
        ["Surgeon", user?.name || "Dr. User"],
        ["Title", user?.title || "Chief Surgical Consultant"],
        ["Department", user?.subsection || "Lumbar"],
        ["Plan Date", new Date().toLocaleDateString()],
        ["Surgery Date", activePatient?.visits?.[0]?.surgeryDate || "TBD"]
    ];
    
    surgicalFields.forEach(([label, value]) => {
        doc.setFont("helvetica", "bold");
        doc.text(`${label}:`, rightColX, surgicalY);
        doc.setFont("helvetica", "normal");
        doc.text(String(value), rightColX + 20, surgicalY);
        surgicalY += 5;
    });
    
    yPos = Math.max(patientY, surgicalY) + 12;

    // --- PLANNING IMAGES SECTION ---
    if (yPos > pageHeight - 50) { doc.addPage(); yPos = 20; }

    doc.setFont("helvetica", "bold");
    doc.setTextColor(30, 41, 59);
    doc.setFontSize(13);
    doc.text("PLANNING DOCUMENTATION", 15, yPos);
    doc.setDrawColor(255, 69, 58);
    doc.setLineWidth(1);
    doc.line(15, yPos + 2, pageWidth - 15, yPos + 2);
    yPos += 10;

    const imageMargin = 15;
    const maxImageWidth = pageWidth - (imageMargin * 2);
    const allCanvases = Array.from(document.querySelectorAll('canvas')).filter(c => c.width > 300);

    if (effectiveComparisonMode && allCanvases.length >= 2) {
        const gap = 5;
        const imgWidth = (maxImageWidth - gap) / 2;
        const cLeft = allCanvases.find(c => c.getAttribute('data-side') === 'left') || allCanvases[0];
        const cRight = allCanvases.find(c => c.getAttribute('data-side') === 'right') || allCanvases[1];

        if (cLeft && cRight) {
            const data1 = cLeft.toDataURL('image/png', 0.8);
            const data2 = cRight.toDataURL('image/png', 0.8);
            const h1 = imgWidth * (cLeft.height / cLeft.width);
            if (yPos + h1 + 10 > pageHeight - 30) { doc.addPage(); yPos = 20; }
            
            doc.setDrawColor(200, 200, 200);
            doc.setLineWidth(0.3);
            doc.rect(imageMargin, yPos, imgWidth, h1);
            doc.addImage(data1, 'PNG', imageMargin + 0.5, yPos + 0.5, imgWidth - 1, h1 - 1);
            doc.rect(imageMargin + imgWidth + gap, yPos, imgWidth, h1);
            doc.addImage(data2, 'PNG', imageMargin + imgWidth + gap + 0.5, yPos + 0.5, imgWidth - 1, h1 - 1);
            
            doc.setFontSize(8);
            doc.setFont("helvetica", "normal");
            doc.setTextColor(100, 100, 100);
            doc.text("PRE-OPERATIVE", imageMargin + imgWidth / 2, yPos + h1 + 3, { align: 'center' });
            doc.text("POST-OPERATIVE", imageMargin + imgWidth + gap + imgWidth / 2, yPos + h1 + 3, { align: 'center' });
            yPos += h1 + 10;
        }
    } else if (allCanvases.length >= 3) {
        const gap = 4;
        const imgWidth = (maxImageWidth - gap) / 2;
        const h = imgWidth * 0.75;
        if (yPos + (h * 2) + gap > pageHeight - 30) { doc.addPage(); yPos = 20; }
        
        allCanvases.slice(0, 4).forEach((c, idx) => {
            const row = Math.floor(idx / 2);
            const col = idx % 2;
            const x = imageMargin + col * (imgWidth + gap);
            const y = yPos + row * (h + gap + 4);
            doc.setDrawColor(200, 200, 200);
            doc.setLineWidth(0.3);
            doc.rect(x, y, imgWidth, h);
            doc.addImage(c.toDataURL('image/png', 0.8), 'PNG', x + 0.5, y + 0.5, imgWidth - 1, h - 1);
        });
        yPos += (h * 2) + gap + 10;
    } else if (allCanvases.length > 0) {
        const c = allCanvases[0];
        const imgWidth = Math.min(maxImageWidth, 120);
        const imgHeight = imgWidth * (c.height / c.width);
        if (yPos + imgHeight + 10 > pageHeight - 40) { doc.addPage(); yPos = 20; }
        const xOffset = (pageWidth - imgWidth) / 2;
        doc.setDrawColor(200, 200, 200);
        doc.setLineWidth(0.3);
        doc.rect(xOffset, yPos, imgWidth, imgHeight);
        doc.addImage(c.toDataURL('image/png', 0.9), 'PNG', xOffset + 0.5, yPos + 0.5, imgWidth - 1, imgHeight - 1);
        yPos += imgHeight + 10;
    }

    // --- MEASUREMENT / PLANNING DATA TABLE ---
    if (yPos > pageHeight - 55) { doc.addPage(); yPos = 20; }

    if (hasPlanningData && isDicomMode) {
        doc.setFont("helvetica", "bold");
        doc.setTextColor(30, 41, 59);
        doc.setFontSize(13);
        doc.text("SURGICAL PLANNING (IMPLANTS)", 15, yPos);
        doc.setDrawColor(255, 69, 58);
        doc.setLineWidth(1);
        doc.line(15, yPos + 2, pageWidth - 15, yPos + 2);
        yPos += 8;

        const screwImplants = threeDImplants.filter(i => i.type === 'screw');
        const tableRows = screwImplants.map((imp, idx) => [
            String(idx + 1),
            "Pedicle Screw",
            `${imp.level ?? '—'} ${imp.side === 'L' ? 'Left' : imp.side === 'R' ? 'Right' : ''}`.trim() || '—',
            `${imp.properties.diameter} mm × ${imp.properties.length} mm`,
            "Titanium / Standard"
        ]);

        autoTable(doc, {
            startY: yPos,
            head: [['#', 'Implant Type', 'Spinal Level & Side', 'Dimensions', 'Material & Trajectory']],
            body: tableRows.length > 0 ? tableRows : [["—", "No implants placed", "—", "—", "—"]],
            theme: 'grid',
            styles: { fontSize: 9, cellPadding: 5, textColor: [71, 85, 105], lineColor: [210, 215, 225], lineWidth: 0.5, font: 'helvetica' },
            headStyles: { fillColor: [255, 69, 58], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 10, cellPadding: 6, halign: 'center', valign: 'middle' },
            alternateRowStyles: { fillColor: [248, 250, 252] },
            columnStyles: {
                0: { cellWidth: 14, halign: 'center', fontStyle: 'bold' },
                1: { cellWidth: 38 },
                2: { cellWidth: 45 },
                3: { cellWidth: 40, halign: 'center' },
                4: { cellWidth: 43 }
            },
            margin: { left: 15, right: 15, bottom: 20 }
        });

        yPos = (doc as any).lastAutoTable?.finalY ? (doc as any).lastAutoTable.finalY + 12 : yPos + 12;

        if (yPos > pageHeight - 45) { doc.addPage(); yPos = 20; }

        doc.setFont("helvetica", "bold");
        doc.text("ADDITIONAL PROPERTIES", 15, yPos);
        doc.line(15, yPos + 2, pageWidth - 15, yPos + 2);
        yPos += 8;

        autoTable(doc, {
            startY: yPos,
            head: [['Planning Component', 'Status / Properties']],
            body: [
                ["Rod Planning", "Not planned (Phase 2)"],
                ["Cage Planning", "N/A for 3D CT"]
            ],
            theme: 'grid',
            styles: { fontSize: 9, cellPadding: 5, textColor: [71, 85, 105], lineColor: [210, 215, 225], lineWidth: 0.5, font: 'helvetica' },
            headStyles: { fillColor: [255, 69, 58], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 10, cellPadding: 6, halign: 'center', valign: 'middle' },
            columnStyles: { 0: { cellWidth: 60, fontStyle: 'bold' }, 1: { cellWidth: 120 } },
            margin: { left: 15, right: 15, bottom: 20 }
        });
    }

    // MEASUREMENT DATA (Outside hasPlanningData block)
    if (!isDicomMode && selectedMeasurements.length > 0) {
        if (yPos > pageHeight - 45) { doc.addPage(); yPos = 20; }
        doc.setFont("helvetica", "bold");
        doc.setTextColor(30, 41, 59);
        doc.setFontSize(13);
        doc.text("MEASUREMENT DATA", 15, yPos);
        doc.setDrawColor(255, 69, 58);
        doc.setLineWidth(1);
        doc.line(15, yPos + 2, pageWidth - 15, yPos + 2);
        yPos += 8;

        if (effectiveComparisonMode) {
            const tableRows = selectedMeasurements.map((mA) => {
                const mB = comparison.right.measurements.find(m => m.toolKey === mA.toolKey);
                const valA = typeof mA.result === 'string' ? mA.result.split('\n')[0] : '—';
                const valB = mB && typeof mB.result === 'string' ? mB.result.split('\n')[0] : '—';
                let diffStr = '—';
                if (valA !== '—' && valB !== '—') {
                    const extractNum = (s: string) => {
                        const match = s.match(/-?\d+(\.\d+)?/);
                        return match ? parseFloat(match[0]) : NaN;
                    };
                    const numA = extractNum(valA);
                    const numB = extractNum(valB);
                    if (!isNaN(numA) && !isNaN(numB)) {
                        const diff = (numB - numA).toFixed(1);
                        diffStr = (parseFloat(diff) > 0 ? '+' : '') + diff + (valA.includes('°') ? '°' : ' px');
                    }
                }
                return [
                    (mA.toolKey || "Unknown").toUpperCase(),
                    valA,
                    valB,
                    diffStr
                ];
            });

            autoTable(doc, {
                startY: yPos,
                head: [['Parameter', 'Image A', 'Image B', 'Difference']],
                body: tableRows,
                theme: 'grid',
                styles: { fontSize: 9, cellPadding: 5, textColor: [71, 85, 105], lineColor: [210, 215, 225], lineWidth: 0.5, font: 'helvetica' },
                headStyles: { fillColor: [255, 69, 58], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 10, cellPadding: 6, halign: 'center', valign: 'middle' },
                alternateRowStyles: { fillColor: [248, 250, 252] },
                columnStyles: {
                    0: { cellWidth: 45, fontStyle: 'bold' },
                    1: { cellWidth: 45, halign: 'center' },
                    2: { cellWidth: 45, halign: 'center' },
                    3: { cellWidth: 45, halign: 'center' }
                },
                margin: { left: 15, right: 15, bottom: 20 },
                willDrawCell: function(data) {
                    if (data.section === 'body' && data.column.index === 3) {
                        const text = data.cell.text[0] || '';
                        if (text.startsWith('+')) doc.setTextColor(52, 199, 89);
                        else if (text.startsWith('-')) doc.setTextColor(255, 69, 58);
                    }
                }
            });
        } else {
            const tableRows = selectedMeasurements.map((m, idx) => {
                let displayResult = m.result;
                if (typeof displayResult === 'number') displayResult = displayResult.toFixed(1);
                const level = (m as any).level || (m as any).measurement?.level || "—";
                const comments = (m as any).comments || (m as any).measurement?.comments || "";
                const levelAndComments = comments ? `${level} (${comments})` : level;
                return [
                    String(idx + 1),
                    (m.toolKey || "Unknown").toUpperCase(),
                    levelAndComments,
                    String(displayResult || "N/A")
                ];
            });

            autoTable(doc, {
                startY: yPos,
                head: [['#', 'Metric', 'Level / Comments', 'Patient Value']],
                body: tableRows,
                theme: 'grid',
                styles: { fontSize: 9, cellPadding: 5, textColor: [71, 85, 105], lineColor: [210, 215, 225], lineWidth: 0.5, font: 'helvetica', overflow: 'linebreak' },
                headStyles: { fillColor: [255, 69, 58], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 10, cellPadding: 6, halign: 'center', valign: 'middle' },
                alternateRowStyles: { fillColor: [248, 250, 252] },
                columnStyles: {
                    0: { cellWidth: 14, halign: 'center', fontStyle: 'bold' },
                    1: { cellWidth: 38 },
                    2: { cellWidth: 85 },
                    3: { cellWidth: 26, halign: 'center' }
                },
                margin: { left: 15, right: 15, bottom: 20 }
            });
        }
    }

    // --- FOOTER ON ALL PAGES ---
    const pageCount = doc.getNumberOfPages();
    const footerY = pageHeight - 8;
    for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setDrawColor(200, 200, 200);
        doc.setLineWidth(0.3);
        doc.line(15, footerY - 3, pageWidth - 15, footerY - 3);
        doc.setFontSize(8);
        doc.setTextColor(130, 140, 150);
        doc.setFont("helvetica", "normal");
        doc.text("Generated by SpineSurge Pro", 15, footerY);
        doc.text(`Page ${i} of ${pageCount}`, pageWidth - 15, footerY, { align: 'right' });
        doc.text(new Date().toLocaleString(), pageWidth / 2, footerY, { align: 'center' });
    }

    if (options.previewOnly) {
        const blob = doc.output('blob');
        return URL.createObjectURL(blob);
    }

    const fileName = `Spinesurge_Report_${(activePatient?.name || 'Scan').replace(/[^a-z0-9]/gi, '_')}.pdf`;
    doc.save(fileName);

    if (activePatient) {
        const currentImage = state.currentImage;
        let targetVisit: any = null;
        let targetStudyId: string | null = null;
        if (currentImage) {
            const targetStudy = activePatient.studies.find(s => s.scans.some(scan => scan.imageUrl === currentImage));
            if (targetStudy) {
                targetStudyId = targetStudy.id;
                targetVisit = activePatient.visits.find(v => v.id === targetStudy.visitId) || activePatient.visits[0];
            }
        }
        if (!targetVisit && activePatient.visits.length > 0) {
            targetVisit = activePatient.visits[0];
            targetStudyId = activePatient.studies.find(s => s.visitId === targetVisit?.id)?.id || null;
        }
        if (targetVisit) {
            const blob = doc.output('blob');
            await api.uploadReport(targetVisit.id, targetStudyId, blob, `Report - ${new Date().toLocaleDateString()}`, token);
        }
    }

    return null;
}
