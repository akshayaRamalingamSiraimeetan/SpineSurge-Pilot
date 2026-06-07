import { CornerstoneViewer } from './CornerstoneViewer';

interface DICOMViewerProps {
    fileList: (File | string)[];
}

export const DICOMViewer = ({ fileList }: DICOMViewerProps) => {
    return (
        <div className="relative w-full h-full text-foreground">
            <CornerstoneViewer fileList={fileList} />
        </div>
    );
};
