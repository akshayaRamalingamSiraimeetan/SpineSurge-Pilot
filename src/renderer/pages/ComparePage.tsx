import { Button } from "@/components/ui/button";
import { X } from "lucide-react";
import { useAppStore } from "@/lib/store/index";
import { useNavigate, useLocation } from "react-router-dom";
import CanvasWorkspace from "@/features/canvas/CanvasWorkspace";
import { useEffect } from "react";


const ComparePage = () => {
    const navigate = useNavigate();
    const {
        setComparisonMode,
        toggleRightSidebar,
        setActivePatient,
        setActiveContextId
    } = useAppStore();

    const location = useLocation();

    // Deep Linking Support
    useEffect(() => {
        const queryParams = new URLSearchParams(location.search);
        const pId = queryParams.get('patientId');
        const cId = queryParams.get('contextId');

        if (pId) setActivePatient(pId);
        if (cId) setActiveContextId(cId);
    }, [location.search, setActivePatient, setActiveContextId]);

    // Ensure RightSidebar is open and mode is correct when entering comparison mode
    useEffect(() => {
        setComparisonMode(true);
        toggleRightSidebar(true);
    }, [setComparisonMode, toggleRightSidebar]);

    const handleClose = () => {
        setComparisonMode(false);
        navigate('/dashboard');
    };

    return (
        <div id="comparison-container" className="flex flex-col h-full bg-background relative">
            {/* Exit Button Top Right */}
            <div className="absolute top-4 right-4 z-[100]">
                <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 rounded-full bg-card/80 backdrop-blur-md border border-border/50 hover:bg-destructive hover:text-destructive-foreground hover:border-destructive text-muted-foreground transition-all shadow-lg"
                    onClick={handleClose}
                >
                    <X className="h-4 w-4" />
                </Button>
            </div>

            {/* Split Canvas Area */}
            <div className="flex-1 flex overflow-hidden relative p-2 gap-2 mt-2">
                {/* Pre-Op (View A) */}
                <div className="flex-1 flex flex-col relative rounded-xl overflow-hidden border border-white/5">
                    <CanvasWorkspace side="left" />
                </div>

                {/* Post-Op (View B) */}
                <div className="flex-1 flex flex-col relative rounded-xl overflow-hidden border border-white/5">
                    <CanvasWorkspace side="right" />
                </div>
            </div>
        </div>
    );
};

export default ComparePage;
