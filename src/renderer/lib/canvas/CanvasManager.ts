import { v4 as uuidv4 } from 'uuid';
import { splitPolygonByLine, getPolygonCenter, isPointInPolygon, Point } from './GeometryUtils';
import { simplifyPath } from './CurveUtils';

// Re-export Point type for use in other modules
export type { Point };


export interface Fragment {
    id: string;
    image: string | HTMLImageElement; // URL or Image object (usually URL in state)
    // Position/Transform
    imageX: number;
    imageY: number;
    imageWidth: number;
    imageHeight: number;
    x: number;
    y: number;
    rotation: number;
    pivot?: Point;
    // Geometry
    polygon: Point[];
}

export interface Measurement {
    id: string;
    toolKey: string;
    fragmentId: string | null;
    points: Point[];
    result?: any;
    measurement?: any;
    orphaned?: boolean;
    timestamp: number;
    selected?: boolean;
}

export interface Implant {
    id: string;
    type: 'screw' | 'rod' | 'cage' | 'plate' | 'spacer';
    fragmentId: string | null;
    position: Point | null; // Rods might not have single pos
    angle: number;
    properties: any;
    timestamp: number;
}

export interface CanvasData {
    fragments: Fragment[];
    cutLines: any[];
    measurements: Measurement[];
    implants: Implant[];
    description: string;
}

export class StateNode {
    uid: string;
    timestamp: number;
    data: CanvasData;
    parent: StateNode | null;
    children: StateNode[];

    constructor(data: CanvasData, parent: StateNode | null = null) {
        this.uid = uuidv4();
        this.timestamp = Date.now();
        this.data = data;
        this.parent = parent;
        this.children = [];
    }
}

export class CanvasManager {
    head: StateNode | null;
    current: StateNode | null;
    history: StateNode[];
    private redoStack: StateNode[];
    private lastState: StateNode | null; // Store state before undo for direct redo
    private activeHistoryTransaction: {
        mode: string;
        baselineHistoryLength: number;
        baselineState: StateNode | null;
    } | null;
    storageManager: any; // Placeholder for now

    constructor(storageManager: any = null) {
        this.head = null;
        this.current = null;
        this.history = [];
        this.redoStack = [];
        this.lastState = null;
        this.activeHistoryTransaction = null;
        this.storageManager = storageManager;
    }

    async initialize(baseImageData: string, initialMeasurements: Measurement[] = []): Promise<StateNode> {
        // Load image to get dimensions
        const img = new Image();
        img.crossOrigin = 'anonymous'; // Added for CORS support
        img.src = baseImageData;

        await new Promise((resolve) => {
            img.onload = resolve;
            img.onerror = resolve;
        });

        const width = img.naturalWidth || 800;
        const height = img.naturalHeight || 600;

        const initialFragment: Fragment = {
            id: uuidv4(),
            image: baseImageData,
            imageX: 0,
            imageY: 0,
            imageWidth: width,
            imageHeight: height,
            polygon: [
                { x: 0, y: 0 },
                { x: width, y: 0 },
                { x: width, y: height },
                { x: 0, y: height }
            ],
            x: 0,
            y: 0,
            rotation: 0
        };

        const initialState = new StateNode({
            fragments: [initialFragment],
            cutLines: [],
            measurements: initialMeasurements.map(m => ({ ...m, points: m.points.map(p => ({ ...p })) })),
            implants: [],
            description: 'Initial State'
        });

        this.head = initialState;
        this.current = initialState;
        this.history = [initialState];
        this.redoStack = [];
        this.lastState = null;
        this.activeHistoryTransaction = null;

        // await this.saveState(initialState);
        return initialState;
    }

    beginHistoryTransaction(mode: string) {
        if (this.activeHistoryTransaction) {
            return;
        }

        this.activeHistoryTransaction = {
            mode,
            baselineHistoryLength: this.history.length,
            baselineState: this.current
        };
        this.redoStack = [];
        this.lastState = null;
    }

