/* Loads a stored CT study from the tenant-scoped WADO proxy and renders it in the 4-quadrant
 * volume viewer with the full planning layer. Thin wrapper around DicomVolumeViewer that owns the
 * fetch lifecycle (loading / empty / error); the viewer itself stays a pure files-in renderer, so the
 * same component serves both the dev verify page (local files) and the real workspace (WADO). */
import { useWadoStudy } from '@/lib/api/hooks';
import { DicomVolumeViewer, type VolumeInfo } from './DicomVolumeViewer';

export function StudyVolumeViewer({
  studyUID,
  onReady,
}: {
  studyUID: string;
  onReady?: (info: VolumeInfo) => void;
}) {
  const { data, isLoading, isError, error } = useWadoStudy(studyUID);

  if (isError) return <Centered>Failed to load study: {(error as Error).message}</Centered>;
  if (isLoading || !data) return <Centered>Loading CT series…</Centered>;
  if (data.length === 0) return <Centered>No DICOM instances in this study.</Centered>;

  return <DicomVolumeViewer files={data} controls planning onReady={onReady} />;
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#000',
        color: '#9CA3AF',
        fontSize: 13,
      }}
    >
      {children}
    </div>
  );
}
