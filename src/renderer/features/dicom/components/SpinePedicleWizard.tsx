import { useAppStore } from "@/lib/store/index";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card } from "@/components/ui/card";
import { ChevronRight, ChevronLeft, Target, Wrench, Activity, Ruler, Trash2, CheckCircle2 } from "lucide-react";
import { useState } from "react";
import { calculateBoneContact } from "@/features/measurements/planning/PedicleLogic";
import { vectorFromAngles, anglesFromVector } from "@/features/measurements/planning/SurgicalGeometry";
import { getLevelDefaults } from "../../measurements/planning/ScrewDefaults";

const STEPS = [
    { id: 1, label: "Load", icon: Target },
    { id: 2, label: "Crop", icon: Ruler },
    { id: 3, label: "Points", icon: Target },
    { id: 4, label: "Screws", icon: Wrench },
    { id: 5, label: "Grade", icon: Activity },
];

export const SpinePedicleWizard = () => {
    const {
        dicom3D,
        setPedicleWorkflowStep,
        updateRoiCrop,
        pedicleSimulations,
        threeDImplants,
        removeThreeDImplant,
        updateThreeDImplant,
        dicomSeries,
    } = useAppStore();

    const { workflowStep, roiCrop, screwLevel } = dicom3D;
    const [selectedFidId, setSelectedFidId] = useState<string | null>(null);
    const [gradingResults, setGradingResults] = useState<Record<string, number>>({});

    const nextStep = () => setPedicleWorkflowStep(Math.min(5, workflowStep + 1));
    const prevStep = () => setPedicleWorkflowStep(Math.max(1, workflowStep - 1));

    const selectedScrew = threeDImplants.find(i => i.type === 'screw' && i.simulationId === selectedFidId);

    const updateScrewProp = (props: any) => {
        if (selectedScrew) {
            updateThreeDImplant(selectedScrew.id, {
                properties: { ...selectedScrew.properties, ...props }
            });
        }
    };

    const updateScrewAngles = (pitch: number, yaw: number) => {
        if (selectedScrew) {
            updateThreeDImplant(selectedScrew.id, {
                direction: vectorFromAngles(pitch, yaw)
            });
        }
    };

    const handleGrade = (screw: any) => {
        const { currentVolumeId } = dicom3D;
        if (!currentVolumeId) {
            console.warn("[Wizard] No volume ID available for grading");
            return;
        }

        const result = calculateBoneContact(
            currentVolumeId,
            screw.position,
            screw.direction,
            screw.properties.length,
            screw.properties.diameter
        );

        setGradingResults(prev => ({ ...prev, [screw.id]: result }));
    };

    const renderStepContent = () => {
        switch (workflowStep) {
            case 1:
                return (
                    <div className="space-y-4">
                        <div className="text-sm text-muted-foreground leading-relaxed">
                            Data initialized. You are ready to begin the pedicle planning workflow.
                        </div>
                        <div className="p-3 bg-muted/50 rounded-lg border border-border">
                            <div className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-1">Status</div>
                            <div className="flex items-center gap-2 text-sm">
                                <CheckCircle2 className="h-4 w-4 text-green-500" />
                                <span>DICOM Volume Loaded ({dicomSeries.length} slices)</span>
                            </div>
                        </div>
                        <Button onClick={nextStep} className="w-full gap-2">
                            Begin Workflow <ChevronRight className="h-4 w-4" />
                        </Button>
                    </div>
                );
            case 2:
                return (
                    <div className="space-y-4">
                        <div className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">ROI Bounding Box</div>
                        <div className="space-y-6">
                            <RoiSlider label="X Range" min={roiCrop.x0} max={roiCrop.x1}
                                onMin={(v: any) => updateRoiCrop({ x0: v })} onMax={(v: any) => updateRoiCrop({ x1: v })} color="#ef4444" />
                            <RoiSlider label="Y Range" min={roiCrop.y0} max={roiCrop.y1}
                                onMin={(v: any) => updateRoiCrop({ y0: v })} onMax={(v: any) => updateRoiCrop({ y1: v })} color="#f97316" />
                            <RoiSlider label="Z Range" min={roiCrop.z0} max={roiCrop.z1}
                                onMin={(v: any) => updateRoiCrop({ z0: v })} onMax={(v: any) => updateRoiCrop({ z1: v })} color="#22c55e" />
                        </div>
                        <Card className="p-3 bg-blue-500/5 border-blue-500/20">
                            <p className="text-[11px] leading-relaxed text-blue-400">
                                💡 Adjust the sliders to focus on the vertebral levels of interest. The 3D view and MPR will update instantly.
                            </p>
                        </Card>
                    </div>
                );
            case 3:
                return (
                    <div className="space-y-4">
                        <div className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Placement Points</div>
                        <div className="text-sm text-muted-foreground leading-relaxed">
                            Click on the 3D model to drop fiducial points at the desired pedicle entry sites.
                        </div>
                        <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
                            {pedicleSimulations.length === 0 ? (
                                <div className="text-xs text-center border border-dashed rounded-md p-4 text-muted-foreground">
                                    No points placed yet.
                                </div>
                            ) : (
                                pedicleSimulations.map((sim: any) => (
                                    <div key={sim.id} className="p-2 bg-muted/40 border rounded-md flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                            <div className="h-2 w-2 rounded-full bg-orange-500" />
                                            <span className="text-xs font-bold font-mono">{sim.label}</span>
                                        </div>
                                        <div className="flex gap-1 text-[10px] text-muted-foreground uppercase">
                                            {sim.landmarks.VAP && <span>VAP</span>}
                                            {sim.landmarks.PIP_L && <span>L</span>}
                                            {sim.landmarks.PIP_R && <span>R</span>}
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                );
            case 4:
                return (
                    <div className="space-y-4">
                        <div className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Screw Configuration</div>

                        <div className="space-y-2">
                            <label className="text-[10px] text-muted-foreground uppercase font-bold">Insertion Point</label>
                            <Select value={selectedFidId || ""} onValueChange={setSelectedFidId}>
                                <SelectTrigger className="h-8 text-xs">
                                    <SelectValue placeholder="Select Point" />
                                </SelectTrigger>
                                <SelectContent>
                                    {pedicleSimulations.map((sim: any) => (
                                        <SelectItem key={sim.id} value={sim.id} className="text-xs">{sim.label}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="grid grid-cols-2 gap-2">
                            <div className="space-y-1">
                                <label className="text-[9px] text-muted-foreground uppercase">Ø Diameter</label>
                                <Select
                                    value={(selectedScrew?.properties.diameter || 6.5).toString()}
                                    onValueChange={(v: any) => {
                                        const d = parseFloat(v);
                                        const level = selectedScrew?.level || screwLevel || 'C3';
                                        const defaults = getLevelDefaults(level);
                                        const meas = defaults.measurements.find(m => m.diameter === d);
                                        updateScrewProp({
                                            diameter: d,
                                            length: meas ? meas.lengths[0] : (selectedScrew?.properties.length || 40)
                                        });
                                    }}
                                >
                                    <SelectTrigger className="h-7 text-[11px]">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {getLevelDefaults(selectedScrew?.level || screwLevel || 'C3').measurements.map((m: any) => (
                                            <SelectItem key={m.diameter} value={m.diameter.toString()} className="text-[11px]">
                                                {m.diameter.toFixed(1)}mm
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-1">
                                <label className="text-[9px] text-muted-foreground uppercase">Length (mm)</label>
                                <Select
                                    value={(selectedScrew?.properties.length || 45).toString()}
                                    onValueChange={(v: any) => updateScrewProp({ length: parseFloat(v) })}
                                >
                                    <SelectTrigger className="h-7 text-[11px]">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {(getLevelDefaults(selectedScrew?.level || screwLevel || 'C3').measurements.find(m => m.diameter === (selectedScrew?.properties.diameter || 6.5))?.lengths || []).map((v: any) => (
                                            <SelectItem key={v} value={v.toString()} className="text-[11px]">{v}mm</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>

                        {selectedScrew && (
                            <div className="space-y-4 pt-2 border-t">
                                <label className="text-[10px] text-muted-foreground uppercase font-bold">Trajectory Rotation</label>
                                <div className="space-y-4">
                                    <AngleSlider
                                        label="Pitch (Axial)"
                                        value={anglesFromVector(selectedScrew.direction).pitch}
                                        onValueChange={(v: any) => updateScrewAngles(v, anglesFromVector(selectedScrew.direction).yaw)}
                                        min={-45} max={45}
                                    />
                                    <AngleSlider
                                        label="Yaw (Sagittal)"
                                        value={anglesFromVector(selectedScrew.direction).yaw}
                                        onValueChange={(v: any) => updateScrewAngles(anglesFromVector(selectedScrew.direction).pitch, v)}
                                        min={-45} max={45}
                                    />
                                </div>
                            </div>
                        )}

                        <div className="space-y-2 pt-2 border-t mt-4">
                            <div className="text-[10px] text-muted-foreground uppercase font-bold mb-2">Active Trajectories</div>
                            {threeDImplants.filter((i: any) => i.type === 'screw').map((sc: any) => (
                                <div key={sc.id} className="flex items-center justify-between p-2 rounded-md bg-muted/30 border">
                                    <span className="text-xs font-mono font-bold tracking-tight">SCREW_{sc.id.slice(-4)}</span>
                                    <div className="flex items-center gap-1">
                                        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => removeThreeDImplant(sc.id)}>
                                            <Trash2 className="h-3 w-3 text-destructive" />
                                        </Button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                );
            case 5:
                return (
                    <div className="space-y-4">
                        <div className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Outcome Grading</div>
                        <div className="text-xs text-muted-foreground leading-relaxed">
                            Analyze the volumetric contact between screws and cortical/cancellous bone.
                        </div>

                        {threeDImplants.filter((i: any) => i.type === 'screw').map((sc: any) => (
                            <div key={sc.id} className="p-3 bg-muted/20 border rounded-lg space-y-2">
                                <div className="flex items-center justify-between">
                                    <span className="text-xs font-bold">SCREW_{sc.id.slice(-4)}</span>
                                    <span className="text-xs font-mono text-blue-400">
                                        {gradingResults[sc.id] ? `${gradingResults[sc.id].toFixed(0)}% Contact` : '--'}
                                    </span>
                                </div>
                                <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
                                    <div
                                        className="h-full bg-blue-500 transition-all duration-500"
                                        style={{ width: `${gradingResults[sc.id] || 0}%` }}
                                    />
                                </div>
                                <Button
                                    className="w-full h-7 text-[10px] font-bold uppercase tracking-widest"
                                    onClick={() => handleGrade(sc)}
                                >
                                    Grade Placement
                                </Button>
                            </div>
                        ))}
                    </div>
                );
            default:
                return null;
        }
    };

    return (
        <div className="flex flex-col h-full bg-background border-l border-border select-none">
            {/* Header */}
            <div className="p-3 border-b flex items-center justify-between bg-muted/20">
                <div className="flex items-center gap-2">
                    <Activity className="h-4 w-4 text-blue-500" />
                    <span className="text-xs font-bold tracking-tight uppercase">Pedicle Planning Suite</span>
                </div>
            </div>

            {/* Stepper Visual */}
            <div className="px-4 py-3 flex items-center justify-between border-b relative">
                <div className="absolute top-1/2 left-4 right-4 h-[2px] bg-muted -translate-y-1/2 -z-0" />
                {STEPS.map((s: any) => {
                    const isActive = workflowStep === s.id;
                    const isDone = workflowStep > s.id;
                    return (
                        <div key={s.id} className="relative z-10 flex flex-col items-center gap-1">
                            <div className={`h-6 w-6 rounded-full flex items-center justify-center text-[10px] font-bold transition-all duration-300 ${isActive ? "bg-primary text-primary-foreground scale-110 shadow-lg ring-4 ring-primary/20" :
                                isDone ? "bg-blue-500 text-white" : "bg-muted text-muted-foreground"
                                }`}>
                                {isDone ? <CheckCircle2 className="h-3 w-3" /> : s.id}
                            </div>
                            <span className={`text-[9px] font-medium tracking-tight uppercase ${isActive ? "text-primary font-bold" : "text-muted-foreground"}`}>
                                {s.label}
                            </span>
                        </div>
                    );
                })}
            </div>

            {/* Content Area */}
            <div className="flex-1 overflow-y-auto p-4">
                {renderStepContent()}
            </div>

            {/* Footer Nav */}
            <div className="p-3 border-t bg-muted/10 grid grid-cols-2 gap-2">
                <Button variant="outline" size="sm" onClick={prevStep} disabled={workflowStep === 1} className="gap-1 h-8 text-xs font-bold">
                    <ChevronLeft className="h-4 w-4" /> Back
                </Button>
                <Button size="sm" onClick={nextStep} disabled={workflowStep === 5} className="gap-1 h-8 text-xs font-bold">
                    Next <ChevronRight className="h-4 w-4" />
                </Button>
            </div>
        </div>
    );
};

const AngleSlider = ({ label, value, onValueChange, min, max }: any) => {
    return (
        <div className="space-y-1.5">
            <div className="flex items-center justify-between text-[10px] uppercase font-bold tracking-tight">
                <span className="text-muted-foreground">{label}</span>
                <span className="font-mono text-blue-400">{Math.round(value)}°</span>
            </div>
            <Slider
                value={[value]}
                min={min}
                max={max}
                step={1}
                onValueChange={([v]: any) => onValueChange(v)}
                className="cursor-pointer"
            />
        </div>
    );
};

const RoiSlider = ({ label, min, max, onMin, onMax, color }: any) => {
    return (
        <div className="space-y-2">
            <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-tight">
                <span>{label}</span>
                <span className="font-mono text-[9px] opacity-70">
                    {min.toFixed(2)} - {max.toFixed(2)}
                </span>
            </div>
            <div className="relative pt-4 pb-1">
                <Slider
                    value={[min * 100, max * 100]}
                    min={0} max={100} step={1}
                    onValueChange={([v0, v1]: any) => {
                        onMin(v0 / 100);
                        onMax(v1 / 100);
                    }}
                    className="cursor-pointer"
                />
                <div
                    className="absolute top-0 h-1 rounded-full transition-all duration-300"
                    style={{
                        left: `${min * 100}%`,
                        width: `${(max - min) * 100}%`,
                        backgroundColor: color,
                        opacity: 0.4
                    }}
                />
            </div>
        </div>
    );
};
