import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Search, Server, Download, AlertCircle, Loader2, Settings, Check } from "lucide-react";

import { usePACSStore, PACSStudy } from "@/lib/store/pacsStore";
import { useAppStore } from "@/lib/store/index";
import { cn } from "@/lib/utils";

interface PACSSearchProps {
    patientId: string;
    visitId?: string;
    onImportSuccess?: () => void;
}

export function PACSSearch({ patientId, visitId, onImportSuccess }: PACSSearchProps) {
    const {
        configs,
        activeConfigId,
        search,
        isSearching,
        searchResults,
        importStudy,
        isImporting,
        updateConfig
    } = usePACSStore();

    const [query, setQuery] = useState({
        patientName: "",
        patientID: "",
        studyDate: ""
    });

    const [importingUID, setImportingUID] = useState<string | null>(null);
    const [showConfig, setShowConfig] = useState(false);
    const [tempUrl, setTempUrl] = useState("");
    const [tempName, setTempName] = useState("");

    const activeConfig = configs.find(c => c.id === activeConfigId);

    const handleOpenConfig = () => {
        setTempUrl(activeConfig?.url || "");
        setTempName(activeConfig?.name || "");
        setShowConfig(true);
    };

    const handleSaveConfig = () => {
        if (activeConfigId) {
            updateConfig(activeConfigId, { url: tempUrl, name: tempName });
        }
        setShowConfig(false);
    };

    const handleSearch = (e: React.FormEvent) => {
        e.preventDefault();
        search(query);
    };

    const handleImport = async (study: PACSStudy) => {
        setImportingUID(study.studyInstanceUID);
        try {
            const result = await importStudy(study.studyInstanceUID, patientId, visitId);
            if (result.success) {
                // Refresh local store to see new study
                await useAppStore.getState().initializeStore();
                if (onImportSuccess) onImportSuccess();
            }
        } catch (error) {
            console.error("Import failed:", error);
            alert("Failed to import study from PACS.");
        } finally {
            setImportingUID(null);
        }
    };

    return (
        <div className="space-y-4">
            {/* PACS Server Selector / Configure Panel */}
            {showConfig ? (
                <div className="bg-muted/30 p-5 rounded-2xl border border-border space-y-4 animate-in fade-in slide-in-from-top-2 duration-300">
                    <div className="flex items-center justify-between gap-2 mb-2">
                        <div className="flex items-center gap-2">
                            <Settings className="h-4 w-4 text-primary" />
                            <span className="text-[10px] font-bold text-foreground uppercase tracking-widest">Configure PACS Server</span>
                        </div>
                        <Button
                            variant="outline"
                            size="sm"
                            className="h-6 text-[9px] font-bold uppercase tracking-widest bg-primary/5 hover:bg-primary/10 text-primary border-primary/20"
                            onClick={() => {
                                setTempUrl("MOCK");
                                setTempName("Mock Clinical PACS");
                            }}
                        >
                            Use Mock Mode
                        </Button>
                    </div>
                    <div className="space-y-1">
                        <Label className="text-[9px] uppercase text-muted-foreground font-bold ml-1 tracking-tight">Server Name</Label>
                        <Input
                            value={tempName}
                            onChange={e => setTempName(e.target.value)}
                            placeholder="Hospital PACS"
                            className="bg-background border-border text-xs h-9 rounded-lg font-bold"
                        />
                    </div>
                    <div className="space-y-1">
                        <Label className="text-[9px] uppercase text-muted-foreground font-bold ml-1 tracking-tight">DICOMweb URL</Label>
                        <Input
                            value={tempUrl}
                            onChange={e => setTempUrl(e.target.value)}
                            placeholder="http://pacs.hospital.com/dicom-web"
                            className="bg-background border-border text-xs h-9 rounded-lg font-mono"
                        />
                        <p className="text-[9px] text-muted-foreground px-1 italic">Use "MOCK" for testing without a server.</p>
                    </div>
                    <div className="flex gap-3 pt-2">
                        <Button size="sm" variant="ghost" className="flex-1 h-9 text-[10px] font-bold text-muted-foreground" onClick={() => setShowConfig(false)}>Cancel</Button>
                        <Button size="sm" className="flex-1 h-9 text-[10px] bg-primary hover:bg-primary/90 text-primary-foreground font-bold rounded-lg shadow-lg shadow-primary/20" onClick={handleSaveConfig}>
                            <Check className="h-3 w-3 mr-1" /> Save
                        </Button>
                    </div>
                </div>
            ) : (
                <div className="bg-muted/20 p-4 rounded-2xl border border-border flex items-center justify-between group">
                    <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                            <Server className="h-5 w-5 text-primary" />
                        </div>
                        <div className="flex flex-col">
                            <span className="text-sm font-bold text-foreground">{activeConfig?.name || "No Server Selected"}</span>
                            <span className="text-[10px] text-muted-foreground font-mono truncate max-w-[200px] font-medium">{activeConfig?.url === 'MOCK' ? '🚀 Running in Mock Mode' : activeConfig?.url}</span>
                        </div>
                    </div>
                    <Button variant="ghost" size="sm" className="h-8 text-[11px] font-bold text-muted-foreground hover:text-foreground hover:bg-muted" onClick={handleOpenConfig}>
                        Configure
                    </Button>
                </div>
            )}

            {/* Search Form */}
            <form onSubmit={handleSearch} className="grid grid-cols-1 gap-4">
                <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                        <Label className="text-[9px] uppercase text-muted-foreground font-bold ml-1 tracking-widest pl-1">Patient Name</Label>
                        <Input
                            placeholder="DOE^JOHN"
                            className="bg-background border-border text-xs h-9 rounded-lg font-bold"
                            value={query.patientName}
                            onChange={e => setQuery({ ...query, patientName: e.target.value })}
                        />
                    </div>
                    <div className="space-y-1.5">
                        <Label className="text-[9px] uppercase text-muted-foreground font-bold ml-1 tracking-widest pl-1">Patient ID</Label>
                        <Input
                            placeholder="PID-123"
                            className="bg-background border-border text-xs h-9 rounded-lg font-bold"
                            value={query.patientID}
                            onChange={e => setQuery({ ...query, patientID: e.target.value })}
                        />
                    </div>
                </div>
                <Button type="submit" disabled={isSearching} className="bg-primary hover:bg-primary/90 text-primary-foreground h-11 font-bold rounded-xl shadow-lg shadow-primary/20 transition-all active:scale-95">
                    {isSearching ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Search className="h-4 w-4 mr-2" />}
                    Search Hospital PACS
                </Button>
            </form>

            {/* Results Area */}
            <div className="border border-border rounded-2xl overflow-hidden bg-background">
                <div className="bg-muted/50 px-4 py-2.5 border-b border-border flex justify-between items-center">
                    <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest pl-1">Available Studies</span>
                    <span className="text-[10px] text-muted-foreground font-bold opacity-60">{searchResults.length} found</span>
                </div>

                <div className="max-h-[250px] overflow-y-auto custom-scrollbar">
                    {searchResults.length > 0 ? (
                        <div className="divide-y divide-border/50">
                            {searchResults.map((study) => (
                                <div key={study.studyInstanceUID} className="p-4 hover:bg-muted/50 transition-colors group">
                                    <div className="flex justify-between items-start">
                                        <div className="space-y-1">
                                            <div className="flex items-center gap-2">
                                                <span className="text-sm font-bold text-foreground">{study.patientName}</span>
                                                <span className="bg-primary/10 text-primary text-[9px] px-2 py-0.5 rounded-md font-bold uppercase tracking-tighter">{study.modality}</span>
                                            </div>
                                            <div className="text-[10px] text-muted-foreground flex flex-col font-medium">
                                                <span className="font-bold text-foreground/70">{study.description || "No Description"}</span>
                                                <span className="opacity-60 font-mono italic">{study.studyDate} • {study.numberOfInstances} Instances</span>
                                            </div>
                                        </div>
                                        <Button
                                            size="sm"
                                            className={cn(
                                                "h-8 px-3 text-[10px] font-bold rounded-lg transition-all active:scale-95",
                                                importingUID === study.studyInstanceUID ? "bg-muted text-muted-foreground" : "bg-primary hover:bg-primary/90 text-primary-foreground shadow-sm"
                                            )}
                                            disabled={isImporting}
                                            onClick={() => handleImport(study)}
                                        >
                                            {importingUID === study.studyInstanceUID ? (
                                                <Loader2 className="h-4 w-4 animate-spin" />
                                            ) : (
                                                <><Download className="h-3 w-3 mr-1.5" /> Import</>
                                            )}
                                        </Button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="h-[120px] flex flex-col items-center justify-center text-muted-foreground opacity-40">
                            <AlertCircle className="h-6 w-6 mb-2" />
                            <span className="text-[10px] font-bold uppercase tracking-widest">No studies found or searched yet</span>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
