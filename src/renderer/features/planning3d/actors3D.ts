import vtkActor from '@kitware/vtk.js/Rendering/Core/Actor';
import vtkMapper from '@kitware/vtk.js/Rendering/Core/Mapper';
import vtkCylinderSource from '@kitware/vtk.js/Filters/Sources/CylinderSource';
import vtkConeSource from '@kitware/vtk.js/Filters/Sources/ConeSource';
import vtkCubeSource from '@kitware/vtk.js/Filters/Sources/CubeSource';
import vtkPolyData from '@kitware/vtk.js/Common/DataModel/PolyData';
import vtkTubeFilter from '@kitware/vtk.js/Filters/General/TubeFilter';
import type { PlanImplant } from '@/lib/store/types';
import { cageAxisZ, screwDir, screwLength, smoothRod } from './implantModel';
import { add, lerp, scale, type Vec3 } from './vec3';

/**
 * Keeps vtk actors in the 3D viewport in sync with the implant list.
 * Geometry is built directly in world (LPS mm) coordinates; the screw model
 * spans exactly entry→tip (BUGS 3D-17), with the tulip head behind the entry.
 */

const COLOR = [0.86, 0.88, 0.91];
const SELECTED = [0.13, 0.83, 0.93];

type Viewport3D = {
    addActors: (a: { uid: string; actor: any }[], o?: { resetCamera?: boolean }) => void;
    removeActors: (uids: string[]) => void;
    render: () => void;
};

const surface = (actor: any, selected: boolean) => {
    const p = actor.getProperty();
    p.setColor(...(selected ? SELECTED : COLOR));
    p.setAmbient(0.25);
    p.setDiffuse(0.8);
    p.setSpecular(0.5);
    p.setSpecularPower(30);
    return actor;
};

const actorFor = (output: any) => {
    const mapper = vtkMapper.newInstance();
    mapper.setInputData(output);
    const actor = vtkActor.newInstance();
    actor.setMapper(mapper);
    return actor;
};

function screwActors(s: Extract<PlanImplant, { type: 'screw' }>, selected: boolean) {
    const L = screwLength(s);
    const d = screwDir(s);
    const r = s.diameter / 2;
    const tipLen = Math.min(L * 0.25, s.diameter * 1.2);

    const shaft = vtkCylinderSource.newInstance({
        height: Math.max(0.1, L - tipLen),
        radius: r,
        resolution: 24,
        capping: true,
    });
    shaft.setCenter(...lerp(s.entry, add(s.tip, scale(d, -tipLen)), 0.5));
    shaft.setDirection(...d);

    const tip = vtkConeSource.newInstance({ height: tipLen, radius: r, resolution: 24, capping: true });
    tip.setCenter(...add(s.tip, scale(d, -tipLen / 2)));
    tip.setDirection(...d);

    const headH = s.diameter * 1.4;
    const head = vtkCylinderSource.newInstance({ height: headH, radius: r * 1.6, resolution: 24, capping: true });
    head.setCenter(...add(s.entry, scale(d, -headH / 2)));
    head.setDirection(...d);

    return [shaft, tip, head].map((src) => surface(actorFor(src.getOutputData()), selected));
}

function rodActors(rod: Extract<PlanImplant, { type: 'rod' }>, selected: boolean) {
    if (rod.points.length < 2) return [];
    const pd = vtkPolyData.newInstance();
    const pts = smoothRod(rod.points);
    pd.getPoints().setData(Float32Array.from(pts.flat()), 3);
    const lines = new Uint32Array(pts.length + 1);
    lines[0] = pts.length;
    pts.forEach((_, i) => { lines[i + 1] = i; });
    pd.getLines().setData(lines);
    const tube = vtkTubeFilter.newInstance({ radius: rod.diameter / 2, numberOfSides: 20, capping: true });
    tube.setInputData(pd);
    return [surface(actorFor(tube.getOutputData()), selected)];
}

function cageActors(c: Extract<PlanImplant, { type: 'cage' }>, selected: boolean) {
    const [w, dpt, h] = c.size;
    const cube = vtkCubeSource.newInstance({ xLength: w, yLength: h, zLength: dpt });
    const actor = surface(actorFor(cube.getOutputData()), selected);
    const z = cageAxisZ(c);
    // Column-major 4x4: columns = axisX, axisY, axisZ, centre.
    actor.setUserMatrix(Float64Array.from([
        c.axisX[0], c.axisX[1], c.axisX[2], 0,
        c.axisY[0], c.axisY[1], c.axisY[2], 0,
        z[0], z[1], z[2], 0,
        c.center[0], c.center[1], c.center[2], 1,
    ]) as any);
    return [actor];
}

/** Persistent per-viewport registry: uid → geometry key. */
export class ImplantActorSync {
    private entries = new Map<string, { key: string; uids: string[] }>();
    constructor(private viewport: Viewport3D) {}

    sync(implants: PlanImplant[], selectedId: string | null) {
        const seen = new Set<string>();
        for (const imp of implants) {
            seen.add(imp.id);
            const selected = imp.id === selectedId;
            const key = JSON.stringify([imp, selected]);
            const existing = this.entries.get(imp.id);
            if (existing?.key === key) continue;
            if (existing) this.viewport.removeActors(existing.uids);

            const actors = imp.type === 'screw' ? screwActors(imp, selected)
                : imp.type === 'rod' ? rodActors(imp, selected)
                : cageActors(imp, selected);
            const uids = actors.map((_, i) => `implant-${imp.id}-${i}`);
            if (actors.length) this.viewport.addActors(actors.map((actor, i) => ({ uid: uids[i], actor })), { resetCamera: false });
            this.entries.set(imp.id, { key, uids });
        }
        for (const [id, e] of this.entries) {
            if (!seen.has(id)) {
                this.viewport.removeActors(e.uids);
                this.entries.delete(id);
            }
        }
        this.viewport.render();
    }

    clear() {
        for (const e of this.entries.values()) { try { this.viewport.removeActors(e.uids); } catch { /* viewport torn down */ } }
        this.entries.clear();
    }
}

export type { Vec3 };