    commitHistoryTransaction() {
        if (!this.activeHistoryTransaction) {
            return;
        }

        if (this.current) {
            const lastHistory = this.history[this.history.length - 1];
            if (lastHistory !== this.current) {
                this.history.push(this.current);
            }
        }

        this.head = this.history[0] ?? null;
        this.activeHistoryTransaction = null;
        this.redoStack = [];
        this.lastState = null;
    }

    rollbackHistoryTransaction() {
        if (!this.activeHistoryTransaction) {
            return;
        }

        const { baselineHistoryLength, baselineState } = this.activeHistoryTransaction;
        this.history = this.history.slice(0, baselineHistoryLength);
        this.current = baselineState;
        this.head = this.history[0] ?? null;
        this.activeHistoryTransaction = null;
        this.redoStack = [];
        this.lastState = null;
    }

    async applyOperation(operationType: string, params: any): Promise<StateNode> {
        console.log('[CanvasManager] ========== APPLYING OPERATION ==========');
        console.log('[CanvasManager] Operation type:', operationType);
        console.log('[CanvasManager] Parameters:', params);
        console.log('[CanvasManager] Current state fragments:', this.current?.data.fragments.length);

        if (!this.current) throw new Error("No active state");

        const skipHistory = !!params?.skipHistory;

        // Deep copy fragments
        const newFragments = this.current.data.fragments.map(f => ({
            ...f,
            polygon: [...f.polygon.map(p => ({ ...p }))]
        }));

        // Deep copy other arrays
        const newCutLines = [...(this.current.data.cutLines || []).map(line => ({ ...line }))];

        const newMeasurements: Measurement[] = [...(this.current.data.measurements || []).map(m => ({
            ...m,
            points: m.points.map(p => ({ ...p })),
            result: m.result && typeof m.result === 'object'
                ? (Array.isArray(m.result) ? [...m.result] : { ...m.result })
                : m.result
        }))];

        const newImplants = [...(this.current.data.implants || []).map(i => ({
            ...i,
            position: i.position ? { ...i.position } : null,
            properties: { ...i.properties }
        }))];

        let description = 'Operation';

        if (operationType === 'ROTATE') {
            const { fragmentId, angleDelta, center: customCenter } = params;
            const fragment = newFragments.find(f => f.id === fragmentId);
            if (fragment) {
                fragment.rotation = (fragment.rotation || 0) + angleDelta;

                const center = customCenter || getPolygonCenter(fragment.polygon);
                const rad = angleDelta * (Math.PI / 180);
                const cos = Math.cos(rad);
                const sin = Math.sin(rad);

                // Rotate Polygon
                fragment.polygon.forEach(p => {
                    const dx = p.x - center.x;
                    const dy = p.y - center.y;
                    p.x = (dx * cos - dy * sin) + center.x;
                    p.y = (dx * sin + dy * cos) + center.y;
                });

                // Rotate Measurements
                newMeasurements.forEach(m => {
                    if (m.fragmentId === fragmentId) {
                        m.points.forEach(p => {
                            const dx = p.x - center.x;
                            const dy = p.y - center.y;
                            p.x = (dx * cos - dy * sin) + center.x;
                            p.y = (dx * sin + dy * cos) + center.y;
                        });
                    }
                });

                // Rotate Implants
                newImplants.forEach(i => {
                    if (i.fragmentId === fragmentId) {
                        if (i.position) {
                            const dx = i.position.x - center.x;
                            const dy = i.position.y - center.y;
                            i.position.x = (dx * cos - dy * sin) + center.x;
                            i.position.y = (dx * sin + dy * cos) + center.y;
                        }
                        if (i.properties?.points) {
                            i.properties.points.forEach((p: Point) => {
                                const dx = p.x - center.x;
                                const dy = p.y - center.y;
                                p.x = (dx * cos - dy * sin) + center.x;
                                p.y = (dx * sin + dy * cos) + center.y;
                            });
                        }
                        i.angle = (i.angle || 0) + angleDelta;
                    }
                });

                description = `Rotated Fragment`;
            }
        }
        else if (operationType === 'CUT') {
            const { startPoint, endPoint, fragmentId } = params;

            console.log('[CanvasManager CUT] Operation called with:');
            console.log('  startPoint:', startPoint);
            console.log('  endPoint:', endPoint);
            console.log('  fragmentId:', fragmentId || 'ALL FRAGMENTS');
            console.log('  Current fragment count:', newFragments.length);

            // If fragmentId is specified, only cut that fragment
            // Otherwise, cut all fragments (legacy behavior)
            const fragmentsToCut = fragmentId
                ? newFragments.filter(f => f.id === fragmentId)
                : newFragments;

            console.log('[CanvasManager CUT] Fragments to cut:', fragmentsToCut.length);

            for (let i = newFragments.length - 1; i >= 0; i--) {
                const frag = newFragments[i];

                // Skip if we're only cutting a specific fragment and this isn't it
                if (fragmentId && frag.id !== fragmentId) {
                    continue;
                }

                console.log('[CanvasManager CUT] Cutting fragment:', frag.id);

                const oldFragmentId = frag.id;

                // Log original fragment polygon area for debugging
                const originalArea = this.getPolygonArea(frag.polygon);
                console.log('[CanvasManager CUT] Original fragment area:', originalArea);
                console.log('[CanvasManager CUT] Original fragment polygon points:', frag.polygon.length);

                const resultPolys = splitPolygonByLine(frag.polygon, startPoint, endPoint);

                if (resultPolys.length === 2) {
                    console.log('[CanvasManager CUT] Split successful - creating 2 new fragments');

                    // Log areas of resulting fragments
                    const area1 = this.getPolygonArea(resultPolys[0]);
                    const area2 = this.getPolygonArea(resultPolys[1]);
                    const totalNewArea = area1 + area2;
                    const areaLoss = originalArea - totalNewArea;

                    console.log('[CanvasManager CUT] Fragment 1 area:', area1, 'points:', resultPolys[0].length);
                    console.log('[CanvasManager CUT] Fragment 2 area:', area2, 'points:', resultPolys[1].length);
                    console.log('[CanvasManager CUT] Total new area:', totalNewArea);
                    console.log('[CanvasManager CUT] Area loss:', areaLoss, '(', ((areaLoss / originalArea) * 100).toFixed(2), '%)');

                    if (Math.abs(areaLoss) > 1) {
                        console.warn('[CanvasManager CUT] WARNING: Significant area loss detected!');
                    }

                    newFragments.splice(i, 1);

                    const f1 = { ...frag, id: uuidv4(), polygon: resultPolys[0] };
                    const f2 = { ...frag, id: uuidv4(), polygon: resultPolys[1] };
                    newFragments.push(f1, f2);

                    console.log('[CanvasManager CUT] New fragment IDs:', f1.id, f2.id);

                    // Reassign measurements & implants
                    newMeasurements.forEach(m => {
                        if (m.fragmentId === oldFragmentId && m.points.length > 0) {
                            if (isPointInPolygon(m.points[0], f1.polygon)) {
                                m.fragmentId = f1.id;
                            } else if (isPointInPolygon(m.points[0], f2.polygon)) {
                                m.fragmentId = f2.id;
                            } else {
                                m.fragmentId = f1.id; // Fallback
                            }
                        }
                    });

                    newImplants.forEach(i => {
                        if (i.fragmentId === oldFragmentId) {
                            const center = i.position || (i.properties?.points?.[0]);
                            if (center) {
                                if (isPointInPolygon(center, f1.polygon)) {
                                    i.fragmentId = f1.id;
                                } else if (isPointInPolygon(center, f2.polygon)) {
                                    i.fragmentId = f2.id;
                                } else {
                                    i.fragmentId = f1.id;
                                }
                            }
                        }
                    });

                    newCutLines.push({
                        start: startPoint,
                        end: endPoint,
                        timestamp: Date.now()
                    });

                    description = 'Cut Fragment';
                }
            }
        }
        else if (operationType === 'DELETE_FRAGMENT') {
            const { fragmentId } = params;
            const idx = newFragments.findIndex(f => f.id === fragmentId);
            if (idx !== -1) {
                newFragments.splice(idx, 1);
                description = `Deleted Fragment`;
            }
        }
        else if (operationType === 'MOVE') {
            const { fragmentId, deltaX, deltaY } = params;
            const fragment = newFragments.find(f => f.id === fragmentId);
            if (fragment) {
                fragment.x += deltaX;
                fragment.y += deltaY;

                // CRITICAL FIX: Update image position when fragment is moved
                fragment.imageX += deltaX;
                fragment.imageY += deltaY;

                fragment.polygon.forEach(p => {
                    p.x += deltaX;
                    p.y += deltaY;
                });

                // Move Measurements handled by position relative updates? No, they have world points
                newMeasurements.forEach(m => {
                    if (m.fragmentId === fragmentId) {
                        m.points.forEach(p => { p.x += deltaX; p.y += deltaY; });
                    }
                });

                // Move Implants
                newImplants.forEach(i => {
                    if (i.fragmentId === fragmentId) {
                        if (i.position) { i.position.x += deltaX; i.position.y += deltaY; }
                        if (i.properties?.points) {
                            i.properties.points.forEach((p: Point) => { p.x += deltaX; p.y += deltaY; });
                        }
                    }
                });
                description = `Moved Fragment`;
            }
        }
        else if (operationType === 'FREEHAND_CUT') {
            const { points } = params;
            const simplified = simplifyPath(points, 5);

            let currentFragments = [...newFragments];
            let changesMade = false;

            // Simple simplified iterative cut
            for (let i = 0; i < simplified.length - 1; i++) {
                const start = simplified[i];
                const end = simplified[i + 1];

                const nextPassFragments = [];
                for (const frag of currentFragments) {
                    const resultPolys = splitPolygonByLine(frag.polygon, start, end);
                    if (resultPolys.length === 2) {
                        changesMade = true;
                        nextPassFragments.push(
                            { ...frag, id: uuidv4(), polygon: resultPolys[0] },
                            { ...frag, id: uuidv4(), polygon: resultPolys[1] }
                        );
                    } else {
                        nextPassFragments.push(frag);
                    }
                }
                currentFragments = nextPassFragments;
            }

            if (changesMade) {
                newFragments.length = 0;
                newFragments.push(...currentFragments);
                description = 'Freehand Cut';
            }
        }
        else if (operationType === 'ADD_MEASUREMENT') {
            const { toolKey, fragmentId, points, result, measurement } = params;
            const newMeasurement: Measurement = {
                id: uuidv4(),
                toolKey,
                fragmentId: fragmentId || null,
                points: points.map((p: Point) => ({ ...p })),
                result: result || null,
                measurement: measurement || null,
                timestamp: Date.now(),
                selected: true
            };
            newMeasurements.push(newMeasurement);
            description = `Added ${toolKey} `;
        }
        else if (operationType === 'UPDATE_MEASUREMENT') {
            const { id, points, measurement: metadata, result: newResult } = params;
            const idx = newMeasurements.findIndex(m => m.id === id);
            if (idx !== -1) {
                if (points) newMeasurements[idx].points = points.map((p: Point) => ({ ...p }));
                if (metadata) newMeasurements[idx].measurement = { ...newMeasurements[idx].measurement, ...metadata };
                if (newResult !== undefined) newMeasurements[idx].result = newResult;
                description = `Updated Measurement`;
            }
        }
        else if (operationType === 'DELETE_MEASUREMENT') {
            const { id } = params;
            const idx = newMeasurements.findIndex(m => m.id === id);
            if (idx !== -1) {
                newMeasurements.splice(idx, 1);
                description = `Deleted Measurement`;
            }
        }
        else if (operationType === 'WEDGE_OSTEOTOMY') {
            const { points, type, id: updateId } = params;
            const [A, B, C] = points;
            const opId = updateId || uuidv4();

            // 1. Calculate signed rotation from BA to BC
            const angA = Math.atan2(A.y - B.y, A.x - B.x);
            const angC = Math.atan2(C.y - B.y, C.x - B.x);
            let angleDelta = (angC - angA) * (180 / Math.PI);
            while (angleDelta > 180) angleDelta -= 360;
            while (angleDelta < -180) angleDelta += 360;

            // 2. Classification Utilities
            const getCoeffs = (p1: Point, p2: Point) => ({
                a: p1.y - p2.y,
                b: p2.x - p1.x,
                c: -(p1.y - p2.y) * p1.x - (p2.x - p1.x) * p1.y
            });
            const classify = (coeffs: any, p: Point) => coeffs.a * p.x + coeffs.b * p.y + coeffs.c;

            const cBC = getCoeffs(B, C);
            const cBA = getCoeffs(B, A);

            // Side classification: 
            // fixedSide is the side of BC away from A.
            // movingSide is the side of BA away from C.
            const sA_BC = classify(cBC, A);
            const fixedSideBC = sA_BC >= 0 ? -1 : 1;

            const sC_BA = classify(cBA, C);
            const movingSideBA = sC_BA >= 0 ? -1 : 1;

            // 3. Collect Fragments to Process
            const sources = updateId
                ? newFragments.filter((f: any) => f.isSourceOf === opId)
                : newFragments.filter((f: any) => !f.isSourceOf && f.producedBy !== opId);

            const unaffected = newFragments.filter((f: any) => f.isSourceOf !== opId && f.producedBy !== opId);

            const finalProducedPieces: Fragment[] = [];
            const idsToRotate = new Set<string>();

            // Process sources (the ones being cut)
            for (const frag of sources) {
                // Keep source hidden for parametric update
                const sourceFrag = { ...frag, isSourceOf: opId };
                finalProducedPieces.push(sourceFrag as any);

                const piecesBC = splitPolygonByLine(frag.polygon, B, C);
                piecesBC.forEach(polyBC => {
                    const center = getPolygonCenter(polyBC);
                    const sideBC = classify(cBC, center) >= 0 ? 1 : -1;

                    if (sideBC === fixedSideBC) {
                        // Fixed fragment below BC
                        finalProducedPieces.push({ ...frag, id: uuidv4(), polygon: polyBC, producedBy: opId } as any);
                    } else {
                        // Potential moving or wedge - split by BA
                        const piecesBA = splitPolygonByLine(polyBC, B, A);
                        piecesBA.forEach(polyBA => {
                            const centBA = getPolygonCenter(polyBA);
                            const sideBA = classify(cBA, centBA) >= 0 ? 1 : -1;

                            if (sideBA === movingSideBA) {
                                // Moving fragment above BA
                                const newId = uuidv4();
                                finalProducedPieces.push({ ...frag, id: newId, polygon: polyBA, producedBy: opId } as any);
                                idsToRotate.add(newId);
                            }
                            // Otherwise: it's the wedge (discard)
                        });
                    }
                });
            }

            // Also check 'unaffected' fragments that should move along with the superior part
            unaffected.forEach(u => {
                const center = getPolygonCenter(u.polygon);
                const sideBA = classify(cBA, center) >= 0 ? 1 : -1;
                // If it's on the 'moving' side of the cut line
                if (sideBA === movingSideBA) {
                    idsToRotate.add(u.id);
                }
            });

            // Rebuild fragment list
            newFragments.length = 0;
            newFragments.push(...unaffected);
            finalProducedPieces.forEach(f => {
                if (!newFragments.find(exist => exist.id === f.id)) {
                    newFragments.push(f);
                }
            });

            // 4. Apply Rotation to all moving parts
            const rad = angleDelta * (Math.PI / 180);
            const cos = Math.cos(rad);
            const sin = Math.sin(rad);

            idsToRotate.forEach(fid => {
                const fragment = newFragments.find(f => f.id === fid);
                if (fragment) {
                    fragment.rotation = (fragment.rotation || 0) + angleDelta;
                    fragment.polygon.forEach(p => {
                        const dx = p.x - B.x;
                        const dy = p.y - B.y;
                        p.x = (dx * cos - dy * sin) + B.x;
                        p.y = (dx * sin + dy * cos) + B.y;
                    });

                    // Measurements on moving part
                    newMeasurements.forEach(m => {
                        if (m.fragmentId === fid) {
                            m.points.forEach(p => {
                                const dx = p.x - B.x;
                                const dy = p.y - B.y;
                                p.x = (dx * cos - dy * sin) + B.x;
                                p.y = (dx * sin + dy * cos) + B.y;
                            });
                        }
                    });

                    // Implants on moving part
                    newImplants.forEach(imp => {
                        if (imp.fragmentId === fid) {
                            if (imp.position) {
                                const dx = imp.position.x - B.x;
                                const dy = imp.position.y - B.y;
                                imp.position.x = (dx * cos - dy * sin) + B.x;
                                imp.position.y = (dx * sin + dy * cos) + B.y;
                                imp.angle += angleDelta;
                            }
                            if (imp.properties?.points) {
                                imp.properties.points.forEach((p: Point) => {
                                    const dx = p.x - B.x;
                                    const dy = p.y - B.y;
                                    p.x = (dx * cos - dy * sin) + B.x;
                                    p.y = (dx * sin + dy * cos) + B.y;
                                });
                            }
                        }
                    });
                }
            });

            // 5. Update Record
            const wedgeAngle = Math.abs(angleDelta);
            const resultMsg = `${type} Angle: ${wedgeAngle.toFixed(1)}°`;
            const existingIdx = newMeasurements.findIndex(m => m.id === opId);
            if (existingIdx !== -1) {
                newMeasurements[existingIdx].points = points.map((p: Point) => ({ ...p }));
                newMeasurements[existingIdx].result = resultMsg;
            } else {
                newMeasurements.push({
                    id: opId,
                    toolKey: type === 'PSO' ? 'ost-pso' : 'ost-spo',
                    fragmentId: null,
                    points: points.map((p: Point) => ({ ...p })),
                    result: resultMsg,
                    timestamp: Date.now()
                });
            }
            description = `Performed ${type.toUpperCase()} `;
        }
        else if (operationType === 'REPLACE_FRAGMENTS') {
            const { oldFragmentId, newFragments: replacements } = params;
            const idx = newFragments.findIndex(f => f.id === oldFragmentId);
            if (idx !== -1) {
                newFragments.splice(idx, 1);
                newFragments.push(...replacements);
                description = 'Processed Osteotomy';
            }
        }
        else if (operationType === 'UPDATE_FRAGMENT') {
            const { id, polygon, rotation, x, y } = params;
            const idx = newFragments.findIndex(f => f.id === id);
            if (idx !== -1) {
                if (polygon) newFragments[idx].polygon = polygon.map((p: Point) => ({ ...p }));
                if (rotation !== undefined) newFragments[idx].rotation = rotation;
                if (x !== undefined) newFragments[idx].x = x;
                if (y !== undefined) newFragments[idx].y = y;
                description = `Updated Fragment`;
            }
        }
        else if (operationType === 'ADD_IMPLANT') {
            const { type, position, angle, properties, fragmentId } = params;
            const newImplant: Implant = {
                id: uuidv4(),
                type,
                position: position ? { ...position } : null,
                angle: angle || 0,
                properties: properties ? { ...properties } : {},
                fragmentId: fragmentId || null,
                timestamp: Date.now()
            };
            newImplants.push(newImplant);
            description = `Added ${type.toUpperCase()}`;
        }
        else if (operationType === 'UPDATE_IMPLANT') {
            const { id, position, angle, properties, fragmentId } = params;
            const idx = newImplants.findIndex(i => i.id === id);
            if (idx !== -1) {
                if (position) newImplants[idx].position = { ...position };
                if (angle !== undefined) newImplants[idx].angle = angle;
                if (properties) newImplants[idx].properties = { ...newImplants[idx].properties, ...properties };
                if (fragmentId !== undefined) newImplants[idx].fragmentId = fragmentId;
                description = 'Updated Implant';
            }
        }
        else if (operationType === 'DELETE_IMPLANT') {
            const { id } = params;
            const idx = newImplants.findIndex(i => i.id === id);
            if (idx !== -1) {
                newImplants.splice(idx, 1);
                description = 'Deleted Implant';
            }
        }
        else if (operationType === 'MOVE_IMPLANT') {
            const { id, deltaX, deltaY } = params;
            const idx = newImplants.findIndex(i => i.id === id);
            if (idx !== -1) {
                const imp = newImplants[idx];
                if (imp.position) {
                    imp.position.x += deltaX;
                    imp.position.y += deltaY;
                }
                if (imp.properties?.points) {
                    imp.properties.points.forEach((p: Point) => {
                        p.x += deltaX;
                        p.y += deltaY;
                    });
                }
                description = 'Moved Implant';
            }
        }

        const newState = new StateNode({
            fragments: newFragments,
            cutLines: newCutLines,
            measurements: newMeasurements,
            implants: newImplants,
            description
        }, this.current);

        this.current.children.push(newState);
        this.current = newState;
        if (!this.activeHistoryTransaction) {
            if (skipHistory && this.history.length > 0) {
                // Keep current state in sync without adding a new undo step.
                this.history[this.history.length - 1] = newState;
            } else {
                this.history.push(newState);
            }
            this.redoStack = [];
            this.lastState = null;
        }

        return newState;
    }

