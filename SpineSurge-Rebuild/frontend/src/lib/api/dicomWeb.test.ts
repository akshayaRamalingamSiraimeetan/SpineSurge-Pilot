import { describe, expect, it } from 'vitest';
import { parseMultipartRelated } from './dicomWeb';

const BOUNDARY = 'aXcvzPdQ';

function bytes(...parts: Array<string | number[]>): Uint8Array {
  const chunks = parts.map((p) =>
    typeof p === 'string' ? Uint8Array.from(p, (c) => c.charCodeAt(0)) : Uint8Array.from(p),
  );
  const total = chunks.reduce((n, c) => n + c.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) {
    out.set(c, off);
    off += c.length;
  }
  return out;
}

/** Assemble a multipart/related body from raw per-part payloads. */
function multipart(payloads: number[][]): Uint8Array {
  const segs: Array<string | number[]> = [];
  for (const p of payloads) {
    segs.push(`--${BOUNDARY}\r\nContent-Type: application/dicom\r\n\r\n`, p, '\r\n');
  }
  segs.push(`--${BOUNDARY}--\r\n`);
  return bytes(...segs);
}

describe('parseMultipartRelated', () => {
  it('splits parts when the boundary comes from the Content-Type header', () => {
    const body = multipart([[1, 2, 3], [9, 8, 7, 6]]);
    const parts = parseMultipartRelated(body.buffer as ArrayBuffer, `multipart/related; boundary=${BOUNDARY}`);
    expect(parts.map((b) => [...new Uint8Array(b)])).toEqual([[1, 2, 3], [9, 8, 7, 6]]);
  });

  it('sniffs the boundary from the body when the header omits it (our proxy case)', () => {
    const body = multipart([[42]]);
    const parts = parseMultipartRelated(body.buffer as ArrayBuffer, 'multipart/related; type=application/dicom');
    expect(parts.map((b) => [...new Uint8Array(b)])).toEqual([[42]]);
  });

  it('is binary-safe: preserves payloads containing CRLF and 0x00/0xFF bytes', () => {
    const payload = [0x00, 0x0d, 0x0a, 0xff, 0x44, 0x49, 0x43, 0x4d, 0x0d, 0x0a];
    const body = multipart([payload]);
    const parts = parseMultipartRelated(body.buffer as ArrayBuffer, `multipart/related; boundary=${BOUNDARY}`);
    expect([...new Uint8Array(parts[0])]).toEqual(payload);
  });

  it('returns the exact payload length (no trailing CRLF or header bleed)', () => {
    const body = multipart([[1, 2, 3, 4, 5]]);
    const parts = parseMultipartRelated(body.buffer as ArrayBuffer, `multipart/related; boundary=${BOUNDARY}`);
    expect(parts[0].byteLength).toBe(5);
  });

  it('returns [] for an empty or non-multipart body', () => {
    expect(parseMultipartRelated(new ArrayBuffer(0), '')).toEqual([]);
    expect(parseMultipartRelated(bytes('not multipart at all').buffer as ArrayBuffer, '')).toEqual([]);
  });
});
