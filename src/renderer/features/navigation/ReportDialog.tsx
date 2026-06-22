import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { FileText, Download, Check, Loader2 } from "lucide-react";
import { useState, useMemo } from "react";
import { useAppStore } from "@/lib/store/index";
import { useTheme } from "@/components/theme-provider";
import { cn } from "@/lib/utils";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { api } from "@/lib/api";

export function ReportDialog({ open, onOpenChange, checkedCount }: { open: boolean, onOpenChange: (open: boolean) => void, checkedCount: number }) {
    const { resolvedTheme } = useTheme();
    const isDark = resolvedTheme === "dark";
    const [isGenerating, setIsGenerating] = useState(false);
    const [saveToRecord, setSaveToRecord] = useState(true);
    const {
        isComparisonMode,
        activeCanvasSide,
        comparison,
        measurements: storeMeasurements,
        user,
        patients,
        activePatientId
    } = useAppStore();

    const measurements = useMemo(() => {
        if (isComparisonMode && activeCanvasSide) {
            return comparison[activeCanvasSide].measurements;
        }
        return storeMeasurements;
    }, [isComparisonMode, activeCanvasSide, comparison, storeMeasurements]);

    const activePatient = patients.find(p => p.id === activePatientId);

    const handleExportPDF = async () => {
        setIsGenerating(true);
        console.log("Starting PDF generation...");
        try {
            const selectedMeasurements = measurements.filter(m => m.selected && m.toolKey !== 'c7pl' && m.toolKey !== 'csvl' && !m?.measurement?.isCalibration);
            if (selectedMeasurements.length === 0) {
                alert("No measurements selected for the report.");
                setIsGenerating(false);
                return;
            }

            const doc = new jsPDF({
                orientation: 'p',
                unit: 'mm',
                format: 'a4'
            });

            const pageWidth = doc.internal.pageSize.getWidth();
            const pageHeight = doc.internal.pageSize.getHeight();

            // --- PROFESSIONAL BLUE HEADER WITH FLEX-LIKE LAYOUT ---
            doc.setFillColor(37, 99, 235);
            doc.rect(0, 0, pageWidth, 52, 'F');

            const headerStartY = 6;
            const headerEndY = 52;
            const headerCenterY = (headerStartY + headerEndY) / 2;
            const logoSize = 16;
            const logoX = 12;
            const logoY = headerCenterY - logoSize / 2;

            // Load and embed Logo image
            const logoImg = new Image();
            logoImg.src = '/Logo.png';
            logoImg.onload = () => {
                // Logo will be embedded when image loads
            };
            
            try {
                // Embed SRMC&RI official logo
                doc.addImage('/srmc-logo.png', 'PNG', logoX, logoY, logoSize, logoSize);
            } catch (err) {
                try {
                    // Try alternate path
                    doc.addImage('/srmc-logo.png', 'PNG', logoX, logoY, logoSize, logoSize);
                } catch {
                    // Final fallback: Draw elegant medical cross
                    doc.setFillColor(255, 255, 255);
                    doc.roundedRect(logoX, logoY, logoSize, logoSize, 2, 2, 'F');
                    doc.setStrokeColor(37, 99, 235);
                    doc.setLineWidth(0.8);
                    doc.roundedRect(logoX, logoY, logoSize, logoSize, 2, 2);
                    
                    // Draw medical cross
                    const cx = logoX + logoSize / 2;
                    const cy = logoY + logoSize / 2;
                    const crossSize = logoSize * 0.35;
                    
                    doc.setFillColor(37, 99, 235);
                    // Vertical bar
                    doc.rect(cx - crossSize / 4, cy - crossSize / 2, crossSize / 2, crossSize, 'F');
                    // Horizontal bar
                    doc.rect(cx - crossSize / 2, cy - crossSize / 4, crossSize, crossSize / 2, 'F');
                }
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

            // Comparison Dates logic
            if (isComparisonMode) {
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
            
            // Section underline
            doc.setDrawColor(37, 99, 235);
            doc.setLineWidth(1);
            doc.line(15, caseOverviewY + 2, pageWidth - 15, caseOverviewY + 2);
            
            // 2-Column Layout for Patient and Surgical Team
            let yPos = caseOverviewY + 10;
            const leftColX = 15;
            const rightColX = pageWidth / 2 + 8;
            const colWidth = (pageWidth - 30) / 2;
            
            // PATIENT SECTION (Left Column)
            doc.setFontSize(11);
            doc.setFont("helvetica", "bold");
            doc.setTextColor(37, 99, 235);
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
            
            // SURGICAL TEAM SECTION (Right Column)
            let surgicalY = yPos;
            doc.setFontSize(11);
            doc.setFont("helvetica", "bold");
            doc.setTextColor(37, 99, 235);
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
            
            // Find the maximum Y position to continue from
            yPos = Math.max(patientY, surgicalY) + 12;

            // --- PLANNING IMAGES SECTION ---
            if (yPos > pageHeight - 50) {
                doc.addPage();
                yPos = 20;
            }

            doc.setFont("helvetica", "bold");
            doc.setTextColor(30, 41, 59);
            doc.setFontSize(13);
            doc.text("PLANNING DOCUMENTATION", 15, yPos);
            
            // Section underline
            doc.setDrawColor(37, 99, 235);
            doc.setLineWidth(1);
            doc.line(15, yPos + 2, pageWidth - 15, yPos + 2);
            
            yPos += 10;

            const imageMargin = 15;
            const maxImageWidth = pageWidth - (imageMargin * 2);
            const allCanvases = Array.from(document.querySelectorAll('canvas'))
                .filter(c => c.width > 300);

            if (isComparisonMode && allCanvases.length >= 2) {
                // Side-by-side comparison
                const gap = 5;
                const imgWidth = (maxImageWidth - gap) / 2;
                const cLeft = allCanvases.find(c => c.getAttribute('data-side') === 'left') || allCanvases[0];
                const cRight = allCanvases.find(c => c.getAttribute('data-side') === 'right') || allCanvases[1];

                if (cLeft && cRight) {
                    const data1 = cLeft.toDataURL('image/png', 0.8);
                    const data2 = cRight.toDataURL('image/png', 0.8);
                    const h1 = imgWidth * (cLeft.height / cLeft.width);
                    
                    if (yPos + h1 + 10 > pageHeight - 30) {
                        doc.addPage();
                        yPos = 20;
                    }
                    
                    // Left image with border
                    doc.setDrawColor(200, 200, 200);
                    doc.setLineWidth(0.3);
                    doc.rect(imageMargin, yPos, imgWidth, h1);
                    doc.addImage(data1, 'PNG', imageMargin + 0.5, yPos + 0.5, imgWidth - 1, h1 - 1);
                    
                    // Right image with border
                    doc.rect(imageMargin + imgWidth + gap, yPos, imgWidth, h1);
                    doc.addImage(data2, 'PNG', imageMargin + imgWidth + gap + 0.5, yPos + 0.5, imgWidth - 1, h1 - 1);
                    
                    // Labels
                    doc.setFontSize(8);
                    doc.setFont("helvetica", "normal");
                    doc.setTextColor(100, 100, 100);
                    doc.text("PRE-OPERATIVE", imageMargin + imgWidth / 2, yPos + h1 + 3, { align: 'center' });
                    doc.text("POST-OPERATIVE", imageMargin + imgWidth + gap + imgWidth / 2, yPos + h1 + 3, { align: 'center' });
                    
                    yPos += h1 + 10;
                }
            } else if (allCanvases.length >= 3) {
                // Grid layout for multiple images
                const gap = 4;
                const imgWidth = (maxImageWidth - gap) / 2;
                const h = imgWidth * 0.75;
                
                if (yPos + (h * 2) + gap > pageHeight - 30) {
                    doc.addPage();
                    yPos = 20;
                }
                
                allCanvases.slice(0, 4).forEach((c, idx) => {
                    const row = Math.floor(idx / 2);
                    const col = idx % 2;
                    const x = imageMargin + col * (imgWidth + gap);
                    const y = yPos + row * (h + gap + 4);
                    
                    // Image with border
                    doc.setDrawColor(200, 200, 200);
                    doc.setLineWidth(0.3);
                    doc.rect(x, y, imgWidth, h);
                    doc.addImage(c.toDataURL('image/png', 0.8), 'PNG', x + 0.5, y + 0.5, imgWidth - 1, h - 1);
                });
                
                yPos += (h * 2) + gap + 10;
            } else if (allCanvases.length > 0) {
                // Single centered image
                const c = allCanvases[0];
                const imgWidth = Math.min(maxImageWidth, 120);
                const imgHeight = imgWidth * (c.height / c.width);
                
                if (yPos + imgHeight + 10 > pageHeight - 40) {
                    doc.addPage();
                    yPos = 20;
                }
                
                // Center the image
                const xOffset = (pageWidth - imgWidth) / 2;
                
                // Image with border
                doc.setDrawColor(200, 200, 200);
                doc.setLineWidth(0.3);
                doc.rect(xOffset, yPos, imgWidth, imgHeight);
                doc.addImage(c.toDataURL('image/png', 0.9), 'PNG', xOffset + 0.5, yPos + 0.5, imgWidth - 1, imgHeight - 1);
                
                yPos += imgHeight + 10;
            }

            // --- MEASUREMENT DATA TABLE ---
            if (yPos > pageHeight - 50) {
                doc.addPage();
                yPos = 20;
            }

            doc.setFont("helvetica", "bold");
            doc.setTextColor(30, 41, 59);
            doc.setFontSize(13);
            doc.text("MEASUREMENT DATA", 15, yPos);
            
            // Section underline
            doc.setDrawColor(37, 99, 235);
            doc.setLineWidth(1);
            doc.line(15, yPos + 2, pageWidth - 15, yPos + 2);
            
            yPos += 8;

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
                pageBreak: 'auto',
                rowPageBreak: 'auto',
                styles: {
                    fontSize: 9,
                    cellPadding: 5,
                    textColor: [71, 85, 105],
                    lineColor: [210, 215, 225],
                    lineWidth: 0.5,
                    halign: 'left',
                    valign: 'middle',
                    font: 'helvetica',
                    overflow: 'linebreak'
                },
                headStyles: {
                    fillColor: [37, 99, 235],
                    textColor: [255, 255, 255],
                    fontStyle: 'bold',
                    fontSize: 10,
                    cellPadding: 6,
                    halign: 'center',
                    valign: 'middle',
                    lineWidth: 0.5,
                    lineColor: [25, 80, 200]
                },
                alternateRowStyles: {
                    fillColor: [248, 250, 252]
                },
                columnStyles: {
                    0: { cellWidth: 14, halign: 'center', fontStyle: 'bold' },
                    1: { cellWidth: 38, halign: 'left' },
                    2: { cellWidth: 85, halign: 'left' },
                    3: { cellWidth: 26, halign: 'center' }
                },
                margin: { left: 15, right: 15, bottom: 20 }
            });

            yPos = (doc as any).lastAutoTable?.finalY ? (doc as any).lastAutoTable.finalY + 10 : yPos;

            // --- FOOTER ON ALL PAGES ---
            const pageCount = doc.getNumberOfPages();
            const footerY = pageHeight - 8;
            
            for (let i = 1; i <= pageCount; i++) {
                doc.setPage(i);
                
                // Footer line
                doc.setDrawColor(200, 200, 200);
                doc.setLineWidth(0.3);
                doc.line(15, footerY - 3, pageWidth - 15, footerY - 3);
                
                // Footer text
                doc.setFontSize(8);
                doc.setTextColor(130, 140, 150);
                doc.setFont("helvetica", "normal");
                doc.text("Generated by SpineSurge Pro", 15, footerY);
                doc.text(`Page ${i} of ${pageCount}`, pageWidth - 15, footerY, { align: 'right' });
                doc.text(new Date().toLocaleString(), pageWidth / 2, footerY, { align: 'center' });
            }

            const fileName = `Spinesurge_Report_${(activePatient?.name || 'Scan').replace(/[^a-z0-9]/gi, '_')}.pdf`;

            // Standard browser download
            doc.save(fileName);

            if (saveToRecord && activePatient) {
                const { currentImage } = useAppStore.getState();
                let targetVisit = null;
                if (currentImage) {
                    const targetStudy = activePatient.studies.find(s =>
                        s.scans.some(scan => scan.imageUrl === currentImage)
                    );
                    if (targetStudy) {
                        // Use the study's visitId to find the correct visit
                        targetVisit = activePatient.visits.find(v => v.id === targetStudy.visitId) || activePatient.visits[0];
                    }
                }
                if (!targetVisit && activePatient.visits.length > 0) {
                    targetVisit = activePatient.visits[0];
                }
                if (targetVisit) {
                    const blob = doc.output('blob');
                    const token = useAppStore.getState().token;
                    await api.uploadReport(targetVisit.id, blob, `Report - ${new Date().toLocaleDateString()}`, token);
                }
            }

            onOpenChange(false);
        } catch (err: any) {
            console.error("PDF Export Critical Failure:", err);
            alert(`Export failed: ${err.message || "Unknown error"}`);
        } finally {
            setIsGenerating(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className={cn(
                "sm:max-w-[425px] shadow-[0_25px_50px_-12px_rgba(0,0,0,0.5)] border",
                isDark
                    ? '!bg-[#141416] !text-[#F5F5F7] !border-[#242427]'
                    : '!bg-gray-100 !text-slate-900 !border-gray-300'
            )}>
                <DialogHeader>
                    <DialogTitle className={cn("text-2xl font-bold flex items-center gap-2", isDark ? 'text-[#F5F5F7]' : 'text-slate-900')}>
                        <FileText className="h-6 w-6 text-[#FF453A]" />
                        Generate PDF Report
                    </DialogTitle>
                    <DialogDescription className={isDark ? 'text-[#9CA3AF]/80' : 'text-slate-600'}>
                        You have <strong className="text-[#FF453A]">{checkedCount}</strong> measurements ready for clinical documentation.
                    </DialogDescription>
                </DialogHeader>

                <div className="py-6 space-y-4">
                    <div className={cn(
                        "p-4 rounded-lg border",
                        isDark
                            ? 'bg-[#0A0A0B]/60 border-[#242427]'
                            : 'bg-gray-200 border-gray-300'
                    )}>
                        <div className={cn("text-sm font-semibold mb-2 flex items-center gap-2", isDark ? 'text-[#F5F5F7]' : 'text-slate-900')}>
                            <Check className="h-4 w-4 text-[#00E676]" />
                            Report Ready
                        </div>
                        <ul className={cn("text-[11px] space-y-1.5", isDark ? 'text-[#9CA3AF]/70' : 'text-slate-600')}>
                            <li>• Professional Radiology Template (A4)</li>
                            <li>• Patient: {activePatient?.name || "Quick Analysis"}</li>
                            <li>• Surgeon: {user?.name}</li>
                            <li>• Measured Parameters: {checkedCount} tool(s)</li>
                        </ul>
                    </div>

                    <div className="flex items-center space-x-2">
                        <input
                            type="checkbox"
                            id="saveToRecord"
                            className={cn(
                                "h-4 w-4 rounded focus:ring-[#FF453A]",
                                isDark
                                    ? 'border-[#242427] text-[#FF453A] bg-[#0A0A0B]'
                                    : 'border-gray-400 text-[#FF453A] bg-white'
                            )}
                            checked={saveToRecord}
                            onChange={(e) => setSaveToRecord(e.target.checked)}
                        />
                        <label
                            htmlFor="saveToRecord"
                            className={cn("text-sm font-medium leading-none", isDark ? 'text-[#F5F5F7]' : 'text-slate-900')}
                        >
                            Save to Patient Record
                        </label>
                    </div>
                </div>

                <DialogFooter className="gap-2 sm:gap-0">
                    <Button variant="ghost" onClick={() => onOpenChange(false)} className={cn(
                        "transition-all",
                        isDark
                            ? 'text-[#9CA3AF] hover:text-[#F5F5F7] hover:bg-[#1B1B1E]'
                            : 'text-slate-700 hover:text-slate-900 hover:bg-gray-200'
                    )}>Cancel</Button>
                    <Button
                        onClick={handleExportPDF}
                        disabled={isGenerating || checkedCount === 0}
                        className="bg-[#FF453A] hover:bg-[#e03d33] text-white gap-2 shadow-[0_1px_2px_rgba(0,0,0,.04),0_8px_24px_rgba(0,0,0,.08)] font-bold"
                    >
                        {isGenerating ? (
                            <>
                                <Loader2 className="h-4 w-4 animate-spin" />
                                Processing...
                            </>
                        ) : (
                            <>
                                <Download className="h-4 w-4" />
                                {saveToRecord ? "Save & Download" : "Download PDF"}
                            </>
                        )}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
