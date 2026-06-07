import { useState } from "react";
import {
    ChevronDown,
    Target,
    Layers,
    Eye,
    EyeOff,
    PanelLeftOpen,
    PanelLeftClose,
    Trash2,
    Timer,
    AlertTriangle,
    Wrench,
    Cuboid,
    AlertCircle,
    Type,
    Scale,
    Pencil,
    Circle,
    Pentagon,
    MoveHorizontal,
    Box,
    Minus,
    RotateCcw,
    // Scissors
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Slider } from '@/components/ui/slider';
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/lib/store/index";
import { ScrollArea } from "@/components/ui/scroll-area";
import { MetadataDialog } from "@/features/dicom/MetadataDialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SPINAL_LEVELS, getLevelDefaults } from "../measurements/planning/ScrewDefaults";
import { useTheme } from "@/components/theme-provider";

const SpineBentIcon = (props: any) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
        <path d="M12 3c-1 1-2 2.5-2 4s1 3 2 4.5 2 2.5 2 4.5-1 3-2 4" />
        <path d="M10 7h4" />
        <path d="M10 11.5h4" />
        <path d="M10 16h4" />
    </svg>
);

const ScrewIcon = (props: any) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" {...props}>
        <path d="M9 3h6" />
        <path d="M10 3v3" />
        <path d="M14 3v3" />
        <path d="M8 6h8l-1 3H9l-1-3z" />
        <path d="M12 9v12" />
        <path d="M10 12h4" />
        <path d="M10 15h4" />
        <path d="M10 18h4" />
    </svg>
);

const StenosisIcon = (props: any) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" {...props}>
        <path d="M7 5L19 7L16 19L5 16Z" />
    </svg>
);

const ListhesisIcon = (props: any) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" {...props}>
        <rect x="5" y="4" width="10" height="7" rx="1" />
        <rect x="11" y="13" width="10" height="7" rx="1" />
        <path d="M11 11l-1 2" strokeDasharray="2 2" className="opacity-50" />
    </svg>
);

// Helper Components
const ListToolItem = ({ label, fullName, active, icon: Icon, symbol, onClick, showDivider = true }: any) => (
    <>
        <div
            onClick={onClick}
            className={`flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer transition-all border
            ${active ? 'bg-primary/10 border-primary/20 text-primary shadow-sm' : 'bg-secondary/50 border-transparent text-muted-foreground hover:bg-secondary hover:border-border/30'}`}
        >
            <div className={`w-9 h-9 flex items-center justify-center rounded-lg border transition-all flex-shrink-0
                ${active ? 'bg-primary border-primary text-primary-foreground' : 'bg-background border-border/40 text-muted-foreground shadow-inner'}`}>
                {symbol ? <span className="text-[13px] font-bold font-['Outfit']">{symbol}</span> : Icon ? <Icon className="h-4.5 w-4.5" /> : <span className="text-[11px] font-medium font-['Outfit']">{label.toUpperCase()}</span>}
            </div>
            <span className="text-[13px] font-semibold leading-tight font-['Outfit'] text-foreground">{fullName || label}</span>
        </div>
        {showDivider && <div className="h-[1px] bg-border/20 mx-2" />}
    </>
);

const NavIcon = ({ icon: Icon, label, active, onClick, isDark }: { icon: any, label: string, active?: boolean, onClick: () => void, isDark: boolean }) => (
    <div
        onClick={onClick}
        className={cn(
            "w-10 h-10 rounded-xl flex items-center justify-center cursor-pointer transition-all group relative",
            active ? "bg-primary text-primary-foreground shadow-lg shadow-primary/20" : "text-muted-foreground hover:bg-muted hover:text-foreground"
        )}
    >
        <Icon className="h-5 w-5 transition-transform group-hover:scale-110" />
        <div className={cn(
            "absolute left-[calc(100%+16px)] text-[12px] px-4 py-2 rounded-xl opacity-0 group-hover:opacity-100 pointer-events-none transition-all duration-300 transform translate-x-1 group-hover:translate-x-0 whitespace-nowrap z-[100] border shadow-2xl font-bold flex items-center font-['Outfit']",
            isDark ? "bg-[#132F4C] text-[#E3F2FD] border-[#1E3A5F]" : "bg-gray-100 text-slate-900 border-gray-300"
        )}>
            <div className={cn(
                "absolute -left-1.5 w-3 h-3 rotate-45 border-l border-b",
                isDark ? "bg-[#132F4C] border-[#1E3A5F]" : "bg-gray-100 border-gray-300"
            )} />
            {label}
        </div>
    </div>
);

const MODULES = [
    { id: 'generic', icon: Target, label: 'Utilities' },
    { id: 'quick', icon: Timer, label: 'Quick Measure' },
    { id: 'deformity', icon: SpineBentIcon, label: 'Deformity' },
    { id: 'pathology', icon: AlertTriangle, label: 'Pathology' },
    { id: 'planning', icon: Wrench, label: 'Planning Suite' },
    { id: 'threeD', icon: Cuboid, label: '3D' },
];

