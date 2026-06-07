import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, Info } from "lucide-react";
import { useState } from "react";

// Import images
import step2Img from "@/assets/help/step2_crop.png";
import step3Img from "@/assets/help/step3_points.png";
import step4Img from "@/assets/help/step4_screws.png";
import step4RepoImg from "@/assets/help/step4_reposition.png";
import workflowDescImg from "@/assets/help/workflow_desc.png";

const HELP_STEPS = [
    {
        title: "Overview",
        description: "Standard workflow for pedicle screw planning and simulation.",
        image: workflowDescImg,
        alt: "Workflow Description"
    },
    {
        title: "2. Crop ROI",
        description: "Drag the pink handles directly on any CT view to resize the ROI box. All 3 planes + 3D update in sync.",
        image: step2Img,
        alt: "Step 2: Crop ROI"
    },
    {
        title: "3. Place Insertion Points",
        description: "Click the 3D bone model (top-right) to drop fiducial points. Drag to rotate first.",
        image: step3Img,
        alt: "Step 3: Point Placement"
    },
    {
        title: "4. Place Screws",
        description: "Configure & load screw. Then use sliders to adjust angle/depth — reflected live in all 3 planes.",
        image: step4Img,
        alt: "Step 4: Load Screws"
    },
    {
        title: "4. Fine-tuning",
        description: "Drag the cyan dot on any 2D plane to reposition. All planes update live since they share state.",
        image: step4RepoImg,
        alt: "Step 4: Reposition"
    }
];

export function WorkflowHelpDialog({ open, onOpenChange }: { open: boolean, onOpenChange: (open: boolean) => void }) {
    const [currentStep, setCurrentStep] = useState(0);

    const nextStep = () => setCurrentStep((prev) => (prev + 1) % HELP_STEPS.length);
    const prevStep = () => setCurrentStep((prev) => (prev - 1 + HELP_STEPS.length) % HELP_STEPS.length);

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[800px] bg-slate-950 border-slate-800 text-white max-h-[90vh] overflow-hidden flex flex-col p-0">
                <DialogHeader className="p-6 pb-0">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-blue-500/10 rounded-lg">
                                <Info className="h-5 w-5 text-blue-500" />
                            </div>
                            <div>
                                <DialogTitle className="text-xl font-bold tracking-tight">Workflow Guide</DialogTitle>
                                <DialogDescription className="text-slate-400">
                                    Step-by-step instructions for SpineSurge Pedicle Planning
                                </DialogDescription>
                            </div>
                        </div>
                    </div>
                </DialogHeader>

                <div className="flex-1 overflow-y-auto p-6 space-y-6">
                    <div className="relative group">
                        <div className="aspect-video rounded-xl border border-slate-800 overflow-hidden bg-black/40 flex items-center justify-center shadow-2xl">
                            <img
                                src={HELP_STEPS[currentStep].image}
                                alt={HELP_STEPS[currentStep].alt}
                                className="max-w-full max-h-full object-contain transition-transform duration-500 group-hover:scale-[1.02]"
                            />
                        </div>

                        {/* Navigation Overlay */}
                        <div className="absolute inset-y-0 left-2 flex items-center">
                            <Button
                                variant="ghost"
                                size="icon"
                                onClick={prevStep}
                                className="h-10 w-10 rounded-full bg-black/50 hover:bg-black/80 backdrop-blur-sm border border-white/10"
                            >
                                <ChevronLeft className="h-6 w-6" />
                            </Button>
                        </div>
                        <div className="absolute inset-y-0 right-2 flex items-center">
                            <Button
                                variant="ghost"
                                size="icon"
                                onClick={nextStep}
                                className="h-10 w-10 rounded-full bg-black/50 hover:bg-black/80 backdrop-blur-sm border border-white/10"
                            >
                                <ChevronRight className="h-6 w-6" />
                            </Button>
                        </div>
                    </div>

                    <div className="space-y-3 bg-slate-900/50 p-6 rounded-xl border border-slate-800">
                        <div className="flex items-center justify-between">
                            <h3 className="text-lg font-bold text-blue-400">{HELP_STEPS[currentStep].title}</h3>
                            <span className="text-xs font-mono text-slate-500 uppercase tracking-widest">
                                {currentStep + 1} of {HELP_STEPS.length}
                            </span>
                        </div>
                        <p className="text-sm leading-relaxed text-slate-300">
                            {HELP_STEPS[currentStep].description}
                        </p>
                    </div>

                    <div className="flex justify-center gap-1.5 pb-2">
                        {HELP_STEPS.map((_, idx) => (
                            <button
                                key={idx}
                                onClick={() => setCurrentStep(idx)}
                                className={`h-1.5 transition-all duration-300 rounded-full ${idx === currentStep ? "w-8 bg-blue-500" : "w-1.5 bg-slate-700 hover:bg-slate-600"
                                    }`}
                            />
                        ))}
                    </div>
                </div>

                <div className="p-6 pt-0 flex justify-end">
                    <Button
                        onClick={() => onOpenChange(false)}
                        className="bg-blue-600 hover:bg-blue-500 text-white font-bold px-8 shadow-lg shadow-blue-500/20"
                    >
                        Got it, thanks!
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
}
