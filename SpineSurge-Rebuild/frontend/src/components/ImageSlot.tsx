/* Placeholder image surfaces. The Claude Design build used an <image-slot> custom element for
   drag/drop + persistence; the real DICOM/Cornerstone viewer lands in Step 8. Until then these
   render the design's black viewer placeholder so layouts match exactly. */
import type { CSSProperties } from 'react';

export interface DicomSlotProps {
  caption?: string;
  tag?: string | null;
  /** When set, renders the real stored image (e.g. a scan's presigned URL) instead of the placeholder. */
  src?: string;
  style?: CSSProperties;
}

/** Black imaging surface with an optional modality tag — matches shell.jsx `DicomSlot`. */
export function DicomSlot({ caption = 'Drop X-ray / DICOM', tag, src, style }: DicomSlotProps) {
  return (
    <div className="dicom-wrap" style={style}>
      {src ? (
        <img
          src={src}
          alt={caption || 'scan'}
          style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 'inherit', display: 'block' }}
        />
      ) : (
        <div
          style={{
            width: '100%',
            height: '100%',
            background: 'var(--viewer-bg)',
            display: 'grid',
            placeItems: 'center',
            color: '#6a6a72',
            borderRadius: 'inherit',
          }}
        >
          {caption && (
            <span
              className="mono"
              style={{ fontSize: 10, letterSpacing: '.04em', textTransform: 'uppercase', color: '#7a7a82' }}
            >
              {caption}
            </span>
          )}
        </div>
      )}
      {tag && <span className="modality-tag">{tag}</span>}
    </div>
  );
}

/** Round/square avatar from initials — matches `.avatar-initials`. */
export function Avatar({ initials, size = 40, tone = 'plain' }: { initials: string; size?: number; tone?: 'plain' | 'accent' }) {
  return (
    <span className={'avatar-initials tone-' + tone} style={{ width: size, height: size, fontSize: size * 0.36 }}>
      {initials}
    </span>
  );
}
