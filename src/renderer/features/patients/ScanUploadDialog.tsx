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
import { Upload, Plus, Image as ImageIcon, FolderInput } from "lucide-react";
import { useAppStore } from "@/lib/store/index";
import { format } from "date-fns";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";

interface ScanUploadDialogProps {
    patientId: string;
    visitId: string;
}

export function ScanUploadDialog({ patientId, visitId }: ScanUploadDialogProps) {
    const addScan = useAppStore(state => state.addScan);
    const [open, setOpen] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Form State
    const [activeTab, setActiveTab] = useState("file");
    const [scanType, setScanType] = useState<'Pre-op' | 'Post-op'>('Pre-op');
    const [scanDate, setScanDate] = useState(format(new Date(), 'yyyy-MM-dd'));

    // File Upload State
    const [selectedFile, setSelectedFile] = useState<File | null>(null);

    // Import Folder State
    const [folderPath, setFolderPath] = useState("C:/Users/veera/Downloads/Spine_Data/Patient_A");
    const [importStatus, setImportStatus] = useState<'idle' | 'scanning' | 'complete' | 'error'>('idle');
    const [importCount, setImportCount] = useState(0);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            setSelectedFile(e.target.files[0]);
        }
    };

    const handleSaveFile = async () => {
        if (!selectedFile) return;
        await addScan(patientId, visitId, {
            id: Date.now().toString(),
            type: scanType,
            date: scanDate
        }, selectedFile);
        setOpen(false);
        setSelectedFile(null);
    };

    const handleImportFolder = async () => {
        setImportStatus('scanning');
        try {
            const result = await api.importFolder(folderPath);
            setImportStatus('complete');
            setImportCount((result as any).count || 0);
        } catch (error) {
            console.error("Import failed:", error);
            setImportStatus('error');
        }
    };

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <div className="h-14 w-14 rounded-xl border border-dashed border-border flex flex-col items-center justify-center cursor-pointer hover:border-primary hover:bg-muted text-muted-foreground hover:text-primary transition-all group/upload" title="Import / Upload">
                    <Plus className="h-5 w-5 mb-1" />
                    <span className="text-[8px] font-bold uppercase">Add</span>
                </div>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[500px]">
                <DialogHeader className="border-b border-border pb-4 mb-4">
                    <DialogTitle className="text-xl font-bold tracking-tight">Add Imaging</DialogTitle>
                    <DialogDescription className="text-muted-foreground font-medium">
                        Upload a single file or import a folder of scans.
                    </DialogDescription>
                </DialogHeader>

                <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                    <TabsList className="grid w-full grid-cols-2 bg-muted/50 border border-border rounded-xl p-1 h-11">
                        <TabsTrigger value="file" className="rounded-lg font-bold data-[state=active]:bg-background data-[state=active]:shadow-sm">Upload File</TabsTrigger>
                        <TabsTrigger value="folder" className="rounded-lg font-bold data-[state=active]:bg-background data-[state=active]:shadow-sm">Import Folder</TabsTrigger>
                    </TabsList>

                    {/* --- TAB 1: FILE UPLOAD --- */}
                    <TabsContent value="file" className="space-y-4 py-4">
                        {/* Type Selection */}
                        <div className="flex gap-4 justify-center">
                            <Button
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

                        {/* File Drop Zone */}
                        <div
                            className="border-2 border-dashed border-border rounded-2xl p-8 flex flex-col items-center justify-center cursor-pointer hover:border-primary/50 hover:bg-primary/5 transition-all min-h-[140px] group/upload"
                            onClick={() => fileInputRef.current?.click()}
                        >
                            {selectedFile ? (
                                <div className="flex flex-col items-center">
                                    <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center mb-3">
                                        <ImageIcon className="h-6 w-6 text-primary" />
                                    </div>
                                    <span className="text-sm font-bold text-foreground">{selectedFile.name}</span>
                                    <span className="text-[10px] text-muted-foreground font-bold font-mono mt-1 opacity-60">{(selectedFile.size / 1024 / 1024).toFixed(2)} MB</span>
                                </div>
                            ) : (
                                <div className="flex flex-col items-center text-muted-foreground group-hover/upload:text-primary transition-colors">
                                    <Upload className="h-10 w-10 mb-2 opacity-30 group-hover/upload:scale-110 transition-transform" />
                                    <span className="text-sm font-bold">Click to select image</span>
                                    <span className="text-[10px] mt-1 opacity-50 tracking-wider font-bold">Supports JPG, PNG</span>
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
                            <Label className="text-right text-muted-foreground text-[10px] uppercase font-bold tracking-widest pr-2">Date</Label>
                            <Input
                                type="date"
                                value={scanDate}
                                onChange={e => setScanDate(e.target.value)}
                                className="col-span-3 bg-background border-border text-foreground h-10 rounded-xl font-bold focus:ring-primary/20 transition-all"
                            />
                        </div>

                        <Button onClick={handleSaveFile} disabled={!selectedFile} className="bg-primary hover:bg-primary/90 text-primary-foreground w-full h-11 font-bold rounded-xl shadow-lg shadow-primary/20 transition-all active:scale-95">
                            Upload & Save
                        </Button>
                    </TabsContent>

                    {/* --- TAB 2: FOLDER IMPORT --- */}
                    <TabsContent value="folder" className="space-y-4 py-4">
                        <div className="bg-muted/30 p-5 rounded-2xl border border-border">
                            <Label className="text-[10px] text-muted-foreground uppercase font-bold tracking-widest mb-4 block pl-1">Server Directory Path</Label>
                            <div className="flex gap-2">
                                <Input
                                    value={folderPath}
                                    onChange={(e) => setFolderPath(e.target.value)}
                                    className="bg-background border-border font-mono text-xs h-10 rounded-xl focus:ring-primary/20 transition-all px-3"
                                />
                            </div>
                            <p className="text-[10px] text-muted-foreground mt-4 leading-relaxed font-medium italic opacity-70">
                                * Absolute path to the folder on the server you want to import. Scanner works recursively.
                            </p>
                        </div>

                        {importStatus === 'complete' && (
                            <div className="bg-emerald-900/20 border border-emerald-900 text-emerald-400 p-3 rounded text-sm text-center">
                                Successfully imported {importCount} files.
                            </div>
                        )}

                        {importStatus === 'error' && (
                            <div className="bg-red-900/20 border border-red-900 text-red-400 p-3 rounded text-sm text-center">
                                Import failed. Check path and permissions.
                            </div>
                        )}

                        <Button
                            onClick={handleImportFolder}
                            disabled={importStatus === 'scanning'}
                            className="w-full bg-secondary hover:bg-muted text-foreground border border-border h-11 font-bold rounded-xl transition-all active:scale-95"
                        >
                            {importStatus === 'scanning' ? "Scanning..." : (
                                <>
                                    <FolderInput className="h-4 w-4 mr-2 text-primary" /> Start Import
                                </>
                            )}
                        </Button>
                    </TabsContent>
                </Tabs>
            </DialogContent>
        </Dialog>
    );
}