const TOOLS: Record<string, any[]> = {
    quick: [
        {
            type: 'section',
            label: 'General',
            items: [
                { id: 'cobb', label: 'Cobb', fullName: 'Cobb Angle' },
                { id: 'sva', label: 'SVA', fullName: 'Sagittal vertical axis' },
                { id: 'vbm', label: 'VBM', fullName: 'Vert body metrics' },
                { id: 'pi_ll', label: 'PI-LL', fullName: 'PI-LL mismatch' },
                { id: 'pelvis', label: 'Pelvis', fullName: 'Pelvic Parameters (PI/PT/SS)' },
            ]
        },
        {
            type: 'section',
            label: 'Spinal Curvature',
            items: [
                { id: 'cl', label: 'CL', fullName: 'Cervical lordosis' },
                { id: 'tk', label: 'TK', fullName: 'Thoracic kyphosis' },
                { id: 'll', label: 'LL', fullName: 'Lumbar lordosis' },
                { id: 'sc', label: 'Cust', fullName: 'Custom curvature' },
            ]
        }
    ],
    deformity: [
        {
            type: 'section',
            label: 'Global Coronal',
            items: [
                { id: 'cmc', label: 'CMC', fullName: 'Cobb multi curve' },
                { id: 'csvl', label: 'CSVL', fullName: 'Coronal sacral vertical line' },
                { id: 'c7pl', label: 'C7PL', fullName: 'Plumb line' },
                { id: 'ts', label: 'TS', fullName: 'Trunk shift' },
                { id: 'avt', label: 'AVT', fullName: 'Apical vertebral shift' },
                { id: 'rvad', label: 'RVAD', fullName: 'Rib vertebral angle difference' },
                { id: 'po', label: 'PO', fullName: 'Pelvic obliquity' },
                { id: 'itilt', label: 'iTILT', fullName: 'UIV/LIV tilt' },
            ]
        },
        {
            type: 'section',
            label: 'Global Sagittal',
            items: [
                { id: 'tpa', label: 'TPA', fullName: 'T1 pelvic angle' },
                { id: 'spa', label: 'SPA', fullName: 'Spinopelvic angle' },
                { id: 'ssa', label: 'SSA', fullName: 'Spinosacral angle' },
                { id: 't1spi', label: 'T1SPi', fullName: 'T1 spinopelvic inclination' },
                { id: 't9spi', label: 'T9SPi', fullName: 'T9 spinopelvic inclination' },
                { id: 'odha', label: 'ODHA', fullName: 'Odontoid hip angle' },
                { id: 'cbva', label: 'CBVA', fullName: 'Chin brow vertical angle' },
                { id: 'slope', label: '\u0394Y/\u0394X', fullName: 'Slope of vertebral endplate' },
            ]
        },
    ],
    pathology: [
        {
            type: 'section',
            label: 'Spinal Pathology',
            items: [
                { id: 'stenosis', label: 'Steno', fullName: 'Stenosis', icon: StenosisIcon },
                { id: 'spondy', label: 'Lysis', fullName: 'Spondylolisthesis', icon: ListhesisIcon },
            ]
        }
    ],
    planning: [
        {
            type: 'section',
            label: 'Osteotomy',
            items: [
                { id: 'ost-pso', label: 'PSO', fullName: 'Pedicle Subtraction Osteotomy' },
                { id: 'ost-spo', label: 'SPO', fullName: 'Smith-Petersen Osteotomy' },
                { id: 'ost-resect', label: 'Resect', fullName: 'Resection Plan' },
                { id: 'ost-open', label: 'Open', fullName: 'Opening Wedge' },
            ]
        },
        {
            type: 'section',
            label: 'Implants',
            items: [
                { id: 'imp-screw', label: 'Screw', fullName: 'Screw', icon: ScrewIcon },
                { id: 'imp-rod', label: 'Rod', fullName: 'Rod', icon: Minus },
                { id: 'imp-cage', label: 'Cage', fullName: 'Cage', icon: Box }
            ]
        },
    ],
    generic: [
        {
            type: 'featured',
            id: 'calibration',
            label: 'Calibration',
            fullName: 'Calibration',
            icon: Scale
        },
        {
            type: 'row',
            items: [
                { id: 'line', label: 'Line tool', fullName: 'Line tool', icon: MoveHorizontal, isSegmented: true },
                { id: 'pencil', label: 'Pencil', fullName: 'Pencil', icon: Pencil },
                { id: 'text', label: 'Textbox', fullName: 'Textbox', icon: Type },
            ]
        },
        {
            type: 'section',
            label: 'Angle tools',
            items: [
                { id: 'angle-2pt', label: '2 pt', fullName: '2-point angle', symbol: '2' },
                { id: 'angle-3pt', label: '3 pt', fullName: '3-point angle', symbol: '3' },
                { id: 'angle-4pt', label: '4 pt', fullName: '4-point angle', symbol: '4' },
            ]
        },
        {
            type: 'section',
            label: 'Shape tool',
            items: [
                { id: 'circle', label: 'Circle', fullName: 'Circle', icon: Circle },
                { id: 'ellipse', label: 'Ellipse', fullName: 'Ellipse', icon: Circle, isEllipse: true },
                { id: 'polygon', label: 'Polygon', fullName: 'Polygon', icon: Pentagon },
            ]
        }
    ]
};

