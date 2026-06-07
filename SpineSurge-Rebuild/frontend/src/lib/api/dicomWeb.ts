/* DICOMweb retrieval for the 3D workspace.
 *
 * Pulls a study's instances through the tenant-scoped backend WADO proxy
 * (GET /dicom/wado?studyUID=…), which returns a `multipart/related; type=application/dicom` body,
 * and splits it into one ArrayBuffer per DICOM instance — the shape the ported Cornerstone loader
 * (`addFileToLoader`) consumes. Tenant ownership is verified server-side before a byte is streamed,
 * so this layer is pure transport + parsing. */
import { apiFetchRaw } from './client';
import type { DicomResourceLike } from '@/features/dicom/DicomVolumeViewer';

/** Byte offset of `needle` within `hay` at/after `from`, or −1 if absent. */
function indexOfBytes(hay: Uint8Array, needle: Uint8Array, from = 0): number {
  outer: for (let i = from; i <= hay.length - needle.length; i++) {
    for (let j = 0; j < needle.length; j++) if (hay[i + j] !== needle[j]) continue outer;
    return i;
  }
  return -1;
}

function ascii(s: string): Uint8Array {
  const a = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) a[i] = s.charCodeAt(i);
  return a;
}

/** Read the multipart boundary from a Content-Type header (`…; boundary=foo` or `boundary="foo"`). */
function boundaryFromContentType(ct: string): string | null {
  const m = /boundary=(?:"([^"]+)"|([^;]+))/i.exec(ct);
  return m ? (m[1] ?? m[2]).trim() : null;
}

/**
 * Split a `multipart/related` body into its parts' payloads (binary-safe).
 *
 * The boundary is taken from the Content-Type header when it carries one; otherwise it is sniffed
 * from the body's opening delimiter line (`--<boundary>\r\n`) — our proxy declares the media type
 * without the boundary param, so the body is the source of truth. Each part's leading MIME headers
 * (up to the CRLFCRLF separator) and the trailing CRLF before the next delimiter are stripped.
 */
export function parseMultipartRelated(buffer: ArrayBuffer, contentType: string): ArrayBuffer[] {
  const body = new Uint8Array(buffer);
  const crlfcrlf = ascii('\r\n\r\n');

  let boundary = boundaryFromContentType(contentType);
  if (!boundary) {
    const firstCrlf = indexOfBytes(body, ascii('\r\n'));
    if (firstCrlf < 2) return [];
    boundary = new TextDecoder().decode(body.subarray(0, firstCrlf)).replace(/^--/, '').trim();
  }
  if (!boundary) return [];

  const delim = ascii(`--${boundary}`);
  const parts: ArrayBuffer[] = [];
  let pos = indexOfBytes(body, delim);
  while (pos !== -1) {
    const afterDelim = pos + delim.length;
    // Closing delimiter is `--<boundary>--` → end of multipart.
    if (body[afterDelim] === 0x2d && body[afterDelim + 1] === 0x2d) break;
    const next = indexOfBytes(body, delim, afterDelim);
    if (next === -1) break;
    const sep = indexOfBytes(body, crlfcrlf, afterDelim);
    if (sep !== -1 && sep < next) {
      const start = sep + crlfcrlf.length;
      let end = next;
      if (body[end - 2] === 0x0d && body[end - 1] === 0x0a) end -= 2; // drop trailing CRLF
      // .slice() copies, yielding an exact-length standalone ArrayBuffer.
      parts.push(body.slice(start, end).buffer);
    }
    pos = next;
  }
  return parts;
}

/** Fetch a study's DICOM instances via the WADO proxy as Cornerstone-loadable resources. */
export async function fetchWadoStudy(studyUID: string): Promise<DicomResourceLike[]> {
  const res = await apiFetchRaw('/dicom/wado', { query: { studyUID } });
  const ct = res.headers.get('content-type') ?? '';
  const buffer = await res.arrayBuffer();
  const parts = parseMultipartRelated(buffer, ct);
  return parts.map((buf, i) => ({
    name: `${studyUID}.${String(i).padStart(4, '0')}.dcm`,
    arrayBuffer: async () => buf,
  }));
}
