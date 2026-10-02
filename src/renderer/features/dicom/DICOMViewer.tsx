import { PlanningViewer } from '@/features/planning3d/PlanningViewer';

interface DICOMViewerProps {
    fileList: (File | string)[];
}

/** Entry point for CT/MR series — the 3D planning viewer (docs/3D_PLANNING_REDESIGN.md). */
export const DICOMViewer = ({ fileList }: DICOMViewerProps) => (
    <div className="relative w-full h-full text-foreground">
        <PlanningViewer fileList={fileList} />
    </div>
);
