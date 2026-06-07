import vtkActor from '@kitware/vtk.js/Rendering/Core/Actor';
import vtkMapper from '@kitware/vtk.js/Rendering/Core/Mapper';
import vtkAppendPolyData from '@kitware/vtk.js/Filters/General/AppendPolyData';
import vtkCylinderSource from '@kitware/vtk.js/Filters/Sources/CylinderSource';
import vtkConeSource from '@kitware/vtk.js/Filters/Sources/ConeSource';
import vtkCubeSource from '@kitware/vtk.js/Filters/Sources/CubeSource';
import vtkMatrixBuilder from '@kitware/vtk.js/Common/Core/MatrixBuilder';

interface ScrewProps {
    diameter: number;
    length: number;
    color?: string;
    headColor?: string;
}

/**
 * Creates a high-fidelity 3D screw actor using vtk.js procedural sources.
 * Emulates the detailed appearance from the Three.js demo (threaded shaft, tulip head).
 */
export function createHighFidelityScrewActor(props: ScrewProps) {
    const { diameter, length, color = '#22d3ee' } = props;

    const appendFilter = vtkAppendPolyData.newInstance();

    const coreR = (diameter / 2) * 0.75;
    const outerR = diameter / 2;
    const headW = diameter * 1.8;
    const headH = diameter * 2.2;

    // 1. Core Shaft
    const shaft = vtkCylinderSource.newInstance({
        radius: coreR,
        height: length,
        resolution: 24,
    });
    // Center it so tip is at length/2 and head is at -length/2 (or vice versa)
    // vtkCylinderSource is centered at origin. We'll transform later.
    appendFilter.addInputConnection(shaft.getOutputPort());

    // 2. Thread Rings (Visual Approximation of Helical Threads)
    // Since real helix is complex in vtk.js without custom filters, 
    // we use thin cylinders/rings along the shaft to simulate threads.
    const threadCount = Math.floor(length / 2.5);
    for (let i = 0; i < threadCount; i++) {
        const thread = vtkCylinderSource.newInstance({
            radius: outerR,
            height: 0.8,
            resolution: 20,
        });
        const zPos = -length / 2 + (i / threadCount) * length;

        // Position thread ring
        const matrix = vtkMatrixBuilder.buildFromRadian().translate(0, zPos, 0);
        const polyData = thread.getOutputData();
        matrix.apply(polyData.getPoints().getData());

        appendFilter.addInputData(polyData);
    }

    // 3. Tapered Tip
    const tipL = outerR * 3;
    const tip = vtkConeSource.newInstance({
        radius: coreR,
        height: tipL,
        resolution: 24,
        direction: [0, -1, 0], // Pointing down
    });
    const tipMatrix = vtkMatrixBuilder.buildFromRadian().translate(0, -length / 2 - tipL / 2, 0);
    const tipPolyData = tip.getOutputData();
    tipMatrix.apply(tipPolyData.getPoints().getData());
    appendFilter.addInputData(tipPolyData);

    // 4. Tulip Head
    // Body
    const headBody = vtkCylinderSource.newInstance({
        radius: headW / 2,
        height: headH * 0.4,
        resolution: 16,
    });
    const headMatrix = vtkMatrixBuilder.buildFromRadian().translate(0, length / 2 + headH * 0.2, 0);
    const hbPolyData = headBody.getOutputData();
    headMatrix.apply(hbPolyData.getPoints().getData());
    appendFilter.addInputData(hbPolyData);

    // Arms (U-Shape)
    const armW = headW * 0.4;
    const armH = headH * 0.6;
    const lArm = vtkCubeSource.newInstance({
        xLength: armW,
        yLength: armH,
        zLength: headW * 0.8,
        center: [-headW * 0.35, length / 2 + headH * 0.7, 0]
    });
    appendFilter.addInputConnection(lArm.getOutputPort());

    const rArm = vtkCubeSource.newInstance({
        xLength: armW,
        yLength: armH,
        zLength: headW * 0.8,
        center: [headW * 0.35, length / 2 + headH * 0.7, 0]
    });
    appendFilter.addInputConnection(rArm.getOutputPort());

    // Set Screw (top)
    const setScrew = vtkCylinderSource.newInstance({
        radius: headW * 0.3,
        height: headH * 0.2,
        resolution: 16,
        center: [0, length / 2 + headH * 1.0, 0]
    });
    appendFilter.addInputConnection(setScrew.getOutputPort());

    // Finalize Actor
    const mapper = vtkMapper.newInstance();
    mapper.setInputConnection(appendFilter.getOutputPort());

    const actor = vtkActor.newInstance();
    actor.setMapper(mapper);

    // PBR-like properties for realism
    const prop = (actor.getProperty() as any);
    const c = parseHexColor(color);
    prop.setColor(c[0], c[1], c[2]);

    // Use .set() to ensure properties are applied correctly in vtk.js
    prop.set({
        metallic: 0.9,
        roughness: 0.2,
        ambient: 0.3,
        diffuse: 0.7,
        specular: 0.5,
        specularPower: 30,
    });

    return actor;
}

function parseHexColor(hex: string): [number, number, number] {
    const r = parseInt(hex.slice(1, 3), 16) / 255;
    const g = parseInt(hex.slice(3, 5), 16) / 255;
    const b = parseInt(hex.slice(5, 7), 16) / 255;
    return [r, g, b];
}