    undo() {
        // Normal undo behavior
        if (this.history.length > 1) {
            // Store current state before popping (this is the state we'll return to with redo)
            this.lastState = this.current;
            
            const popped = this.history.pop();
            if (popped) {
                this.redoStack.push(popped);
            }

            this.current = this.history[this.history.length - 1] ?? null;
            return this.current;
        }
        return null;
    }

    redo() {
        // Normal redo behavior
        // If we have a lastState (stored before undo), restore to it directly
        if (this.lastState) {
            const state = this.lastState;
            this.lastState = null;
            // Also remove it from redoStack since we're consuming it
            if (this.redoStack.length > 0) {
                this.redoStack.pop();
            }
            this.history.push(state);
            this.current = state;
            return this.current;
        }
        
        // Use redoStack for normal redo flow (when no lastState or after lastState is consumed)
        if (this.redoStack.length > 0) {
            const next = this.redoStack.pop();
            if (next) {
                this.history.push(next);
                this.current = next;
                return this.current;
            }
        }
        
        return null;
    }

    getHistory() {
        return this.history.map(node => ({
            uid: node.uid,
            timestamp: node.timestamp,
            description: node.data.description,
            isCurrent: node === this.current
        }));
    }

    /**
     * Calculate the area of a polygon using the shoelace formula.
     * Used for debugging to detect area loss during polygon operations.
     */
    private getPolygonArea(polygon: Point[]): number {
        if (polygon.length < 3) return 0;

        let area = 0;
        for (let i = 0; i < polygon.length; i++) {
            const j = (i + 1) % polygon.length;
            area += polygon[i].x * polygon[j].y;
            area -= polygon[j].x * polygon[i].y;
        }
        return Math.abs(area) / 2;
    }
}
