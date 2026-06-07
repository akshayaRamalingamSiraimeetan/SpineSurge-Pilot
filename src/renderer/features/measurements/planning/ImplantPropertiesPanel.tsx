import { useState, useEffect, useRef } from 'react';
import { Settings2, Trash2, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { getLevelDefaults } from './ScrewDefaults';
import { useAppStore } from '@/lib/store/index';

interface ImplantPropertiesPanelProps {
    implant: any;
    onUpdate: (properties: any) => void;
    onDelete: () => void;
    onClose: () => void;
    pos?: { x: number; y: number };
    isInline?: boolean;
}

export function ImplantPropertiesPanel({ implant, onUpdate, onDelete, onClose, isInline = false }: ImplantPropertiesPanelProps) {
    const { dicom3D } = useAppStore();
    const effectiveLevel = implant.level || dicom3D.screwLevel || 'C3';

    const { type, properties } = implant;
    const [position, setPosition] = useState({ x: 20, y: 100 });
    const [isDragging, setIsDragging] = useState(false);
    const dragStart = useRef({ x: 0, y: 0 });

    useEffect(() => {
        if (isInline) return; // Disable drag logic for inline mode

        const handleMouseMove = (e: MouseEvent) => {
            if (!isDragging) return;
            setPosition({
                x: e.clientX - dragStart.current.x,
                y: e.clientY - dragStart.current.y
            });
        };

        const handleMouseUp = () => {
            setIsDragging(false);
        };

        if (isDragging) {
            window.addEventListener('mousemove', handleMouseMove);
            window.addEventListener('mouseup', handleMouseUp);
        }

        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        };
    }, [isDragging, isInline]);

    if (isInline) {
        return (
            <div className="w-full space-y-4 pt-4 animate-in slide-in-from-top-2 fade-in duration-300">
                {/* Length / Diameter for Screws/Rods */}
                {(type === 'screw' || type === 'rod' || type === 'plate') && (
                    <div className="space-y-3">
                        {/* Diameter Control */}
                        <div className="space-y-1.5">
                            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-tight">Diameter</label>
                            {type === 'screw' ? (
                                <Select
                                    value={(properties.diameter || 6).toString()}
                                    onValueChange={(v) => {
                                        const d = parseFloat(v);
                                        const level = effectiveLevel;
                                        const defaults = getLevelDefaults(level);
                                        const meas = defaults.measurements.find(m => m.diameter === d);
                                        onUpdate({
                                            diameter: d,
                                            length: meas ? meas.lengths[0] : (properties.length || 40)
                                        });
                                    }}
                                >
                                    <SelectTrigger className="w-full h-8 text-[11px]">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {getLevelDefaults(effectiveLevel).measurements.map(m => (
                                            <SelectItem key={m.diameter} value={m.diameter.toString()} className="text-[11px]">
                                                {m.diameter.toFixed(1)}mm
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            ) : (
                                <>
                                    <div className="flex justify-between text-[10px] font-bold text-slate-400 uppercase tracking-tight">
                                        <span>Diameter</span>
                                        <span className="text-blue-400">{properties.diameter || 6} mm</span>
                                    </div>
                                    <Slider
                                        value={[properties.diameter || 6]}
                                        min={3.5}
                                        max={8.5}
                                        step={0.5}
                                        onValueChange={([v]) => onUpdate({ diameter: v })}
                                        className="my-1"
                                    />
                                </>
                            )}
                        </div>

                        {/* Length Control (Screw Only) */}
                        {type === 'screw' && (
                            <div className="space-y-1.5">
                                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-tight">Length</label>
                                <Select
                                    value={(properties.length || 40).toString()}
                                    onValueChange={(v) => onUpdate({ length: parseInt(v) })}
                                >
                                    <SelectTrigger className="w-full h-8 text-[11px]">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {(getLevelDefaults(effectiveLevel).measurements.find(m => m.diameter === (properties.diameter || 6))?.lengths || []).map(l => (
                                            <SelectItem key={l} value={l.toString()} className="text-[11px]">
                                                {l}mm
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        )}
                        {type === 'rod' && (
                            <div className="space-y-1.5">
                                <div className="flex justify-between text-[10px] font-bold text-slate-400 uppercase tracking-tight">
                                    <span>Length</span>
                                    <span className="text-blue-400">{Math.round(properties.length || 40)} mm</span>
                                </div>
                                <Slider
                                    value={[properties.length || 40]}
                                    min={10}
                                    max={100}
                                    step={2}
                                    onValueChange={([v]) => onUpdate({ length: v })}
                                    className="my-1"
                                />
                            </div>
                        )}
                    </div>
                )}

                {/* Cage Specifics */}
                {type === 'cage' && (
                    <div className="space-y-3">
                        <div className="space-y-1.5">
                            <div className="flex justify-between text-[10px] font-bold text-slate-400 uppercase tracking-tight">
                                <span>Height</span>
                                <span className="text-blue-400">{properties.height || 10} mm</span>
                            </div>
                            <Slider
                                value={[properties.height || 10]}
                                min={6}
                                max={18}
                                step={1}
                                onValueChange={([v]) => onUpdate({ height: v })}
                                className="my-1"
                            />
                        </div>
                        <div className="space-y-1.5">
                            <div className="flex justify-between text-[10px] font-bold text-slate-400 uppercase tracking-tight">
                                <span>Lordosis</span>
                                <span className="text-blue-400">{properties.wedgeAngle || 5}°</span>
                            </div>
                            <Slider
                                value={[properties.wedgeAngle || 5]}
                                min={0}
                                max={25}
                                step={1}
                                onValueChange={([v]) => onUpdate({ wedgeAngle: v })}
                                className="my-1"
                            />
                        </div>
                    </div>
                )}

                {/* Compact Color Selector */}
                <div className="flex items-center gap-2 pt-2 border-t border-white/5">
                    <span className="text-[10px] font-bold text-slate-500 uppercase mr-auto">Color</span>
                    {['#94a3b8', '#3b82f6', '#10b981', '#f59e0b', '#ec4899'].map(c => (
                        <div
                            key={c}
                            onClick={() => onUpdate({ color: c })}
                            className={`w-4 h-4 rounded-full cursor-pointer transition-all ${properties.color === c ? 'ring-2 ring-white ring-offset-2 ring-offset-slate-900 scale-110' : 'opacity-60 hover:opacity-100'}`}
                            style={{ backgroundColor: c }}
                        />
                    ))}
                </div>

                {/* Minimal Actions */}
                <div className="flex gap-2 pt-2">
                    <Button
                        variant="ghost"
                        size="sm"
                        className="flex-1 h-7 text-xs text-red-400 hover:text-red-300 hover:bg-red-400/10"
                        onClick={onDelete}
                    >
                        <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                        Remove
                    </Button>
                    <Button
                        variant="ghost"
                        size="sm"
                        className="flex-1 h-7 text-xs text-slate-400 hover:text-white"
                        onClick={onClose}
                    >
                        Done
                    </Button>
                </div>
            </div>
        );
    }

    return (
        <div
            className="fixed z-[100] bg-slate-900/95 backdrop-blur-xl border border-slate-700/50 rounded-2xl shadow-2xl p-4 w-64 animate-in fade-in zoom-in duration-200"
            style={{
                left: position.x,
                top: position.y
            }}
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
        >
            <div
                className="flex items-center justify-between mb-4 pb-2 border-b border-white/10 cursor-move"
                onMouseDown={(e) => {
                    e.stopPropagation();
                    setIsDragging(true);
                    dragStart.current = { x: e.clientX - position.x, y: e.clientY - position.y };
                }}
            >
                <div className="flex items-center gap-2 pointer-events-none">
                    <div className="bg-blue-600/20 p-1.5 rounded-lg">
                        <Settings2 className="h-4 w-4 text-blue-400" />
                    </div>
                    <span className="text-xs font-bold uppercase tracking-widest text-white">
                        {type} Properties
                    </span>
                </div>
                <Button variant="ghost" size="icon" className="h-6 w-6 rounded-full hover:bg-white/10" onClick={onClose}>
                    <Check className="h-3 w-3 text-white" />
                </Button>
            </div>

            <div className="space-y-4">
                {/* Length / Diameter for Screws/Rods */}
                {(type === 'screw' || type === 'rod') && (
                    <div className="space-y-3">
                        <div className="space-y-1.5">
                            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-tight">Diameter</label>
                            {type === 'screw' ? (
                                <Select
                                    value={(properties.diameter || 6).toString()}
                                    onValueChange={(v) => {
                                        const d = parseFloat(v);
                                        const level = implant.level || 'L3';
                                        const defaults = getLevelDefaults(level);
                                        const meas = defaults.measurements.find(m => m.diameter === d);
                                        onUpdate({
                                            diameter: d,
                                            length: meas ? meas.lengths[0] : (properties.length || 40)
                                        });
                                    }}
                                >
                                    <SelectTrigger className="w-full h-8 text-[11px]">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {getLevelDefaults(implant.level || 'L3').measurements.map(m => (
                                            <SelectItem key={m.diameter} value={m.diameter.toString()} className="text-[11px]">
                                                {m.diameter.toFixed(1)}mm
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            ) : (
                                <>
                                    <div className="flex justify-between text-[10px] font-bold text-slate-400 uppercase tracking-tight">
                                        <span>Diameter</span>
                                        <span className="text-blue-400">{properties.diameter || 6} mm</span>
                                    </div>
                                    <Slider
                                        value={[properties.diameter || 6]}
                                        min={3.5}
                                        max={8.5}
                                        step={0.5}
                                        onValueChange={([v]) => onUpdate({ diameter: v })}
                                    />
                                </>
                            )}
                        </div>
                        {type === 'screw' && (
                            <div className="space-y-1.5">
                                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-tight">Length</label>
                                <Select
                                    value={(properties.length || 40).toString()}
                                    onValueChange={(v) => onUpdate({ length: parseInt(v) })}
                                >
                                    <SelectTrigger className="w-full h-8 text-[11px]">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {(getLevelDefaults(implant.level || 'L3').measurements.find(m => m.diameter === (properties.diameter || 6))?.lengths || []).map(l => (
                                            <SelectItem key={l} value={l.toString()} className="text-[11px]">
                                                {l}mm
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        )}
                        {type === 'rod' && (
                            <div className="space-y-1.5">
                                <div className="flex justify-between text-[10px] font-bold text-slate-400 uppercase tracking-tight">
                                    <span>Length</span>
                                    <span className="text-blue-400">{Math.round(properties.length || 40)} mm</span>
                                </div>
                                <Slider
                                    value={[properties.length || 40]}
                                    min={20}
                                    max={65}
                                    step={5}
                                    onValueChange={([v]) => onUpdate({ length: v })}
                                />
                            </div>
                        )}
                    </div>
                )}

                {/* Cage Specifics */}
                {type === 'cage' && (
                    <div className="space-y-3">
                        <div className="space-y-1.5">
                            <div className="flex justify-between text-[10px] font-bold text-slate-400 uppercase tracking-tight">
                                <span>Height</span>
                                <span className="text-blue-400">{properties.height || 10} mm</span>
                            </div>
                            <Slider
                                value={[properties.height || 10]}
                                min={6}
                                max={18}
                                step={1}
                                onValueChange={([v]) => onUpdate({ height: v })}
                            />
                        </div>
                        <div className="space-y-1.5">
                            <div className="flex justify-between text-[10px] font-bold text-slate-400 uppercase tracking-tight">
                                <span>Lordotic Angle</span>
                                <span className="text-blue-400">{properties.wedgeAngle || 5}°</span>
                            </div>
                            <Slider
                                value={[properties.wedgeAngle || 5]}
                                min={0}
                                max={25}
                                step={1}
                                onValueChange={([v]) => onUpdate({ wedgeAngle: v })}
                            />
                        </div>
                    </div>
                )}

                {/* Color Selector */}
                <div className="grid grid-cols-4 gap-2 py-2 border-t border-white/5 mt-2">
                    {['#94a3b8', '#3b82f6', '#10b981', '#f59e0b'].map(c => (
                        <div
                            key={c}
                            onClick={() => onUpdate({ color: c })}
                            className={`h-6 rounded-md cursor-pointer border-2 transition-all ${properties.color === c ? 'border-white scale-110 shadow-lg' : 'border-transparent opacity-60 hover:opacity-100'}`}
                            style={{ backgroundColor: c }}
                        />
                    ))}
                </div>

                <div className="pt-2 border-t border-white/10 mt-2">
                    <Button
                        variant="destructive"
                        size="sm"
                        className="w-full bg-red-500/10 hover:bg-red-500/20 text-red-500 border border-red-500/20 text-[10px] font-bold uppercase tracking-widest h-8"
                        onClick={onDelete}
                    >
                        <Trash2 className="h-3 w-3 mr-2" />
                        Remove Implant
                    </Button>
                </div>
            </div>
        </div>
    );
}
