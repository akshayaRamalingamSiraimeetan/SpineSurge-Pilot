import {
    Upload,
    ArrowLeftRight,
    Download,
    FolderOpen,
    LogOut,
    Moon,
    Sun,
    Settings,
    User,
    Crop,
    LayoutTemplate,
    Grid2X2,
    Share2,
    Target
} from "lucide-react";
import { ImportDialog } from "@/features/import-export/ImportDialog";
import { Button } from "@/components/ui/button";
import { useTheme } from "@/components/theme-provider";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useNavigate, useLocation } from "react-router-dom";

import { useState, useRef } from "react";
import { ProfileDialog } from "./ProfileDialog";
import { SettingsDialog } from "./SettingsDialog";
import { ReportDialog } from "./ReportDialog";
import { ShareDialog } from "./ShareDialog";
import { useAppStore } from "@/lib/store/index";
import { cn } from "@/lib/utils";
import Logo from "@/assets/Logo.png";

const TopMenuBar = () => {
    const { setTheme, theme, resolvedTheme } = useTheme();
    const navigate = useNavigate();
    const location = useLocation();

    const {
        user,
        logout,
        activePatientId,
        currentImage,
        activeContextId,
        addContext,
        updateContextState,
        generateShareLink,
        measurements,
        implants,
        threeDImplants,
        pedicleSimulations,
        isComparisonMode,
        setComparisonMode,
        isDicomMode,
        dicomSeries,
        dicom3D,
        setDicomLayoutMode,
        setDicomCroppingActive,
        triggerFocusCrop,
        setActiveDialog
    } = useAppStore();

    const [profileOpen, setProfileOpen] = useState(false);
    const [settingsOpen, setSettingsOpen] = useState(false);
    const [reportOpen, setReportOpen] = useState(false);

    // Track the last main route for smart navigation
    const lastMainRouteRef = useRef('/dashboard');

    // Update lastMainRoute when on dashboard or compare page
    if (location.pathname === '/dashboard' || location.pathname === '/compare') {
        lastMainRouteRef.current = location.pathname;
    }

    const userInitial = user?.name
        ? user.name.replace(/^(Dr\.|Mr\.|Ms\.)\s+/i, '').charAt(0).toUpperCase()
        : 'U';

    // Smart navigation handlers
    const handleCompareToggle = () => {
        // If we are on cases page, clicking compare should always take us to compare page
        if (location.pathname === '/cases') {
            setComparisonMode(true);
            navigate('/compare');
            return;
        }

        const nextMode = !isComparisonMode;
        setComparisonMode(nextMode);
        if (nextMode) {
            navigate('/compare');
        } else {
            navigate('/dashboard');
        }
    };

    const handlePatientsToggle = () => {
        if (location.pathname === '/cases') {
            // Going back from patients page to the last main route
            navigate(lastMainRouteRef.current);
        } else {
            // Going to patients page
            navigate('/cases');
        }
    };

    return (
        <div className="h-16 border-b border-border bg-background/95 text-foreground flex items-center justify-between px-4 fixed top-0 left-0 right-0 z-50 shadow-[0_2px_20px_rgba(2,8,23,0.12)] backdrop-blur-xl">
            {/* Left: Logo */}
            <div
                className="flex items-center gap-3 cursor-pointer group ml-12"
                onClick={() => {
                    setComparisonMode(false);
                    navigate('/dashboard');
                }}
            >
                <img src={Logo} alt="SpineSurge" className="h-14 w-auto object-contain dark:brightness-100 brightness-0" />
            </div>

            {/* Center gap reserved for viewport tools rendered by BottomToolbar */}
            <div className="flex-1" />

            {/* Right: Actions */}
            <div className="flex items-center gap-4">

                {/* DICOM Layout Toggle - Only when in DICOM mode */}
                {isDicomMode && (
                    <div className="flex items-center gap-1 bg-muted/30 p-1 rounded-lg border border-border/50 mr-4">
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setDicomLayoutMode('axial-sagittal')}
                            className={cn(
                                "h-8 w-12 rounded transition-colors flex items-center justify-center gap-1",
                                dicom3D.layoutMode === 'axial-sagittal' ? "bg-[#FF453A] text-white hover:bg-[#e03d33]" : "text-[#9CA3AF] hover:text-[#F5F5F7]"
                            )}
                            title="2D Layout (Axial/Coronal Left, Sagittal Right)"
                        >
                            <LayoutTemplate className="w-4 h-4 rotate-90" />
                            <span className="text-[10px] font-bold ml-1">2D</span>
                        </Button>
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setDicomLayoutMode('grid')}
                            className={cn(
                                "h-8 w-8 rounded transition-colors",
                                dicom3D.layoutMode === 'grid' ? "bg-[#FF453A] text-white hover:bg-[#e03d33]" : "text-[#9CA3AF] hover:text-[#F5F5F7]"
                            )}
                            title="Standard 2x2 Grid"
                        >
                            <Grid2X2 className="w-4 h-4" />
                        </Button>
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setDicomLayoutMode('focus-3d')}
                            className={cn(
                                "h-8 w-8 rounded transition-colors",
                                dicom3D.layoutMode === 'focus-3d' ? "bg-[#FF453A] text-white hover:bg-[#e03d33]" : "text-[#9CA3AF] hover:text-[#F5F5F7]"
                            )}
                            title="3D Focus (3 Slices Top, 3D Bottom Wide)"
                        >
                            <LayoutTemplate className="w-4 h-4" />
                        </Button>
                    </div>
                )}

                {/* DICOM Shortcuts - Crop & Focus */}
                {isDicomMode && (
                    <div className="flex items-center gap-1 bg-muted/30 p-1 rounded-lg border border-border/50">
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setDicomCroppingActive(!dicom3D.isCroppingActive)}
                            className={cn(
                                "h-8 w-8 rounded transition-all",
                                dicom3D.isCroppingActive ? "bg-primary text-white shadow-lg" : "text-slate-400 hover:text-white"
                            )}
                            title="Toggle 3D ROI Crop"
                        >
                            <Crop className="w-4 h-4" />
                        </Button>
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={triggerFocusCrop}
                            className="h-8 w-8 rounded text-primary hover:bg-primary/10 transition-all"
                            title="Focus on Cropped Region"
                        >
                            <Target className="w-4 h-4" />
                        </Button>
                    </div>
                )}

                {/* Icons Group - Unified gap, uniform distance */}
                <div className="flex items-center gap-4">
                    <ImportDialog>
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 rounded-full bg-secondary hover:bg-muted shadow-sm border border-border transition-all active:scale-95 text-foreground"
                            title="Import Scan"
                        >
                            <Upload className="h-4.5 w-4.5" />
                        </Button>
                    </ImportDialog>

                    <Button
                        variant="ghost"
                        size="icon"
                        className={cn(
                            "h-8 w-8 rounded-full border border-border transition-all active:scale-95 shadow-sm",
                            isComparisonMode
                                ? "bg-primary text-primary-foreground hover:bg-primary/90"
                                : "bg-secondary hover:bg-muted text-foreground"
                        )}
                        title="Compare"
                        onClick={handleCompareToggle}
                    >
                        <ArrowLeftRight className="h-4.5 w-4.5" />
                    </Button>

                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 rounded-full bg-secondary hover:bg-muted shadow-sm border border-border transition-all active:scale-95 text-foreground"
                        title="Export Report"
                        onClick={() => {
                            setReportOpen(true);
                            setActiveDialog('report');
                        }}
                    >
                        <Download className="h-4.5 w-4.5" />
                    </Button>

                    <Button
                        variant="ghost"
                        size="icon"
                        className={cn(
                            "h-8 w-8 rounded-full shadow-sm border border-border transition-all active:scale-95",
                            location.pathname === '/cases'
                                ? "bg-primary/20 text-primary border-primary/30 hover:bg-primary/30"
                                : "bg-secondary hover:bg-muted text-foreground"
                        )}
                        onClick={handlePatientsToggle}
                        title={location.pathname === '/cases' ? 'Back to Workspace' : 'Patient Cases'}
                    >
                        <FolderOpen className="h-4.5 w-4.5" />
                    </Button>

                    <div className="flex items-center gap-2">
                        <Button
                            variant="outline"
                            size="icon"
                            className="h-8 w-8 rounded-full bg-secondary hover:bg-muted shadow-sm border border-border transition-all active:scale-95 text-foreground"
                            title="Share Workspace"
                            onClick={async () => {
                                // Scenario 1: Active Context (already saved/shared state)
                                if (activeContextId) {
                                    generateShareLink();
                                    return;
                                }

                                const newId = crypto.randomUUID();

                                // Scenario 2: DICOM Mode (Create snapshot linked to Study)
                                if (isDicomMode && dicomSeries.length > 0 && typeof dicomSeries[0] === 'string') {
                                    const targetUrl = dicomSeries[0] as string;
                                    let foundStudyId: string | undefined;
                                    let foundPatientId: string | undefined = activePatientId || undefined;

                                    // Helper: Check if a patient has this scan
                                    // Handles full URL vs relative path matching
                                    const findStudy = (p: any) => {
                                        return p.studies.find((s: any) =>
                                            s.scans.some((scan: any) =>
                                                targetUrl.includes(scan.imageUrl) || scan.imageUrl.includes(targetUrl)
                                            )
                                        );
                                    };

                                    const state = useAppStore.getState();
                                    const allPatients = state.patients;

                                    // Try to find the study in active patient or all patients
                                    let study: any;
                                    if (activePatientId) {
                                        const p = allPatients.find((p: any) => p.id === activePatientId);
                                        if (p) study = findStudy(p);
                                    }

                                    if (!study) {
                                        // Search all patients
                                        for (const p of allPatients) {
                                            study = findStudy(p);
                                            if (study) {
                                                foundPatientId = p.id;
                                                break;
                                            }
                                        }
                                    }

                                    if (study && foundPatientId) {
                                        foundStudyId = study.id;

                                        await addContext({
                                            id: newId,
                                            patientId: foundPatientId as string,
                                            studyIds: [foundStudyId as string],
                                            mode: 'view',
                                            name: `Shared DICOM ${new Date().toLocaleDateString()}`,
                                            lastModified: new Date().toISOString()
                                        });

                                        await updateContextState(newId, {
                                            threeDImplants,
                                            pedicleSimulations,
                                        });

                                        generateShareLink({ contextId: newId });
                                        return;
                                    }
                                }

                                // Scenario 3: Canvas Mode with Image (Create Snapshot)
                                if (activePatientId && currentImage && !isDicomMode) {
                                    await addContext({
                                        id: newId,
                                        patientId: activePatientId,
                                        studyIds: [],
                                        mode: 'view',
                                        name: `Shared Snapshot ${new Date().toLocaleDateString()}`,
                                        lastModified: new Date().toISOString()
                                    });
                                    await updateContextState(newId, {
                                        measurements,
                                        implants,
                                        threeDImplants,
                                        pedicleSimulations,
                                        currentImage
                                    });
                                    generateShareLink({ contextId: newId });
                                    return;
                                }

                                // Fallback: just open dialog with default link (e.g. current URL or patient)
                                generateShareLink();
                            }}
                        >
                            <Share2 className="h-4.5 w-4.5" />
                        </Button>
                    </div>

                    {/* Theme Toggle */}
                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 rounded-full bg-secondary hover:bg-muted shadow-sm border border-border transition-all active:scale-95 text-foreground"
                        onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
                        title="Toggle Theme"
                    >
                        <Sun className="h-[1.2rem] w-[1.2rem] rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
                        <Moon className="absolute h-[1.2rem] w-[1.2rem] rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
                    </Button>

                    {/* Profile Menu */}
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="w-8 h-8 p-0 hover:bg-transparent">
                                <div className="w-7 h-7 rounded-full bg-[rgba(255,69,58,0.12)] flex items-center justify-center border border-[#FF453A]/20 hover:border-[#FF453A]/40 transition-all">
                                    <span className="text-xs font-bold text-[#FF453A]">{userInitial}</span>
                                </div>
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent
                            align="end"
                            className={cn(
                                "w-60 rounded-2xl p-2 z-[100] shadow-md border",
                                resolvedTheme === 'dark'
                                    ? 'border-[#242427] bg-[#141416] text-[#F5F5F7]'
                                    : '!border-gray-200 !bg-white !text-gray-900'
                            )}
                        >
                            <DropdownMenuLabel className={cn("font-normal p-3", resolvedTheme === 'dark' ? '' : 'text-gray-900')}>
                                <div className="flex flex-col space-y-1">
                                    <p className="text-sm font-bold leading-none tracking-tight">{user?.name || "User"}</p>
                                    <p className="text-xs leading-none font-medium opacity-70">{user?.email || "demo@spine.com"}</p>
                                </div>
                            </DropdownMenuLabel>
                            <DropdownMenuSeparator className={resolvedTheme === 'dark' ? 'bg-[#242427]' : 'bg-gray-200'} />
                            <DropdownMenuItem
                                className={cn("cursor-pointer rounded-sm px-2 py-1.5 font-bold transition-colors !bg-transparent", resolvedTheme === 'dark' ? '!text-[#F5F5F7] hover:!bg-[#1B1B1E]' : '!text-gray-900 hover:!bg-gray-100')}
                                onClick={() => { setProfileOpen(true); setActiveDialog('profile'); }}
                            >
                                <User className="mr-2 h-4 w-4 text-primary" />
                                <span>Profile</span>
                            </DropdownMenuItem>
                            <DropdownMenuItem
                                className={cn("cursor-pointer rounded-sm px-2 py-1.5 font-bold transition-colors !bg-transparent", resolvedTheme === 'dark' ? '!text-[#F5F5F7] hover:!bg-[#1B1B1E]' : '!text-gray-900 hover:!bg-gray-100')}
                                onClick={() => { setSettingsOpen(true); setActiveDialog('settings'); }}
                            >
                                <Settings className="mr-2 h-4 w-4 text-primary" />
                                <span>Settings</span>
                            </DropdownMenuItem>
                            <DropdownMenuSeparator className={resolvedTheme === 'dark' ? 'bg-[#242427]' : 'bg-gray-200'} />
                            <DropdownMenuItem
                                className={cn("cursor-pointer rounded-sm px-2 py-1.5 font-bold transition-colors !bg-transparent", resolvedTheme === 'dark' ? 'hover:!bg-[#1B1B1E]' : 'hover:!bg-red-50')}
                                onClick={() => {
                                    logout();
                                    navigate('/login');
                                }}
                            >
                                <LogOut className="mr-2 h-4 w-4" />
                                <span>Log out</span>
                            </DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                </div>

                <ProfileDialog open={profileOpen} onOpenChange={(val) => { setProfileOpen(val); setActiveDialog(val ? 'profile' : null); }} />
                <SettingsDialog open={settingsOpen} onOpenChange={(val) => { setSettingsOpen(val); setActiveDialog(val ? 'settings' : null); }} />
                <ReportDialog open={reportOpen} onOpenChange={(val) => { setReportOpen(val); setActiveDialog(val ? 'report' : null); }} checkedCount={measurements.filter(m => m.selected).length} />
                <ShareDialog />
            </div>
        </div >
    );
};

export default TopMenuBar;
