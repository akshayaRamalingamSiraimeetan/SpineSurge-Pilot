import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Upload, Image as ImageIcon, FolderInput, Database, Loader2 } from "lucide-react";
import { useAppStore, Study } from "@/lib/store/index";
import { format } from "date-fns";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { api } from "@/lib/api";
import { PACSSearch } from "./PACSSearch";
import { cn } from "@/lib/utils";


interface ImagingImportDialogProps {
    patientId: string;
    visitId?: string;
}

export function ImagingImportDialog({ patientId, visitId }: ImagingImportDialogProps) {
    const addStudy = useAppStore((state: any) => state.addStudy);
    const addScan = useAppStore((state: any) => state.addScan);
    const setActiveDialog = useAppStore((state: any) => state.setActiveDialog);
    const [open, setOpen] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Form State
    const [activeTab, setActiveTab] = useState("file");
    const [modality, setModality] = useState('X-Ray');
    const [scanType, setScanType] = useState<'Pre-op' | 'Post-op'>('Pre-op');
    const [scanDate, setScanDate] = useState(format(new Date(), 'yyyy-MM-dd'));

    // File Upload State
    const [selectedFile, setSelectedFile] = useState<File | null>(null);

    // Import Folder State
    const [folderPath, setFolderPath] = useState("C:/Users/veera/Downloads/Spine_Data");
    const [importStatus, setImportStatus] = useState<'idle' | 'scanning' | 'complete' | 'error' | 'processing'>('idle');
    const [importCount, setImportCount] = useState(0);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            setSelectedFile(e.target.files[0]);
        }
    };

    const handleUploadAndCreateStudy = async () => {
        if (!selectedFile) return;
        setImportStatus('processing');

        try {
            const studyId = `std-${Date.now()}`;
            const newStudy: Omit<Study, 'scans'> = {
                id: studyId,
                patientId,
                visitId,
                modality,
                source: 'Upload',
                acquisitionDate: scanDate
            };

            // 1. Create Study
            await addStudy(newStudy);

            // 2. Add Scan to that Study
            await addScan(patientId, studyId, {
                id: `scan-${Date.now()}`,
                type: scanType,
                date: scanDate
            }, selectedFile);

            // 3. If DICOM, trigger immediate preview
            const isDICOM = selectedFile.name.toLowerCase().endsWith('.dcm') ||
                selectedFile.name.toLowerCase().endsWith('.dicom') ||
                modality === 'CT' || modality === 'MRI';

            if (isDICOM) {
                const { loadDicomSeries } = useAppStore.getState();
                loadDicomSeries([selectedFile]);
            }

            setOpen(false);
            setSelectedFile(null);
            setImportStatus('idle');
        } catch (error: any) {
            console.error("Upload failed:", error);
            setImportStatus('error');
            alert(`Failed to upload imaging: ${error.message || 'Server connection error'}`);
        }
    };

    const handleImportFolder = async () => {
        setImportStatus('scanning');
        try {
            const result = await api.importFolder(folderPath, patientId, visitId);
            // Refresh patient data in store
            await useAppStore.getState().initializeStore();
            setImportStatus('complete');
            setImportCount((result as any).count || 0);
        } catch (error) {
            console.error("Import failed:", error);
            setImportStatus('error');
        }
    };

    return (
        <Dialog open={open} onOpenChange={(val) => { setOpen(val); setActiveDialog(val ? 'imaging-import' : null); }}>
            <DialogTrigger asChild>
                <Button size={visitId ? "sm" : "default"} className={cn(
                    "font-bold transition-all active:scale-95 shadow-lg rounded-xl",
                    visitId ? "h-6 text-[10px] py-0 px-2 bg-emerald-600/10 text-emerald-600 border border-emerald-600/20 hover:bg-emerald-600/20" : "bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-900/10"
                )}>
                    <Database className={cn(visitId ? "h-3 w-3" : "mr-2 h-4 w-4")} /> {visitId ? "Add Imaging" : "Import Imaging"}
                </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[500px] max-h-[90vh] overflow-y-auto">
                <DialogHeader className="border-b border-border pb-4 mb-4">
                    <DialogTitle className="text-xl font-bold tracking-tight">Import Imaging / Scans</DialogTitle>
                    <DialogDescription className="text-muted-foreground font-medium">
                        Add new imaging studies to this patient record ({patientId}).
                    </DialogDescription>
                </DialogHeader>

                <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                    <TabsList className="grid w-full grid-cols-3 bg-secondary/50 border border-border rounded-xl p-1 h-11">
                        <TabsTrigger value="file" className="rounded-lg font-bold data-[state=active]:bg-background data-[state=active]:shadow-sm">Manual</TabsTrigger>
                        <TabsTrigger value="folder" className="rounded-lg font-bold data-[state=active]:bg-background data-[state=active]:shadow-sm">Folder</TabsTrigger>
                        <TabsTrigger value="pacs" className="rounded-lg font-bold text-emerald-600 data-[state=active]:bg-emerald-600/10 data-[state=active]:shadow-sm">Hospital PACS</TabsTrigger>
                    </TabsList>


                    <TabsContent value="file" className="space-y-4 py-4">
                        <div className="grid grid-cols-4 items-center gap-4">
                            <Label className="text-right text-muted-foreground text-[10px] uppercase font-bold pr-3 border-r border-border h-full flex items-center justify-end tracking-wider">Modality</Label>
                            <select
                                value={modality}
                                onChange={e => setModality(e.target.value)}
                                className="col-span-3 bg-background border-border border h-10 rounded-xl text-sm px-3 text-foreground font-bold focus:ring-1 focus:ring-primary/20 outline-none transition-all cursor-pointer"
                            >
                                <option>X-Ray</option>
                                <option>MRI</option>
                                <option>CT</option>
                                <option>EOS</option>
                            </select>
                        </div>

                        <div className="grid grid-cols-4 items-center gap-4">
                            <Label className="text-right text-muted-foreground text-[10px] uppercase font-bold pr-3 border-r border-border h-full flex items-center justify-end tracking-wider">Category</Label>
                            <div className="col-span-3 flex gap-2">
                                <Button
                                    size="sm"
                                    type="button"
                                    variant={scanType === 'Pre-op' ? 'default' : 'outline'}
                                    className={cn(
                                        "flex-1 font-bold rounded-xl transition-all shadow-sm",
                                        scanType === 'Pre-op' ? 'bg-primary text-primary-foreground hover:bg-primary/90' : 'border-border hover:bg-muted text-muted-foreground'
                                    )}
                                    onClick={() => setScanType('Pre-op')}
                                >
                                    Pre-op
                                </Button>
                                <Button
                                    size="sm"
                                    type="button"
                                    variant={scanType === 'Post-op' ? 'default' : 'outline'}
                                    className={cn(
                                        "flex-1 font-bold rounded-xl transition-all shadow-sm",
                                        scanType === 'Post-op' ? 'bg-indigo-600 text-white hover:bg-indigo-700' : 'border-border hover:bg-muted text-muted-foreground'
                                    )}
                                    onClick={() => setScanType('Post-op')}
                                >
                                    Post-op
                                </Button>
                            </div>
                        </div>

                        <div
                            className="border-2 border-dashed border-border rounded-2xl p-8 flex flex-col items-center justify-center cursor-pointer hover:border-primary/50 hover:bg-primary/5 transition-all min-h-[140px] group/upload"
                            onClick={() => fileInputRef.current?.click()}
                        >
                            {selectedFile ? (
                                <div className="flex flex-col items-center">
                                    <div className="h-12 w-12 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center mb-3">
                                        <ImageIcon className="h-6 w-6 text-emerald-600" />
                                    </div>
                                    <span className="text-sm font-bold text-foreground">{selectedFile.name}</span>
                                    <span className="text-[10px] text-muted-foreground font-mono mt-1 opacity-60">{(selectedFile.size / 1024 / 1024).toFixed(2)} MB</span>
                                </div>
                            ) : (
                                <div className="flex flex-col items-center text-muted-foreground group-hover/upload:text-primary transition-colors">
                                    <Upload className="h-10 w-10 mb-2 opacity-30 group-hover/upload:scale-110 transition-transform" />
                                    <span className="text-sm font-bold">Click to select image</span>
                                    <span className="text-[10px] mt-1 opacity-50 tracking-wider font-bold">DICOM, JPG, PNG, WEBP</span>
                                </div>
                            )}
                            <input
                                type="file"
                                ref={fileInputRef}
                                className="hidden"
                                accept="image/*"
                                onChange={handleFileChange}
                            />
                        </div>

                        <div className="grid grid-cols-4 items-center gap-4">
                            <Label className="text-right text-muted-foreground text-[10px] uppercase font-bold pr-3 border-r border-border h-full flex items-center justify-end tracking-wider">Date</Label>
                            <Input
                                type="date"
                                value={scanDate}
                                onChange={e => setScanDate(e.target.value)}
                                className="col-span-3 bg-background border-border text-foreground h-10 rounded-xl font-bold focus:ring-primary/20 transition-all"
                            />
                        </div>

                        <Button
                            onClick={handleUploadAndCreateStudy}
                            disabled={!selectedFile || importStatus === 'processing'}
                            className="bg-emerald-600 hover:bg-emerald-700 text-white w-full h-11 font-bold tracking-wide rounded-xl shadow-lg shadow-emerald-900/10 transition-all active:scale-95"
                        >
                            {importStatus === 'processing' ? (
                                <span className="flex items-center gap-2">
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                    Processing...
                                </span>
                            ) : "Process & Create Study"}
                        </Button>
                    </TabsContent>

                    <TabsContent value="folder" className="space-y-4 py-4">
                        <div className="bg-secondary/40 p-5 rounded-2xl border border-border/50">
                            <Label className="text-[10px] text-muted-foreground uppercase font-bold tracking-widest mb-4 block">Server Directory Route</Label>
                            <div className="flex gap-2">
                                <Input
                                    value={folderPath}
                                    onChange={(e) => setFolderPath(e.target.value)}
                                    className="bg-background border-border font-mono text-xs h-10 rounded-xl focus:ring-primary/20 transition-all"
                                />
                            </div>
                            <p className="text-[10px] text-muted-foreground mt-4 leading-relaxed font-medium italic opacity-70">
                                * The system will recursively scan this directory on the server, attempting to match files to this patient based on directory structure or metadata.
                            </p>
                        </div>

                        {importStatus === 'complete' && (
                            <div className="bg-emerald-900/20 border border-emerald-900/50 text-emerald-400 p-3 rounded-lg text-xs text-center font-medium animate-in fade-in zoom-in duration-300">
                                Successfully synchronized {importCount} imaging files.
                            </div>
                        )}

                        {importStatus === 'error' && (
                            <div className="bg-red-900/20 border border-red-900/50 text-red-400 p-3 rounded-lg text-xs text-center font-medium animate-in shake duration-300">
                                Synchronisation failed. Verify server permissions.
                            </div>
                        )}

                        <Button
                            onClick={handleImportFolder}
                            disabled={importStatus === 'scanning'}
                            className="w-full bg-secondary hover:bg-muted text-foreground border border-border h-11 font-bold rounded-xl transition-all active:scale-95"
                        >
                            {importStatus === 'scanning' ? (
                                <span className="flex items-center gap-2">
                                    <Loader2 className="h-4 w-4 animate-spin text-primary" />
                                    Scanning...
                                </span>
                            ) : (
                                <>
                                    <FolderInput className="h-4 w-4 mr-2 text-primary" /> Start Folder Sync
                                </>
                            )}
                        </Button>
                    </TabsContent>

                    <TabsContent value="pacs" className="py-4">
                        <PACSSearch
                            patientId={patientId}
                            visitId={visitId}
                            onImportSuccess={() => {
                                setImportStatus('complete');
                                // Could add count here if we pass it back
                            }}
                        />
                    </TabsContent>
                </Tabs>

            </DialogContent>
        </Dialog>
    );
}