const TOOL_DESCRIPTIONS: Record<string, { title: string, desc: string }> = {
    cobb: { title: 'Cobb Angle', desc: 'Measures spinal curvature by intersecting endplate lines of the most tilted vertebrae in a scoliosis curve.' },
    sva: { title: 'Sagittal Vertical Axis (SVA)', desc: 'Assesses global sagittal balance by measuring horizontal offset between C7 plumb line and posterior superior sacrum.' },
    vbm: { title: 'Vertebral Body Metrics (VBM)', desc: 'Quantifies vertebral body heights, wedging, and alignment to evaluate deformity, collapse, or progression objectively.' },
    pi_ll: { title: 'PI\u2013LL Mismatch', desc: 'Calculates mismatch between pelvic incidence and lumbar lordosis to assess sagittal alignment and surgical correction targets.' },
    pelvis: { title: 'Pelvic Parameters (PI/PT/SS)', desc: 'Computes pelvic incidence, pelvic tilt, and sacral slope to characterize spinopelvic morphology and balance.' },
    cl: { title: 'Cervical Lordosis (CL)', desc: 'Measures cervical sagittal curvature between defined vertebral endplates to assess neck alignment and compensatory changes.' },
    tk: { title: 'Thoracic Kyphosis (TK)', desc: 'Quantifies thoracic spine kyphotic angle to evaluate deformity severity and global sagittal profile.' },
    ll: { title: 'Lumbar Lordosis (LL)', desc: 'Measures lumbar curvature between standard vertebral levels to assess sagittal alignment and harmony with pelvis.' },
    sc: { title: 'Custom Curvature', desc: 'Allows user-defined vertebral levels to calculate curvature tailored to specific anatomy or surgical planning needs.' },
    cmc: { title: 'Cobb Multi-Curve (CMC)', desc: 'Measures multiple coronal Cobb angles to characterize complex or multi-segment scoliotic deformities.' },
    csvl: { title: 'Coronal Sacral Vertical Line (CSVL)', desc: 'Assesses coronal balance by measuring trunk deviation relative to the sacral midline.' },
    c7pl: { title: 'Plumb Line (C7PL)', desc: 'Evaluates coronal alignment by projecting a vertical line from C7 relative to pelvic landmarks.' },
    ts: { title: 'Trunk Shift (TS)', desc: 'Measures lateral displacement of the trunk relative to pelvis to quantify coronal imbalance.' },
    avt: { title: 'Apical Vertebral Shift (AVT)', desc: 'Quantifies lateral displacement of the curve\u2019s apical vertebra from the central sacral reference line.' },
    rvad: { title: 'Rib Vertebral Angle Difference (RVAD)', desc: 'Measures rib-vertebra angle asymmetry to assess scoliosis severity and progression risk.' },
    po: { title: 'Pelvic Obliquity (PO)', desc: 'Measures pelvic tilt in the coronal plane, useful in leg length discrepancy and neuromuscular scoliosis.' },
    itilt: { title: 'UIV/LIV Tilt', desc: 'Quantifies coronal tilt of upper or lower instrumented vertebrae for surgical planning and postoperative assessment.' },
    tpa: { title: 'T1 Pelvic Angle (TPA)', desc: 'Integrates trunk inclination and pelvic tilt to assess global sagittal deformity independent of patient positioning.' },
    spa: { title: 'Spinopelvic Angle (SPA)', desc: 'Measures angular relationship between spine and pelvis to evaluate overall sagittal alignment.' },
    ssa: { title: 'Spinosacral Angle (SSA)', desc: 'Assesses global sagittal posture using angle between sacrum and C7 spinal axis.' },
    t1spi: { title: 'T1 Spinopelvic Inclination (T1SPI)', desc: 'Measures inclination of T1 relative to pelvis to quantify sagittal imbalance severity.' },
    t9spi: { title: 'T9 Spinopelvic Inclination (T9SPI)', desc: 'Evaluates mid-thoracic contribution to sagittal balance using T9-pelvis angular relationship.' },
    odha: { title: 'Odontoid Hip Axis Angle (ODHA)', desc: 'Assesses head-to-pelvis alignment, useful for evaluating horizontal gaze compensation.' },
    cbva: { title: 'Chin Brow Vertical Angle (CBVA)', desc: 'Quantifies horizontal gaze by measuring angle between chin-brow line and vertical reference.' },
    slope: { title: 'Vertebral Endplate Slope (\u0394Y/\u0394X)', desc: 'Measures slope of selected vertebral endplates to assess local sagittal orientation.' },
    stenosis: { title: 'Stenosis', desc: 'Marks and documents spinal canal narrowing regions for qualitative assessment and correlation with clinical symptoms.' },
    spondy: { title: 'Spondylolisthesis', desc: 'Measures vertebral slippage percentage and grade to assess instability and progression.' },
    'ost-pso': { title: 'Pedicle Subtraction Osteotomy (PSO)', desc: 'Plans wedge resection through vertebral body to achieve powerful sagittal correction.' },
    'ost-spo': { title: 'Smith-Petersen Osteotomy (SPO)', desc: 'Plans posterior column osteotomy to restore lordosis through controlled segmental extension.' },
    'ost-resect': { title: 'Resection Plan', desc: 'Defines bone resection geometry and correction targets for surgical planning.' },
    'ost-open': { title: 'Opening Wedge', desc: 'Simulates controlled opening correction to achieve angular realignment.' },
    'imp-screw': { title: 'Screw', desc: 'Places pedicle screws for fixation planning and construct visualization.' },
    'imp-rod': { title: 'Rod', desc: 'Adds connecting rods to simulate spinal instrumentation and alignment correction.' },
    'imp-cage': { title: 'Cage', desc: 'Positions interbody cages to assess disc height restoration and sagittal correction.' },
};

