/* DEV-ONLY verification page for the Step 8b DICOM/3D pipeline (route: /dicom-verify).
 * Fetches the bundled synthetic CT phantom (public/sample-ct/slice_000..039.dcm) as File objects and
 * mounts the real Cornerstone/VTK volume viewer so the render pipeline can be visually verified.
 * Not part of the product UI — removed once the viewer is wired into the workspace. */
import { useEffect, useState } from 'react';
import { DicomVolumeViewer } from './DicomVolumeViewer';

const COUNT = 40;

export function DicomVerifyPage() {
  const [files, setFiles] = useState<File[]>([]);
  const [err, setErr] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const names = Array.from({ length: COUNT }, (_, i) => `slice_${String(i).padStart(3, '0')}.dcm`);
        const loaded = await Promise.all(
          names.map(async (n) => {
            const res = await fetch(`/sample-ct/${n}`);
            if (!res.ok) throw new Error(`fetch ${n}: ${res.status}`);
            const buf = await res.arrayBuffer();
            return new File([buf], n, { type: 'application/dicom' });
          }),
        );
        if (!cancelled) setFiles(loaded);
      } catch (e) {
        if (!cancelled) setErr((e as Error).message);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div style={{ width: '100vw', height: '100vh', background: '#000', color: '#fff' }}>
      {err && <div style={{ padding: 16 }}>Error loading sample CT: {err}</div>}
      {!err && files.length === 0 && <div style={{ padding: 16 }}>Fetching sample CT…</div>}
      {files.length > 0 && <DicomVolumeViewer files={files} />}
    </div>
  );
}
