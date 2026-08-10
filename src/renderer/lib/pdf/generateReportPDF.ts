import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { useAppStore } from "@/lib/store/index";
import { api } from "@/lib/api";
import type { SavedPlan, SavedComparison } from "@/lib/store/types";

export interface GeneratePDFOptions {
    previewOnly?: boolean;
}

export async function generateReportPDF(options: GeneratePDFOptions = {}): Promise<string | null> {
    const state = useAppStore.getState();
    const {
        isComparisonMode, activeCanvasSide, comparison,
        measurements: storeMeasurements, activeContextId, contextStates,
        user, patients, activePatientId, isDicomMode, threeDImplants, token
    } = state;

    const ctxState = activeContextId ? contextStates.find(s => s.contextId === activeContextId) : undefined;
    const reportConfig = ctxState?.reportConfig;
    const isSingleReportMode = reportConfig?.reportType === 'single';
    const effectiveComparisonMode = isComparisonMode && !isSingleReportMode;
    const hasPlanningData = (state.implants?.length > 0) || (threeDImplants?.length > 0) || (state.pedicleSimulations?.length > 0);

    let measurements = storeMeasurements;
    if (effectiveComparisonMode && activeCanvasSide) measurements = comparison[activeCanvasSide].measurements;

    const activePatient = patients.find(p => p.id === activePatientId);
    const savedPlans: SavedPlan[] = ctxState?.savedPlans ?? [];
    const savedComparisons: SavedComparison[] = ctxState?.savedComparisons ?? [];
    const selectedMeasurements = effectiveComparisonMode
        ? comparison.left.measurements
        : measurements.filter(m => m.selected && m.toolKey !== 'c7pl' && m.toolKey !== 'csvl' && !m?.measurement?.isCalibration);

    const hasContent = isDicomMode
        ? (threeDImplants.length > 0)
        : (savedPlans.length > 0 || savedComparisons.length > 0 || selectedMeasurements.length > 0);
    if (!hasContent) throw new Error("No content for the report. Add measurements or save a plan first.");

    const doc = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4' });
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const imageMargin = 15;
    const maxImageWidth = pageWidth - imageMargin * 2;

    // ── Header ───────────────────────────────────────────────────────────────
    doc.setFillColor(255, 69, 58);
    doc.rect(0, 0, pageWidth, 52, 'F');
    const hcy = (6 + 52) / 2;
    const logoSize = 16; const logoX = 12; const logoY = hcy - logoSize / 2;
    try { doc.addImage('/srmc-logo.png', 'PNG', logoX, logoY, logoSize, logoSize); } catch {
        doc.setFillColor(255,255,255); doc.roundedRect(logoX,logoY,logoSize,logoSize,2,2,'F');
        const cx=logoX+logoSize/2,cy=logoY+logoSize/2,cs=logoSize*0.35;
        doc.setFillColor(255,69,58);
        doc.rect(cx-cs/4,cy-cs/2,cs/2,cs,'F'); doc.rect(cx-cs/2,cy-cs/4,cs,cs/2,'F');
    }
    const leftX = logoX + logoSize + 8; const tsy = hcy - 9;
    doc.setTextColor(255,255,255); doc.setFontSize(16); doc.setFont('helvetica','bold'); doc.text('General Hospital', leftX, tsy);
    doc.setFontSize(9); doc.setFont('helvetica','normal'); doc.text('Department of Spine Surgery', leftX, tsy+5);
    doc.setFontSize(13); doc.setFont('helvetica','bold'); doc.text('SPINESURGE', leftX, tsy+11);
    doc.setFontSize(8); doc.setFont('helvetica','normal'); doc.text('PLAN DOCUMENTATION', leftX, tsy+15);
    const rightX = pageWidth - 12; const refNo = `SS-${Math.floor(100000+Math.random()*900000)}`;
    doc.setFontSize(9); doc.setFont('helvetica','normal'); doc.setTextColor(255,255,255);
    doc.text(`REF: ${refNo}`, rightX, tsy, {align:'right'});
    doc.text(`DATE: ${new Date().toLocaleDateString()}`, rightX, tsy+6, {align:'right'});
    doc.text(`SURGERY: ${activePatient?.visits?.[0]?.surgeryDate || 'TBD'}`, rightX, tsy+12, {align:'right'});

    // ── Patient + Surgical Team ───────────────────────────────────────────────
    const covY = 60;
    doc.setTextColor(30,41,59); doc.setFontSize(13); doc.setFont('helvetica','bold');
    doc.text('CLINICAL CASE OVERVIEW', 15, covY);
    doc.setDrawColor(255,69,58); doc.setLineWidth(1); doc.line(15, covY+2, pageWidth-15, covY+2);
    let yPos = covY + 10;
    const lx = 15; const rx = pageWidth/2+8;
    doc.setFontSize(11); doc.setFont('helvetica','bold'); doc.setTextColor(255,69,58);
    doc.text('PATIENT', lx, yPos); doc.text('SURGICAL TEAM', rx, yPos);
    doc.setFontSize(9); doc.setFont('helvetica','normal'); doc.setTextColor(71,85,105);
    let py = yPos+6; let sy = yPos+6;
    [['Name',activePatient?.name||'N/A'],['Age / Sex',`${activePatient?.age||'N/A'} / ${activePatient?.gender||'-'}`],['ID',activePatient?.id||'N/A'],['DOB',activePatient?.dob||'N/A'],['Diagnosis',activePatient?.visits?.[0]?.diagnosis||'N/A']].forEach(([l,v])=>{doc.setFont('helvetica','bold');doc.text(`${l}:`,lx,py);doc.setFont('helvetica','normal');doc.text(String(v),lx+20,py);py+=5;});
    [['Surgeon',user?.name||'Dr. User'],['Title',user?.title||'Chief Surgical Consultant'],['Dept',user?.subsection||'Lumbar'],['Plan Date',new Date().toLocaleDateString()],['Surgery',activePatient?.visits?.[0]?.surgeryDate||'TBD']].forEach(([l,v])=>{doc.setFont('helvetica','bold');doc.text(`${l}:`,rx,sy);doc.setFont('helvetica','normal');doc.text(String(v),rx+20,sy);sy+=5;});
    yPos = Math.max(py,sy) + 8;

    // ── Helper: section heading ───────────────────────────────────────────────
    const sectionHeading = (title: string, y: number): number => {
        if (y > pageHeight - 50) { doc.addPage(); y = 20; }
        doc.setFont('helvetica','bold'); doc.setTextColor(30,41,59); doc.setFontSize(13);
        doc.text(title, 15, y);
        doc.setDrawColor(255,69,58); doc.setLineWidth(1); doc.line(15, y+2, pageWidth-15, y+2);
        return y + 10;
    };

    // ── Helper: measurement table ─────────────────────────────────────────────
    const renderMeasTable = (y: number, leftM: any[], rightM?: any[], isComp = false): number => {
        if (isComp) {
            autoTable(doc, {
                startY: y,
                head: [['Parameter','Image A','Image B','Difference']],
                body: leftM.length ? leftM.map(mA => {
                    const mB = rightM?.find((m:any) => m.toolKey===mA.toolKey);
                    const vA = typeof mA.result==='string' ? mA.result.split('\n')[0] : '—';
                    const vB = mB && typeof mB.result==='string' ? mB.result.split('\n')[0] : '—';
                    let diff='—'; if(vA!=='—'&&vB!=='—'){const n=(s:string)=>{const m=s.match(/-?\d+(\.\d+)?/);return m?parseFloat(m[0]):NaN};const d=n(vB)-n(vA);if(!isNaN(d))diff=(d>0?'+':'')+d.toFixed(1)+(vA.includes('°')?'°':' px');}
                    return [(mA.toolKey||'').toUpperCase(),vA,vB,diff];
                }) : [['—','No data','—','—']],
                theme:'grid', styles:{fontSize:9,cellPadding:5,textColor:[71,85,105],lineColor:[210,215,225],lineWidth:0.5,font:'helvetica'},
                headStyles:{fillColor:[255,69,58],textColor:[255,255,255],fontStyle:'bold',fontSize:10,cellPadding:6,halign:'center',valign:'middle'},
                alternateRowStyles:{fillColor:[248,250,252]},
                columnStyles:{0:{cellWidth:45,fontStyle:'bold'},1:{cellWidth:45,halign:'center'},2:{cellWidth:45,halign:'center'},3:{cellWidth:45,halign:'center'}},
                margin:{left:15,right:15,bottom:20},
            });
        } else {
            autoTable(doc, {
                startY: y,
                head: [['#','Metric','Level / Comments','Value']],
                body: leftM.length ? leftM.map((m,idx)=>{
                    let res=m.result; if(typeof res==='number')res=res.toFixed(1);
                    const level=(m as any).level||(m as any).measurement?.level||'—';
                    const comments=(m as any).comments||(m as any).measurement?.comments||'';
                    return [String(idx+1),(m.toolKey||'Unknown').toUpperCase(),comments?`${level} (${comments})`:level,String(res||'N/A')];
                }) : [['—','No measurements','—','—']],
                theme:'grid', styles:{fontSize:9,cellPadding:5,textColor:[71,85,105],lineColor:[210,215,225],lineWidth:0.5,font:'helvetica',overflow:'linebreak'},
                headStyles:{fillColor:[255,69,58],textColor:[255,255,255],fontStyle:'bold',fontSize:10,cellPadding:6,halign:'center',valign:'middle'},
                alternateRowStyles:{fillColor:[248,250,252]},
                columnStyles:{0:{cellWidth:14,halign:'center',fontStyle:'bold'},1:{cellWidth:38},2:{cellWidth:85},3:{cellWidth:26,halign:'center'}},
                margin:{left:15,right:15,bottom:20},
            });
        }
        return (doc as any).lastAutoTable?.finalY ? (doc as any).lastAutoTable.finalY+10 : y+20;
    };

    // ── Helper: single image snapshot ─────────────────────────────────────────
    const addSnapshot = (y: number, snap: string): number => {
        try {
            const imgW = Math.min(maxImageWidth, 130);
            const img = new Image(); img.src = snap;
            const ratio = (img.height>0&&img.width>0) ? img.height/img.width : 0.75;
            const imgH = imgW*ratio;
            if (y+imgH+8>pageHeight-30) { doc.addPage(); y=20; }
            const x = (pageWidth-imgW)/2;
            doc.setDrawColor(200,200,200); doc.setLineWidth(0.3);
            doc.rect(x,y,imgW,imgH); doc.addImage(snap,'PNG',x+0.5,y+0.5,imgW-1,imgH-1);
            return y+imgH+8;
        } catch { return y; }
    };

    // ── Helper: side-by-side snapshots ────────────────────────────────────────
    const addSnapshotPair = (y: number, sL: string|undefined, sR: string|undefined, lL: string, lR: string): number => {
        if (!sL&&!sR) return y;
        try {
            const gap=5; const w=(maxImageWidth-gap)/2; const h=w*0.75;
            if (y+h+10>pageHeight-30) { doc.addPage(); y=20; }
            doc.setDrawColor(200,200,200); doc.setLineWidth(0.3);
            if(sL){doc.rect(imageMargin,y,w,h);doc.addImage(sL,'PNG',imageMargin+0.5,y+0.5,w-1,h-1);}
            if(sR){doc.rect(imageMargin+w+gap,y,w,h);doc.addImage(sR,'PNG',imageMargin+w+gap+0.5,y+0.5,w-1,h-1);}
            doc.setFontSize(8); doc.setFont('helvetica','normal'); doc.setTextColor(100,100,100);
            if(sL) doc.text(lL, imageMargin+w/2, y+h+3, {align:'center'});
            if(sR) doc.text(lR, imageMargin+w+gap+w/2, y+h+3, {align:'center'});
            return y+h+10;
        } catch { return y; }
    };

    // ═══════════════════════════════════════════════════════════════════════════
    // PLAN SECTIONS — each saved plan on its own page
    // ═══════════════════════════════════════════════════════════════════════════
    const multiPlan = savedPlans.length > 1;

    if (savedPlans.length > 0) {
        for (const [idx, plan] of savedPlans.entries()) {
            doc.addPage();
            let planY = 20;
            const planTitle = multiPlan ? `PLAN ${String.fromCharCode(65+idx)}` : 'SURGICAL PLANNING';
            planY = sectionHeading(planTitle, planY);
            doc.setFontSize(8); doc.setFont('helvetica','normal'); doc.setTextColor(130,140,150);
            doc.text(`Saved: ${new Date(plan.savedAt).toLocaleString()}`, 15, planY);
            planY += 8;
            if (plan.canvasSnapshot) planY = addSnapshot(planY, plan.canvasSnapshot);
            if (plan.measurements.length > 0) {
                if (planY > pageHeight-60) { doc.addPage(); planY=20; }
                doc.setFontSize(11); doc.setFont('helvetica','bold'); doc.setTextColor(30,41,59);
                doc.text('Measurements', 15, planY);
                doc.setDrawColor(200,200,200); doc.setLineWidth(0.5);
                doc.line(15, planY+1.5, pageWidth-15, planY+1.5); planY+=6;
                planY = renderMeasTable(planY, plan.measurements);
            }
            if (plan.implants && plan.implants.length > 0) {
                if (planY > pageHeight-60) { doc.addPage(); planY=20; }
                doc.setFontSize(11); doc.setFont('helvetica','bold'); doc.setTextColor(30,41,59);
                doc.text('Planned Implants', 15, planY);
                doc.setDrawColor(200,200,200); doc.setLineWidth(0.5);
                doc.line(15, planY+1.5, pageWidth-15, planY+1.5); planY+=6;
                autoTable(doc, {
                    startY: planY,
                    head:[['#','Type','Size']],
                    body: plan.implants.map((imp:any,i:number)=>[String(i+1),(imp.type||'Implant').toUpperCase(),`${imp.width||imp.diameter||'—'} × ${imp.height||imp.length||'—'} mm`]),
                    theme:'grid', styles:{fontSize:9,cellPadding:5,textColor:[71,85,105],lineColor:[210,215,225],lineWidth:0.5,font:'helvetica'},
                    headStyles:{fillColor:[255,69,58],textColor:[255,255,255],fontStyle:'bold',fontSize:10,cellPadding:6},
                    alternateRowStyles:{fillColor:[248,250,252]}, margin:{left:15,right:15,bottom:20},
                });
                planY = (doc as any).lastAutoTable?.finalY ? (doc as any).lastAutoTable.finalY + 10 : planY + 20;
            }
            if (plan.notes) {
                if (planY > pageHeight-40) { doc.addPage(); planY=20; }
                doc.setFontSize(11); doc.setFont('helvetica','bold'); doc.setTextColor(30,41,59);
                doc.text('Plan Notes', 15, planY);
                doc.setDrawColor(200,200,200); doc.setLineWidth(0.5);
                doc.line(15, planY+1.5, pageWidth-15, planY+1.5); planY+=6;
                doc.setFontSize(9); doc.setFont('helvetica','normal'); doc.setTextColor(71,85,105);
                const splitNotes = doc.splitTextToSize(plan.notes, pageWidth - 30);
                doc.text(splitNotes, 15, planY);
                planY += splitNotes.length * 5 + 10;
            }
        }
    } else if (!isDicomMode) {
        // No saved plans — fall back to live canvas + live measurements
        yPos = sectionHeading('PLANNING DOCUMENTATION', yPos);
        const allCanvases = Array.from(document.querySelectorAll('canvas')).filter((c:any) => c.width>300);
        if (effectiveComparisonMode && allCanvases.length>=2) {
            const cL=(allCanvases as any[]).find(c=>c.getAttribute('data-side')==='left')||allCanvases[0];
            const cR=(allCanvases as any[]).find(c=>c.getAttribute('data-side')==='right')||allCanvases[1];
            if(cL&&cR) yPos=addSnapshotPair(yPos,(cL as HTMLCanvasElement).toDataURL('image/png',0.8),(cR as HTMLCanvasElement).toDataURL('image/png',0.8),'PRE-OPERATIVE','POST-OPERATIVE');
        } else if (allCanvases.length>0) {
            yPos = addSnapshot(yPos, (allCanvases[0] as HTMLCanvasElement).toDataURL('image/png',0.9));
        }
        if (selectedMeasurements.length > 0) {
            yPos = sectionHeading('MEASUREMENT DATA', yPos);
            yPos = renderMeasTable(yPos, selectedMeasurements, effectiveComparisonMode ? comparison.right.measurements : undefined, effectiveComparisonMode);
        }
        const liveNotes = ctxState?.toolState?.clinicalNotes || activePatient?.visits?.[0]?.comments || '';
        if (liveNotes) {
            yPos = sectionHeading('CLINICAL NOTES', yPos);
            doc.setFontSize(9); doc.setFont('helvetica','normal'); doc.setTextColor(71,85,105);
            const splitNotes = doc.splitTextToSize(liveNotes, pageWidth - 30);
            doc.text(splitNotes, 15, yPos);
            yPos += splitNotes.length * 5 + 10;
        }
    }

    // ── DICOM implants (unchanged) ────────────────────────────────────────────
    if (hasPlanningData && isDicomMode) {
        yPos = sectionHeading('SURGICAL PLANNING (IMPLANTS)', yPos);
        const screwImplants = threeDImplants.filter(i => i.type==='screw');
        autoTable(doc, {
            startY: yPos,
            head:[['#','Implant Type','Spinal Level & Side','Dimensions','Material & Trajectory']],
            body: screwImplants.length>0 ? screwImplants.map((imp,i)=>[String(i+1),'Pedicle Screw',`${imp.level??'—'} ${imp.side==='L'?'Left':imp.side==='R'?'Right':''}`.trim()||'—',`${imp.properties.diameter} mm × ${imp.properties.length} mm`,'Titanium / Standard']) : [['—','No implants placed','—','—','—']],
            theme:'grid', styles:{fontSize:9,cellPadding:5,textColor:[71,85,105],lineColor:[210,215,225],lineWidth:0.5,font:'helvetica'},
            headStyles:{fillColor:[255,69,58],textColor:[255,255,255],fontStyle:'bold',fontSize:10,cellPadding:6,halign:'center',valign:'middle'},
            alternateRowStyles:{fillColor:[248,250,252]},
            columnStyles:{0:{cellWidth:14,halign:'center',fontStyle:'bold'},1:{cellWidth:38},2:{cellWidth:45},3:{cellWidth:40,halign:'center'},4:{cellWidth:43}},
            margin:{left:15,right:15,bottom:20},
        });
        yPos = (doc as any).lastAutoTable?.finalY ? (doc as any).lastAutoTable.finalY+12 : yPos+12;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // SAVED COMPARISONS SECTION
    // ═══════════════════════════════════════════════════════════════════════════
    if (savedComparisons.length > 0) {
        doc.addPage();
        let cy = 20;
        cy = sectionHeading('COMPARISONS', cy);
        for (const [cidx, comp] of savedComparisons.entries()) {
            if (cy > pageHeight-80) { doc.addPage(); cy=20; }
            doc.setFontSize(11); doc.setFont('helvetica','bold'); doc.setTextColor(255,69,58);
            doc.text(comp.name, 15, cy);
            doc.setFontSize(8); doc.setFont('helvetica','normal'); doc.setTextColor(130,140,150);
            doc.text(`Saved: ${new Date(comp.savedAt).toLocaleString()}`, 15, cy+5);
            cy += 12;
            cy = addSnapshotPair(cy, comp.left.canvasSnapshot, comp.right.canvasSnapshot, 'Image A', 'Image B');
            if (comp.left.measurements.length > 0) {
                if (cy > pageHeight-60) { doc.addPage(); cy=20; }
                doc.setFontSize(10); doc.setFont('helvetica','bold'); doc.setTextColor(30,41,59);
                doc.text('Measurements', 15, cy); cy+=4;
                cy = renderMeasTable(cy, comp.left.measurements, comp.right.measurements, true);
            }
            if (cidx < savedComparisons.length-1) cy+=10;
        }
    }

    // ── Footer on all pages ───────────────────────────────────────────────────
    const pageCount = doc.getNumberOfPages();
    const footerY = pageHeight - 8;
    for (let i=1; i<=pageCount; i++) {
        doc.setPage(i);
        doc.setDrawColor(200,200,200); doc.setLineWidth(0.3);
        doc.line(15, footerY-3, pageWidth-15, footerY-3);
        doc.setFontSize(8); doc.setTextColor(130,140,150); doc.setFont('helvetica','normal');
        doc.text('Generated by SpineSurge Pro', 15, footerY);
        doc.text(`Page ${i} of ${pageCount}`, pageWidth-15, footerY, {align:'right'});
        doc.text(new Date().toLocaleString(), pageWidth/2, footerY, {align:'center'});
    }

    if (options.previewOnly) {
        return URL.createObjectURL(doc.output('blob'));
    }

    const fileName = `Spinesurge_Report_${(activePatient?.name||'Scan').replace(/[^a-z0-9]/gi,'_')}.pdf`;
    doc.save(fileName);

    if (activePatient) {
        const currentImage = state.currentImage;
        let targetVisit: any = null;
        let targetStudyId: string|null = null;
        if (currentImage) {
            const ts = activePatient.studies.find(s => s.scans.some(sc => sc.imageUrl===currentImage));
            if (ts) { targetStudyId=ts.id; targetVisit=activePatient.visits.find(v=>v.id===ts.visitId)||activePatient.visits[0]; }
        }
        if (!targetVisit && activePatient.visits.length>0) {
            targetVisit = activePatient.visits[0];
            targetStudyId = activePatient.studies.find(s => s.visitId===targetVisit?.id)?.id || null;
        }
        if (targetVisit) {
            const blob = doc.output('blob');
            await api.uploadReport(targetVisit.id, targetStudyId, blob, `Report - ${new Date().toLocaleDateString()}`, token);
        }
    }

    return null;
}