const LeftSidebar = () => {
    const navigate = useNavigate();
    const { resolvedTheme } = useTheme();
    const isDark = resolvedTheme === 'dark';
    const {
        activeTool,
        setActiveTool,
        dicom3D,
        setDicom3DMode,
        setDicom3DRenderMode,
        // setDicom3DIsoThreshold,
        removeThreeDImplant,
        isLeftSidebarOpen,
        toggleLeftSidebar,
        isWizardIconVisible,
        toggleWizardIcon,
        clearImage,
        setActiveContextId,
        // updateRoiCrop,
        // setDicomCroppingActive,
        // setDicom3DShowClipBox,
        setDicom3DVolumeThreshold,
        sidebarActiveModule,
        setSidebarActiveModule,
        pedicleSimulations,
        updatePedicleSimulation,
        threeDImplants,
        updateThreeDImplant,
        setSelectedDicomImplant,
        addThreeDImplant,
        setDicomLandmarkLevel,
        // triggerFocusCrop,
        setScrewConfig,
        setSelectedLandmarkId
    } = useAppStore();

    const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({});
    const [expandedImplantId, setExpandedImplantId] = useState<string | null>(null);
    const [isMetadataOpen, setIsMetadataOpen] = useState(false);

    const { screwDiameter, screwLength, screwLevel, screwSide, screwColor, selectedLandmarkId, interactionMode } = dicom3D;
    const selectedImplant = threeDImplants.find(imp => imp.id === dicom3D.selectedImplantId);

    const renderGridModule = () => (
        <div className="space-y-3">
            {TOOLS[sidebarActiveModule].map((section, idx) => {
                if (section.type === 'grid') {
                    return (
                        <div key={idx} className="flex flex-col gap-1 px-2">
                            {section.items.map((item: any, itemIdx: number) => (
                                <ListToolItem
                                    key={item.id}
                                    {...item}
                                    active={activeTool === item.id}
                                    onClick={() => setActiveTool(activeTool === item.id ? null : item.id)}
                                    showDivider={itemIdx < section.items.length - 1}
                                />
                            ))}
                        </div>
                    );
                }
                if (section.type === 'section') {
                    const sectionKey = `${sidebarActiveModule}-${idx}`;
                    const isCollapsed = collapsedSections[sectionKey];
                    return (
                        <div key={idx} className="space-y-1 px-2">
                            <div
                                className="flex items-center justify-between px-1 cursor-pointer group"
                                onClick={() => setCollapsedSections(prev => ({ ...prev, [sectionKey]: !prev[sectionKey] }))}
                            >
                                <div className="text-[10px] font-bold text-muted-foreground/80 uppercase tracking-widest font-['Outfit']">
                                    {section.label}
                                </div>
                                <ChevronDown className={cn("h-3.5 w-3.5 text-muted-foreground/60 transition-transform", isCollapsed ? '-rotate-90' : '')} />
                            </div>
                            <div className="h-[1px] w-full bg-border/60 mx-1" />
                            {!isCollapsed && (
                                <div className="flex flex-col gap-1 pt-1">
                                    {section.items.map((item: any, itemIdx: number) => (
                                        <ListToolItem
                                            key={item.id}
                                            {...item}
                                            active={activeTool === item.id}
                                            onClick={() => setActiveTool(activeTool === item.id ? null : item.id)}
                                            showDivider={itemIdx < section.items.length - 1}
                                        />
                                    ))}
                                </div>
                            )}
                        </div>
                    );
                }
                return null;
            })}
        </div>
    );

    const renderThreeDModule = () => (
        <div className="space-y-5">
            <div className="grid grid-cols-2 gap-1 p-1 bg-muted/40 border border-border/50 rounded-2xl">
                <button
                    onClick={() => setDicom3DRenderMode('volume')}
                    className={cn(
                        "flex items-center justify-center gap-1.5 py-2.5 rounded-xl transition-all duration-300 text-[10px] font-bold uppercase tracking-wider",
                        dicom3D.renderMode === 'volume' ? "bg-primary text-primary-foreground shadow-lg" : "text-muted-foreground hover:text-foreground"
                    )}
                >
                    <Box className="h-3.5 w-3.5" />
                    Volume
                </button>
                <button
                    onClick={() => setDicom3DRenderMode('segmentation')}
                    className={cn(
                        "flex items-center justify-center gap-1.5 py-2.5 rounded-xl transition-all duration-300 text-[10px] font-bold uppercase tracking-wider",
                        dicom3D.renderMode === 'segmentation' ? "bg-primary text-primary-foreground shadow-lg" : "text-muted-foreground hover:text-foreground"
                    )}
                >
                    <Layers className="h-3.5 w-3.5" />
                    Segment
                </button>
            </div>

            {/* 
             <div className="grid grid-cols-2 gap-2">
                 <button
                     onClick={() => setDicomCroppingActive(!dicom3D.isCroppingActive)}
                     className={cn(
                         "flex items-center justify-center gap-2 py-2.5 rounded-xl border transition-all font-bold uppercase text-[10px] tracking-widest",
                         dicom3D.isCroppingActive
                             ? "bg-primary/20 border-primary text-primary"
                             : "bg-muted/40 border-border/50 text-muted-foreground hover:text-foreground"
                     )}
                 >
                     <Scissors className="h-3.5 w-3.5" />
                     Crop
                 </button>
                 <button
                     onClick={() => {
                         triggerFocusCrop();
                         setDicom3DMode('view');
                     }}
                     className="flex items-center justify-center gap-2 py-2.5 rounded-xl border border-primary/50 bg-primary/10 text-primary hover:bg-primary/20 transition-all font-bold uppercase text-[10px] tracking-widest active:scale-95"
                 >
                     <Target className="h-3.5 w-3.5" />
                     Active
                 </button>
             </div>
             */}

            <div className="p-3 bg-primary/10 border border-primary/20 rounded-xl space-y-2">
                <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold text-primary uppercase tracking-widest">3D Reconstruction</span>
                    <span className="text-[8px] text-muted-foreground uppercase font-bold">CT-Bone</span>
                </div>
                <Button
                    size="sm"
                    className="w-full text-[10px] h-8 bg-primary hover:bg-primary/90 text-primary-foreground font-bold uppercase tracking-widest shadow-lg shadow-primary/20"
                    onClick={() => {
                        setDicom3DRenderMode('volume');
                        useAppStore.getState().setDicom3DVolumeThreshold(300);
                        useAppStore.getState().setDicomLayoutMode('focus-3d');
                        setDicom3DMode('view');
                    }}
                >
                    <span className="mr-2">🦴</span> Extract Spine
                </Button>

                {/* 
                 <div className="flex items-center justify-between px-1 py-1">
                     <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider">Show Clip Box on 3D</span>
                     <button
                         onClick={() => setDicom3DShowClipBox(!dicom3D.showClipBox3D)}
                         className={cn(
                             "w-8 h-4 rounded-full transition-colors relative",
                             dicom3D.showClipBox3D ? "bg-primary" : "bg-muted shadow-inner"
                         )}
                     >
                         <div className={cn(
                             "absolute top-0.5 w-3 h-3 rounded-full bg-white transition-all shadow-sm",
                             dicom3D.showClipBox3D ? "translate-x-4" : "translate-x-0.5"
                         )} />
                     </button>
                 </div>
                 */}

                {dicom3D.renderMode === 'volume' && (
                    <div className="space-y-2 pt-1">
                        <div className="flex justify-between items-center">
                            <div className="text-[9px] text-muted-foreground uppercase font-bold tracking-wider">Bone Threshold (HU)</div>
                            <span className="text-[9px] font-mono font-bold text-primary">{dicom3D.volumeThreshold}</span>
                        </div>
                        <Slider
                            value={[dicom3D.volumeThreshold]}
                            min={-500}
                            max={1000}
                            step={10}
                            onValueChange={([v]) => setDicom3DVolumeThreshold(v)}
                        />
                    </div>
                )}
            </div>

            {/* 
             {dicom3D.isCroppingActive && (
                 <div className="p-3 rounded-xl bg-card border border-border shadow-md space-y-3">
                     <div className="flex justify-between items-center bg-yellow-500/10 -mx-3 -mt-3 p-3 border-b border-yellow-500/20 rounded-t-xl mb-1">
                         <span className="text-[10px] font-bold text-yellow-600 uppercase tracking-widest px-1">2. Crop ROI</span>
                         <Scissors className="h-3.5 w-3.5 text-yellow-600" />
                     </div>
                     <div className="space-y-3 px-1">
                         {[
                             { label: 'L-R Min', key: 'x0', color: 'text-blue-500', accent: 'accent-blue-500' },
                             { label: 'L-R Max', key: 'x1', color: 'text-blue-500', accent: 'accent-blue-500' },
                             { label: 'P-A Min', key: 'y0', color: 'text-orange-500', accent: 'accent-orange-500' },
                             { label: 'P-A Max', key: 'y1', color: 'text-orange-500', accent: 'accent-orange-500' },
                             { label: 'I-S Min', key: 'z0', color: 'text-green-500', accent: 'accent-green-500' },
                             { label: 'I-S Max', key: 'z1', color: 'text-green-500', accent: 'accent-green-500' },
                         ].map((dim) => (
                             <div key={dim.key} className="space-y-1.5">
                                 <div className="flex justify-between items-center">
                                     <div className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider">{dim.label}</div>
                                     <span className={cn("text-[9px] font-mono font-bold", dim.color)}>
                                         {((dicom3D.roiCrop as any)[dim.key]).toFixed(1)}
                                     </span>
                                 </div>
                                 <input
                                     type="range" min={0} max={1} step={0.01}
                                     value={(dicom3D.roiCrop as any)[dim.key]}
                                     onChange={e => updateRoiCrop({ [dim.key]: parseFloat(e.target.value) })}
                                     className={cn("w-full h-1.5 bg-muted rounded-full appearance-none cursor-pointer", dim.accent)}
                                 />
                             </div>
                         ))}
                     </div>
                 </div>
             )}
             */}

            <div className="p-3 rounded-xl bg-card border border-border shadow-md space-y-3">
                <div className="flex justify-between items-center bg-blue-500/10 -mx-3 -mt-3 p-3 border-b border-blue-500/20 rounded-t-xl mb-1">
                    <span className="text-[10px] font-bold text-blue-600 uppercase tracking-widest">3. Point-to-Screw Plan</span>
                    <Target className="h-3 w-3 text-blue-600" />
                </div>

                <div className="p-2.5 bg-yellow-500/10 border border-yellow-500/20 rounded-lg">
                    <p className="text-[10px] leading-relaxed text-yellow-600 dark:text-yellow-400">
                        <span className="font-bold">Workflow:</span> Drop points (F) first, then select it to load a screw.
                    </p>
                </div>

                {/* A. POINT PLACEMENT */}
                <div className="space-y-2 pb-2 border-b border-border/50">
                    <div className="flex items-center justify-between px-1">
                        <div className="flex flex-col">
                            <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest">A. Point Placement</span>
                            {selectedLandmarkId && interactionMode === 'place_fiducial' && (
                                <span className="text-[8px] text-yellow-500 font-bold animate-pulse">
                                    Refining {pedicleSimulations.find(s => s.label === 'sim')?.landmarks.fiducials?.find(f => f.id === selectedLandmarkId)?.label}
                                </span>
                            )}
                        </div>
                        <div className="flex items-center gap-1">
                            <div className="w-1.5 h-1.5 rounded-full bg-yellow-500" />
                            <span className="text-[9px] font-mono text-yellow-600 font-bold">
                                {(pedicleSimulations.find(s => s.label === 'sim')?.landmarks as any)?.fiducials?.length || 0} Points
                            </span>
                        </div>
                    </div>
                    <Button
                        size="sm"
                        variant={interactionMode === 'place_fiducial' ? "default" : "outline"}
                        className={cn(
                            "w-full h-8 text-[10px] font-bold uppercase tracking-widest transition-all",
                            interactionMode === 'place_fiducial'
                                ? "bg-yellow-500 hover:bg-yellow-600 text-white border-none shadow-md"
                                : "hover:bg-yellow-500/10 hover:text-yellow-600 border-yellow-500/30"
                        )}
                        onClick={() => {
                            if (interactionMode === 'place_fiducial') {
                                if (selectedLandmarkId) {
                                    // If already placing and has selection, deselect to allow NEW point next click
                                    setSelectedLandmarkId(null);
                                } else {
                                    // If already placing but NO selection, toggle OFF
                                    setDicom3DMode('view');
                                }
                            } else {
                                // Toggle ON
                                setDicom3DMode('place_fiducial');
                                setDicomLandmarkLevel('sim');
                            }
                        }}
                    >
                        {interactionMode === 'place_fiducial'
                            ? (selectedLandmarkId ? "✓ Refining Point" : "✓ Click Views to Add")
                            : "+ Point (F)"}
                    </Button>
                </div>

                {/* B. SCREW LOADING */}
                <div className="space-y-3 pt-1">
                    <div className="flex items-center justify-between px-1">
                        <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest">B. Screw Loading</span>
                    </div>

                    <div className="grid grid-cols-1 gap-2">
                        <div className="space-y-1">
                            <label className="text-[8px] font-bold text-muted-foreground uppercase tracking-wider pl-1 font-bold">Target Point</label>
                            <Select value={selectedLandmarkId || ""} onValueChange={setSelectedLandmarkId}>
                                <SelectTrigger className={cn(
                                    "w-full h-8 font-bold text-[10px] rounded-lg",
                                    isDark ? "bg-[#0A1929] border-[#1E3A5F] text-[#E3F2FD]" : "bg-white border-gray-300 text-slate-900"
                                )}>
                                    <SelectValue placeholder="Choose a point..." />
                                </SelectTrigger>
                                <SelectContent className={cn(
                                    isDark ? "bg-[#0F2A44] border-[#1E3A5F]" : "bg-white border-gray-300"
                                )}>
                                    {(pedicleSimulations.find(s => s.label === 'sim')?.landmarks as any)?.fiducials?.map((f: any) => (
                                        <SelectItem key={f.id} value={f.id} className={cn(
                                            "text-[10px]",
                                            isDark ? "text-[#E3F2FD] focus:bg-[#132F4C] focus:text-[#E3F2FD]" : "text-slate-900 focus:bg-slate-100 focus:text-slate-900"
                                        )}>
                                            {f.label}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                        <div className="space-y-1">
                            <label className="text-[8px] font-bold text-muted-foreground uppercase tracking-wider pl-1 font-bold">Level</label>
                            <Select
                                value={screwLevel}
                                onValueChange={(l) => {
                                    const defaults = getLevelDefaults(l);
                                    const firstMeas = defaults.measurements[0];
                                    setScrewConfig({
                                        screwLevel: l,
                                        screwDiameter: firstMeas.diameter,
                                        screwLength: firstMeas.lengths[0],
                                        screwColor: defaults.color
                                    });
                                }}
                            >
                                <SelectTrigger className={cn(
                                    "w-full h-8 font-bold text-[10px] rounded-lg",
                                    isDark ? "bg-[#0A1929] border-[#1E3A5F] text-[#E3F2FD]" : "bg-white border-gray-300 text-slate-900"
                                )}>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent className={cn(
                                    "max-h-[200px]",
                                    isDark ? "bg-[#0F2A44] border-[#1E3A5F]" : "bg-white border-gray-300"
                                )}>
                                    {SPINAL_LEVELS.map(l => (
                                        <SelectItem key={l} value={l} className={cn(
                                            "text-[10px]",
                                            isDark ? "text-[#E3F2FD] focus:bg-[#132F4C] focus:text-[#E3F2FD]" : "text-slate-900 focus:bg-slate-100 focus:text-slate-900"
                                        )}>{l}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-1">
                            <label className="text-[8px] font-bold text-muted-foreground uppercase tracking-wider pl-1 font-bold">Side</label>
                            <div className={cn(
                                "grid grid-cols-2 gap-1 p-1 border border-border/50 rounded-lg h-8",
                                isDark ? "bg-slate-800" : "bg-slate-100"
                            )}>
                                {(['L', 'R'] as const).map(s => (
                                    <button
                                        key={s}
                                        onClick={() => setScrewConfig({ screwSide: s })}
                                        className={cn(
                                            "text-[10px] font-bold rounded transition-all",
                                            screwSide === s ? "bg-primary text-primary-foreground shadow" : "text-muted-foreground hover:text-foreground"
                                        )}
                                    >
                                        {s}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                        <div className="space-y-1">
                            <label className="text-[8px] font-bold text-muted-foreground uppercase tracking-wider pl-1 font-bold">Diameter</label>
                            <Select
                                value={screwDiameter.toString()}
                                onValueChange={(v) => {
                                    const d = parseFloat(v);
                                    const defaults = getLevelDefaults(screwLevel);
                                    const meas = defaults.measurements.find(m => m.diameter === d);
                                    setScrewConfig({
                                        screwDiameter: d,
                                        screwLength: meas ? meas.lengths[0] : screwLength
                                    });
                                }}
                            >
                                <SelectTrigger className={cn(
                                    "w-full h-8 font-bold text-[10px] rounded-lg",
                                    isDark ? "bg-[#0A1929] border-[#1E3A5F] text-[#E3F2FD]" : "bg-white border-gray-300 text-slate-900"
                                )}>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent className={cn(
                                    isDark ? "bg-[#0F2A44] border-[#1E3A5F]" : "bg-white border-gray-300"
                                )}>
                                    {getLevelDefaults(screwLevel).measurements.map(m => (
                                        <SelectItem key={m.diameter} value={m.diameter.toString()} className={cn(
                                            "text-[10px]",
                                            isDark ? "text-[#E3F2FD] focus:bg-[#132F4C] focus:text-[#E3F2FD]" : "text-slate-900 focus:bg-slate-100 focus:text-slate-900"
                                        )}>
                                            {m.diameter.toFixed(1)}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-1">
                            <label className="text-[8px] font-bold text-muted-foreground uppercase tracking-wider pl-1 font-bold">Length</label>
                            <Select value={screwLength.toString()} onValueChange={(v) => setScrewConfig({ screwLength: parseInt(v) })}>
                                <SelectTrigger className={cn(
                                    "w-full h-8 font-bold text-[10px] rounded-lg",
                                    isDark ? "bg-[#0A1929] border-[#1E3A5F] text-[#E3F2FD]" : "bg-white border-gray-300 text-slate-900"
                                )}>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent className={cn(
                                    isDark ? "bg-[#0F2A44] border-[#1E3A5F]" : "bg-white border-gray-300"
                                )}>
                                    {(getLevelDefaults(screwLevel).measurements.find(m => m.diameter === screwDiameter)?.lengths || []).map(v => (
                                        <SelectItem key={v} value={v.toString()} className={cn(
                                            "text-[10px]",
                                            isDark ? "text-[#E3F2FD] focus:bg-[#132F4C] focus:text-[#E3F2FD]" : "text-slate-900 focus:bg-slate-100 focus:text-slate-900"
                                        )}>{v}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>

                    <div className="flex gap-2">
                        <Button
                            size="sm"
                            disabled={!selectedLandmarkId}
                            className="flex-1 h-9 text-[10px] font-bold uppercase tracking-widest bg-cyan-600 hover:bg-cyan-500 text-white shadow-lg shadow-cyan-900/30 rounded-xl transition-all active:scale-95"
                            onClick={() => {
                                const sim = pedicleSimulations.find(s => s.label === 'sim');
                                const landmark = (sim?.landmarks as any)?.fiducials?.find((f: any) => f.id === selectedLandmarkId);
                                if (landmark) {
                                    const id = `screw-${Date.now()}`;
                                    const dKey = Math.round(screwDiameter * 100).toString();
                                    const modelName = `scaled_${dKey}x${screwLength}.vtk`;

                                    addThreeDImplant({
                                        id,
                                        type: 'screw',
                                        position: landmark.worldPos,
                                        direction: [0, -1, 0],
                                        level: screwLevel,
                                        side: screwSide,
                                        properties: {
                                            diameter: screwDiameter,
                                            length: screwLength,
                                            color: screwColor,
                                            modelPath: `/models/screws/${modelName}`,
                                            medialAngle: 0,
                                            caudalAngle: 0,
                                            depth: 0
                                        }
                                    });
                                    setSelectedDicomImplant(id);
                                    setSelectedLandmarkId(null);
                                }
                            }}
                        >
                            {"\uD83D\uDD29"} Load Screw
                        </Button>
                        <Button
                            size="sm"
                            variant="destructive"
                            disabled={!selectedLandmarkId}
                            className="h-9 px-3 rounded-xl active:scale-95 transition-all"
                            onClick={() => {
                                const sim = pedicleSimulations.find(s => s.label === 'sim');
                                if (sim && sim.id && selectedLandmarkId) {
                                    const updatedFiducials = (sim.landmarks as any).fiducials?.filter((f: any) => f.id !== selectedLandmarkId) || [];
                                    updatePedicleSimulation(sim.id, {
                                        landmarks: { ...sim.landmarks, fiducials: updatedFiducials }
                                    });
                                    setSelectedLandmarkId(null);
                                }
                            }}
                        >
                            {"\uD83D\uDDD1\uFE0F"}
                        </Button>
                    </div>

                    <div className="space-y-4 pt-4 border-t border-border/50">
                        <div className="flex items-center justify-between px-1">
                            <span className={cn(
                                "text-[10px] font-bold uppercase tracking-wider",
                                isDark ? "text-white/40" : "text-slate-500"
                            )}>Manual Adjustments</span>
                            <button
                                onClick={() => {
                                    if (selectedImplant) {
                                        updateThreeDImplant(selectedImplant.id, {
                                            properties: {
                                                ...selectedImplant.properties,
                                                caudalAngle: 0,
                                                medialAngle: 0,
                                                depth: 0
                                            }
                                        });
                                    }
                                }}
                                className={cn(
                                    "p-1 rounded-md transition-colors group disabled:opacity-30",
                                    isDark ? "hover:bg-white/5" : "hover:bg-slate-100"
                                )}
                                title="Reset All Adjustments"
                                disabled={!selectedImplant}
                            >
                                <RotateCcw className={cn(
                                    "h-3 w-3 group-hover:text-primary transition-colors",
                                    isDark ? "text-white/40" : "text-slate-500"
                                )} />
                            </button>
                        </div>

                        {[
                            { label: 'Caudal/Cranial', sub: '(Up/Down)', key: 'caudalAngle', min: -15, max: 15, unit: '°' },
                            { label: 'Medial/Lateral', sub: '(In/Out)', key: 'medialAngle', min: -15, max: 15, unit: '°' },
                            { label: 'Drive/Withdraw', sub: '(Depth)', key: 'depth', min: -15, max: 15, unit: 'mm' },
                        ].map((adj) => (
                            <div key={adj.key} className="space-y-2">
                                <div className="flex justify-between items-baseline px-1">
                                    <div className="flex flex-col">
                                        <span className={cn("text-[10px] font-medium", isDark ? "text-white/70" : "text-slate-700")}>{adj.label}</span>
                                        <span className={cn("text-[8px] uppercase tracking-tighter", isDark ? "text-white/30" : "text-slate-500")}>{adj.sub}</span>
                                    </div>
                                    <span className="text-[10px] font-mono text-primary bg-primary/10 px-1.5 py-0.5 rounded border border-primary/20 min-w-[35px] text-center">
                                        {(selectedImplant?.properties?.[adj.key as keyof typeof selectedImplant.properties] as number || 0) > 0 ? '+' : ''}
                                        {(selectedImplant?.properties?.[adj.key as keyof typeof selectedImplant.properties] as number || 0)}{adj.unit}
                                    </span>
                                </div>
                                <Slider
                                    value={[(selectedImplant?.properties?.[adj.key as keyof typeof selectedImplant.properties] as number || 0)]}
                                    min={adj.min}
                                    max={adj.max}
                                    step={1}
                                    disabled={!selectedImplant}
                                    onValueChange={([val]) => {
                                        if (selectedImplant) {
                                            updateThreeDImplant(selectedImplant.id, {
                                                properties: {
                                                    ...selectedImplant.properties,
                                                    [adj.key]: val
                                                }
                                            });
                                        }
                                    }}
                                    className="px-1"
                                />
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            <div className="space-y-3">
                <div className="flex items-center justify-between px-1">
                    <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Active Implants</div>
                    <span className="text-[9px] font-mono font-bold text-primary">{threeDImplants.length}</span>
                </div>
                <div className="space-y-2">
                    {threeDImplants.map((imp) => {
                        const isExpanded = expandedImplantId === imp.id;
                        const labelStr = imp.level
                            ? `${imp.level} ${imp.side === 'L' ? 'Left' : imp.side === 'R' ? 'Right' : ''}`
                            : imp.type;
                        return (
                            <div key={imp.id} className="rounded-xl bg-muted/40 border border-border/50 overflow-hidden">
                                <div className="flex items-center gap-2 p-2">
                                    <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: imp.properties.color }} />
                                    <div className="flex-1 min-w-0 flex items-center gap-2">
                                        <span className="text-[10px] font-bold uppercase text-foreground truncate">{labelStr}</span>
                                        <div className="text-[9px] text-muted-foreground/80 font-mono font-bold">
                                            {"\u2300"}{imp.properties.diameter} {"\u00D7"} {imp.properties.length}
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => setExpandedImplantId(isExpanded ? null : imp.id)}
                                        className="h-6 w-6 flex-shrink-0 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted flex items-center justify-center transition-all"
                                    >
                                        <ChevronDown className={cn("h-3 w-3 transition-transform", isExpanded ? 'rotate-180' : '')} />
                                    </button>
                                    <Button variant="ghost" size="icon" onClick={() => removeThreeDImplant(imp.id)} className="h-6 w-6 flex-shrink-0 text-muted-foreground hover:text-destructive">
                                        <Trash2 className="h-3 w-3" />
                                    </Button>
                                </div>
                                {isExpanded && (
                                    <div className="px-3 pb-3 space-y-3 border-t border-border/30 pt-2">
                                        <div className="grid grid-cols-2 gap-2">
                                            <div className="bg-muted px-2 py-1.5 rounded-lg">
                                                <div className="text-[8px] text-muted-foreground uppercase font-bold">Sagittal</div>
                                                <div className="text-[9px] font-mono text-primary font-bold">
                                                    {Math.round(imp.position[1] * 10) / 10}, {Math.round(imp.position[2] * 10) / 10}
                                                </div>
                                            </div>
                                            <div className="bg-muted px-2 py-1.5 rounded-lg">
                                                <div className="text-[8px] text-muted-foreground uppercase font-bold">Coronal</div>
                                                <div className="text-[9px] font-mono text-primary font-bold">
                                                    {Math.round(imp.position[0] * 10) / 10}, {Math.round(imp.position[2] * 10) / 10}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );

    const renderUtilitiesModule = () => (
        <div className="space-y-4">
            {TOOLS.generic.map((item: any, idx: number) => {
                if (item.type === 'featured') {
                    return (
                        <div key={idx} className="px-2">
                            <div
                                onClick={() => setActiveTool(activeTool === item.id ? null : item.id)}
                                className={cn(
                                    "w-full flex items-center gap-4 p-4 rounded-2xl cursor-pointer border shadow-sm transition-all active:scale-[0.98]",
                                    activeTool === item.id ? "bg-primary/15 border-primary shadow-lg shadow-primary/10" : "bg-card border-border hover:bg-muted"
                                )}
                            >
                                <div className={cn(
                                    "w-12 h-12 flex items-center justify-center rounded-xl border transition-all",
                                    activeTool === item.id ? "bg-primary border-primary text-primary-foreground shadow-lg" : "bg-background border-border text-muted-foreground"
                                )}>
                                    <item.icon className="h-6 w-6" />
                                </div>
                                <span className={cn(
                                    "text-xs font-bold uppercase tracking-widest font-['Outfit']",
                                    activeTool === item.id ? "text-primary" : "text-foreground"
                                )}>{item.label}</span>
                            </div>
                        </div>
                    );
                }
                if (item.type === 'row') {
                    return (
                        <div key={idx} className="flex flex-col gap-1 px-2">
                            {item.items.map((sub: any, subIdx: number) => (
                                <ListToolItem
                                    key={sub.id}
                                    {...sub}
                                    active={activeTool === sub.id}
                                    onClick={() => setActiveTool(activeTool === sub.id ? null : sub.id)}
                                    showDivider={subIdx < item.items.length - 1}
                                />
                            ))}
                        </div>
                    );
                }
                if (item.type === 'section') {
                    const sectionKey = `generic-section-${idx}`;
                    const isCollapsed = collapsedSections[sectionKey];
                    return (
                        <div key={idx} className="space-y-1 px-2">
                            <div
                                className="flex items-center justify-between px-1 cursor-pointer group"
                                onClick={() => setCollapsedSections(prev => ({ ...prev, [sectionKey]: !prev[sectionKey] }))}
                            >
                                <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest font-['Outfit']">{item.label}</div>
                                <ChevronDown className={cn("h-3.5 w-3.5 text-muted-foreground/60 transition-transform", isCollapsed ? '-rotate-90' : '')} />
                            </div>
                            <div className="h-[1px] w-full bg-border/60 mx-1" />
                            {!isCollapsed && (
                                <div className="flex flex-col gap-1 pt-1">
                                    {item.items.map((sub: any, subIdx: number) => (
                                        <ListToolItem
                                            key={sub.id}
                                            {...sub}
                                            active={activeTool === sub.id}
                                            onClick={() => setActiveTool(activeTool === sub.id ? null : sub.id)}
                                            showDivider={subIdx < item.items.length - 1}
                                        />
                                    ))}
                                </div>
                            )}
                        </div>
                    );
                }
                return null;
            })}
        </div>
    );

    const renderOtherModules = () => (
        <div className="space-y-1 px-2">
            {TOOLS[sidebarActiveModule].map((item: any, idx: number) => (
                <ListToolItem
                    key={item.id || idx}
                    label={item.label}
                    fullName={item.label}
                    icon={item.icon}
                    active={activeTool === item.id}
                    onClick={() => setActiveTool(activeTool === item.id ? null : item.id)}
                    showDivider={idx < TOOLS[sidebarActiveModule].length - 1}
                />
            ))}
        </div>
    );

    return (
        <div className="flex h-full border-r border-border bg-background z-30 transition-all duration-300">
            <div className="w-16 bg-secondary/30 flex flex-col items-center py-4 gap-4 border-r border-border relative">
                <div className="h-[1px] w-8 bg-border/50 mx-auto" />
                {MODULES.map((mod) => (
                    <NavIcon key={mod.id} icon={mod.icon} label={mod.label} active={sidebarActiveModule === mod.id} isDark={isDark} onClick={() => setSidebarActiveModule(mod.id)} />
                ))}
                <div className="mt-auto flex flex-col items-center gap-2 py-4">
                    <Button variant="ghost" size="icon" onClick={() => toggleWizardIcon()} className={cn("h-10 w-10 transition-theme", isWizardIconVisible ? "text-primary bg-primary/10" : "text-muted-foreground hover:bg-muted")}>
                        {isWizardIconVisible ? <Eye className="h-5 w-5" /> : <EyeOff className="h-5 w-5" />}
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => toggleLeftSidebar()} className="h-10 w-10 text-muted-foreground hover:bg-muted transition-theme">
                        {isLeftSidebarOpen ? <PanelLeftClose className="h-5 w-5" /> : <PanelLeftOpen className="h-5 w-5" />}
                    </Button>
                </div>
            </div>

            <div className={cn(
                "bg-background/95 backdrop-blur-xl flex flex-col transition-all duration-300 overflow-hidden",
                isLeftSidebarOpen ? "w-64 border-r border-border shadow-sm" : "w-0 border-none"
            )}>
                <div className="p-4 border-b border-border bg-card/60 backdrop-blur-md sticky top-0 z-10 hidden sm:block">
                    <h2 className="font-bold text-foreground tracking-widest uppercase text-[10px] opacity-70 font-['Outfit']">
                        {MODULES.find(m => m.id === sidebarActiveModule)?.label}
                    </h2>
                </div>
                <ScrollArea className="flex-1 w-64">
                    <div className="p-4">
                        {sidebarActiveModule === 'quick' || sidebarActiveModule === 'deformity' || sidebarActiveModule === 'planning' || sidebarActiveModule === 'pathology'
                            ? renderGridModule()
                            : sidebarActiveModule === 'threeD'
                                ? renderThreeDModule()
                                : sidebarActiveModule === 'generic'
                                    ? renderUtilitiesModule()
                                    : renderOtherModules()}
                    </div>
                </ScrollArea>
                <div className="mt-auto bg-muted/40 p-3 border-t border-border w-64 min-h-[100px] flex flex-col justify-start">
                    <div className="text-[9px] font-bold text-primary uppercase tracking-widest mb-2 flex items-center gap-2 font-['Outfit']">
                        <AlertCircle className="h-3 w-3" />
                        Smart Assistant
                    </div>
                    {activeTool && TOOL_DESCRIPTIONS[activeTool] ? (
                        <div className="space-y-1 animate-in fade-in slide-in-from-bottom-2 duration-300">
                            <div className="text-[10px] font-bold text-foreground tracking-tight font-['Outfit'] uppercase font-bold">
                                {TOOL_DESCRIPTIONS[activeTool].title}
                            </div>
                            <p className="text-[10px] text-muted-foreground/90 leading-relaxed font-medium font-['Outfit']">
                                {TOOL_DESCRIPTIONS[activeTool].desc}
                            </p>
                        </div>
                    ) : (
                        <p className="text-[10px] text-muted-foreground/60 leading-relaxed font-medium font-['Outfit'] italic">
                            Select a tool to begin.
                        </p>
                    )}
                </div>
            </div>
            <MetadataDialog open={isMetadataOpen} onOpenChange={setIsMetadataOpen} />
        </div>
    );
};

export default LeftSidebar;
