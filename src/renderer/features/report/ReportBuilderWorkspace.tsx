import React, { useEffect, useState } from 'react';
import { useAppStore } from '@/lib/store/index';
import { getDefaultReportConfig } from './defaultConfig';
import { cn } from '@/lib/utils';
import { useTheme } from '@/components/theme-provider';

export default function ReportBuilderWorkspace() {
    const { resolvedTheme } = useTheme();
    const isDark = resolvedTheme === "dark";
    const { activeContextId, contextStates, updateContextState, patients, activePatientId, user, measurements, implants, threeDImplants, pedicleSimulations, isComparisonMode, comparison } = useAppStore();

    const activeState = contextStates.find((s) => s.contextId === activeContextId);
    const reportConfig = activeState?.reportConfig;
    const activePatient = patients.find(p => p.id === activePatientId);
    const hasPlanningData = (implants && implants.length > 0) || (threeDImplants && threeDImplants.length > 0) || (pedicleSimulations && pedicleSimulations.length > 0);
    const isSingleReportMode = reportConfig?.reportType === 'single';
    const effectiveComparisonMode = isComparisonMode && !isSingleReportMode;
    
    // Canvas preview capture
    const [previewImages, setPreviewImages] = useState<string[]>([]);

    useEffect(() => {
        if (activeContextId && activeState && !reportConfig) {
            updateContextState(activeContextId, {
                reportConfig: getDefaultReportConfig(),
            });
        }

        // Capture live canvas snapshot
        setTimeout(() => {
            const canvases = Array.from(document.querySelectorAll('canvas')).filter(c => c.width > 300);
            if (canvases.length > 0) {
                setPreviewImages(canvases.map(c => c.toDataURL('image/png', 0.8)));
            }
        }, 300);
    }, [activeContextId, activeState, reportConfig, updateContextState]);

    if (!reportConfig) {
        return (
            <div className="flex w-full h-full items-center justify-center">
                <div className="animate-pulse text-muted-foreground">Initializing Report...</div>
            </div>
        );
    }

    const sortedSections = [...reportConfig.sections]
        .filter(s => s.enabled)
        .sort((a, b) => a.order - b.order);

    return (
        <div className={cn(
            "w-full h-full overflow-y-auto p-8 flex flex-col items-center gap-6",
            isDark ? "bg-[#0A0A0B]" : "bg-gray-100"
        )}>
            <div className={cn(
                "w-full max-w-[210mm] min-h-[297mm] p-[20mm] shadow-xl rounded-sm transition-all shrink-0",
                isDark ? "bg-[#141416] text-[#F5F5F7]" : "bg-white text-slate-900"
            )}>
                {/* Header (matches PDF output loosely) */}
                <header className="flex justify-between items-center border-b pb-8 mb-8" style={{ borderColor: 'rgba(255, 69, 58, 0.2)' }}>
                    <div>
                        <h1 className="text-3xl font-bold tracking-tight mb-2" style={{ color: '#FF453A' }}>SPINESURGE</h1>
                        <p className="text-sm font-medium opacity-70">General Hospital • Department of Spine Surgery</p>
                    </div>
                    <div className="text-right text-sm space-y-1 opacity-80">
                        <p>REF: SS-{Math.floor(100000 + Math.random() * 900000)}</p>
                        <p>DATE: {new Date().toLocaleDateString()}</p>
                    </div>
                </header>

                {/* Dynamic Sections */}
                <div className="space-y-12">
                    {sortedSections.map((section) => {
                        // Conditional rendering based on data availability
                        if (section.type === 'images' && previewImages.length === 0) return null;
                        if (section.type === 'measurement_table') {
                            if (effectiveComparisonMode) {
                                if (comparison.left.measurements.length === 0 && comparison.right.measurements.length === 0) return null;
                            } else {
                                if (measurements.length === 0) return null;
                            }
                        }
                        if (section.type === 'surgical_plan' && !hasPlanningData) return null;

                        return (
                            <section key={section.id} className="space-y-4">
                                <div>
                                    <h2 className="text-xl font-bold uppercase tracking-wider" style={{ color: '#FF453A' }}>{section.title}</h2>
                                    <div className="h-0.5 w-full mt-2 mb-6" style={{ backgroundColor: 'rgba(255, 69, 58, 0.2)' }} />
                                </div>
                                
                                {section.type === 'patient_summary' && (
                                    <div className="grid grid-cols-2 gap-8 text-sm">
                                        <div className="space-y-3">
                                            <h3 className="font-semibold mb-4" style={{ color: 'rgba(255, 69, 58, 0.8)' }}>PATIENT</h3>
                                            <div className="grid grid-cols-3 gap-2"><span className="opacity-70">Name:</span><span className="col-span-2 font-medium">{activePatient?.name || "N/A"}</span></div>
                                            <div className="grid grid-cols-3 gap-2"><span className="opacity-70">Age/Sex:</span><span className="col-span-2 font-medium">{activePatient?.age || "N/A"} / {activePatient?.gender || "-"}</span></div>
                                            <div className="grid grid-cols-3 gap-2"><span className="opacity-70">ID:</span><span className="col-span-2 font-medium">{activePatient?.id || "N/A"}</span></div>
                                        </div>
                                        <div className="space-y-3">
                                            <h3 className="font-semibold mb-4" style={{ color: 'rgba(255, 69, 58, 0.8)' }}>SURGICAL TEAM</h3>
                                            <div className="grid grid-cols-3 gap-2"><span className="opacity-70">Surgeon:</span><span className="col-span-2 font-medium">{user?.name || "Dr. User"}</span></div>
                                            <div className="grid grid-cols-3 gap-2"><span className="opacity-70">Role:</span><span className="col-span-2 font-medium">{user?.title || "Chief Consultant"}</span></div>
                                        </div>
                                    </div>
                                )}

                                {section.type === 'images' && (
                                    <>
                                        {effectiveComparisonMode ? (
                                            <div className="flex gap-4 w-full">
                                                <div className="flex-1 space-y-2">
                                                    <div className="text-center font-semibold text-xs opacity-70 uppercase">Image A (Pre-Op)</div>
                                                    {previewImages.length > 0 && (
                                                        <div className="w-full flex justify-center items-center bg-black/10 rounded-md p-2 border" style={{ borderColor: 'var(--border)' }}>
                                                            <img src={previewImages[0]} alt="Image A" className="max-w-full max-h-[400px] object-contain shadow-md" />
                                                        </div>
                                                    )}
                                                </div>
                                                <div className="flex-1 space-y-2">
                                                    <div className="text-center font-semibold text-xs opacity-70 uppercase">Image B (Post-Op)</div>
                                                    {previewImages.length > 1 ? (
                                                        <div className="w-full flex justify-center items-center bg-black/10 rounded-md p-2 border" style={{ borderColor: 'var(--border)' }}>
                                                            <img src={previewImages[1]} alt="Image B" className="max-w-full max-h-[400px] object-contain shadow-md" />
                                                        </div>
                                                    ) : (
                                                        <div className="w-full h-full flex justify-center items-center bg-black/5 rounded-md p-2 border border-dashed opacity-50" style={{ borderColor: 'var(--border)' }}>
                                                            No Comparison Image
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        ) : (
                                            previewImages.length > 0 && (
                                                <div className="w-full grid grid-cols-1 md:grid-cols-2 gap-4 rounded-lg overflow-hidden border p-4" style={{ borderColor: 'var(--border)' }}>
                                                    {previewImages.map((src, i) => (
                                                        <div key={i} className="flex justify-center items-center bg-black/10 rounded-md p-2">
                                                            <img src={src} alt={`Planning Image ${i+1}`} className="max-w-full max-h-[400px] object-contain shadow-md" />
                                                        </div>
                                                    ))}
                                                </div>
                                            )
                                        )}
                                    </>
                                )}

                                {section.type === 'measurement_table' && (
                                    <div className="w-full rounded-lg border overflow-hidden" style={{ borderColor: 'var(--border)' }}>
                                        <table className="w-full text-sm text-left">
                                            <thead className="text-xs uppercase" style={{ backgroundColor: 'var(--surface-2)' }}>
                                                <tr>
                                                    <th className="px-4 py-3 font-semibold">Parameter</th>
                                                    <th className="px-4 py-3 font-semibold">{effectiveComparisonMode ? 'Image A' : 'Value'}</th>
                                                    {effectiveComparisonMode && <th className="px-4 py-3 font-semibold">Image B</th>}
                                                    {effectiveComparisonMode && <th className="px-4 py-3 font-semibold">Difference</th>}
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {effectiveComparisonMode ? (
                                                    // Map Image A measurements
                                                    comparison.left.measurements.map((mA) => {
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
                                                        return (
                                                            <tr key={mA.id} className="border-t" style={{ borderColor: 'var(--border)' }}>
                                                                <td className="px-4 py-3 opacity-80">{mA.toolKey.toUpperCase()}</td>
                                                                <td className="px-4 py-3 font-medium">{valA}</td>
                                                                <td className="px-4 py-3 font-medium">{valB}</td>
                                                                <td className="px-4 py-3 font-medium" style={{ color: diffStr.startsWith('+') ? '#34C759' : diffStr.startsWith('-') ? '#FF453A' : 'inherit' }}>{diffStr}</td>
                                                            </tr>
                                                        );
                                                    })
                                                ) : (
                                                    measurements.map(m => (
                                                        <tr key={m.id} className="border-t" style={{ borderColor: 'var(--border)' }}>
                                                            <td className="px-4 py-3 opacity-80">{m.toolKey.toUpperCase()}</td>
                                                            <td className="px-4 py-3 font-medium">
                                                                {typeof m.result === 'string' ? m.result.split('\n')[0] : '—'}
                                                            </td>
                                                        </tr>
                                                    ))
                                                )}
                                            </tbody>
                                        </table>
                                    </div>
                                )}

                                {section.type === 'surgical_plan' && (
                                    <div className="w-full rounded-lg border overflow-hidden" style={{ borderColor: 'var(--border)' }}>
                                        <table className="w-full text-sm text-left">
                                            <thead className="text-xs uppercase" style={{ backgroundColor: 'var(--surface-2)' }}>
                                                <tr>
                                                    <th className="px-4 py-3 font-semibold">Implant Type</th>
                                                    <th className="px-4 py-3 font-semibold">Details</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {implants.map((imp, idx) => (
                                                    <tr key={idx} className="border-t" style={{ borderColor: 'var(--border)' }}>
                                                        <td className="px-4 py-3 opacity-80 capitalize">{imp.type}</td>
                                                        <td className="px-4 py-3 font-medium">
                                                            Size: {imp.width || imp.diameter}x{imp.height || imp.length}mm
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                )}

                                {section.type === 'notes' && (
                                    <textarea
                                        className={cn(
                                            "w-full min-h-[100px] p-4 rounded-lg border resize-y outline-none transition-colors",
                                            isDark ? "bg-black/20 border-gray-800 text-[#F5F5F7]" : "bg-gray-50 border-gray-200 text-slate-900",
                                            "focus:border-[#FF453A]"
                                        )}
                                        placeholder="Add clinical notes..."
                                        defaultValue={activeState?.toolState?.clinicalNotes || ''}
                                        onBlur={(e) => {
                                            if (activeContextId) {
                                                updateContextState(activeContextId, {
                                                    toolState: {
                                                        ...(activeState?.toolState || {}),
                                                        clinicalNotes: e.target.value
                                                    }
                                                });
                                            }
                                        }}
                                    />
                                )}
                            </section>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}
