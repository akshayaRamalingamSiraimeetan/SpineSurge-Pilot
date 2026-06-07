/* Parity compare helper. Deep-walks a result tree and asserts it matches the committed golden value:
   floats within an absolute tolerance (default 1e-9), everything else by strict structural equality.
   This is the single guardrail that turns "is the port accurate?" into a mechanical check. */
import { expect } from 'vitest';

export const DEFAULT_TOL = 1e-9;

/* JSON loses NaN/±Infinity (they serialize to null), but those ARE valid oracle outputs for
   degenerate inputs and must be locked faithfully. These encode them as a tagged sentinel and
   restore them on read. */
type NonFiniteTag = { __num: 'NaN' | 'Infinity' | '-Infinity' };

export function stableStringify(value: unknown): string {
  return (
    JSON.stringify(
      value,
      (_k, v) =>
        typeof v === 'number' && !Number.isFinite(v)
          ? ({ __num: Number.isNaN(v) ? 'NaN' : v > 0 ? 'Infinity' : '-Infinity' } satisfies NonFiniteTag)
          : v,
      2,
    ) + '\n'
  );
}

export function parseGolden(text: string): unknown {
  return JSON.parse(text, (_k, v) => {
    if (v && typeof v === 'object' && '__num' in v && Object.keys(v).length === 1) {
      const tag = (v as NonFiniteTag).__num;
      return tag === 'NaN' ? NaN : tag === 'Infinity' ? Infinity : -Infinity;
    }
    return v;
  });
}

function fail(path: string, msg: string): never {
  throw new Error(`golden mismatch at ${path || '<root>'}: ${msg}`);
}

export function deepCloseTo(actual: unknown, expected: unknown, tol = DEFAULT_TOL, path = ''): void {
  if (typeof expected === 'number') {
    if (typeof actual !== 'number') fail(path, `expected number ${expected}, got ${typeof actual}`);
    if (Number.isNaN(expected)) {
      if (!Number.isNaN(actual)) fail(path, `expected NaN, got ${actual}`);
      return;
    }
    if (!Number.isFinite(expected)) {
      if (actual !== expected) fail(path, `expected ${expected}, got ${actual}`);
      return;
    }
    const delta = Math.abs(actual - expected);
    if (!(delta <= tol)) fail(path, `expected ${expected}, got ${actual} (Δ=${delta} > ${tol})`);
    return;
  }

  if (expected === null || expected === undefined) {
    if (actual !== expected) fail(path, `expected ${String(expected)}, got ${JSON.stringify(actual)}`);
    return;
  }

  if (Array.isArray(expected)) {
    if (!Array.isArray(actual)) fail(path, `expected array, got ${typeof actual}`);
    if (actual.length !== expected.length) fail(path, `array length ${actual.length} ≠ ${expected.length}`);
    expected.forEach((e, i) => deepCloseTo(actual[i], e, tol, `${path}[${i}]`));
    return;
  }

  if (typeof expected === 'object') {
    if (typeof actual !== 'object' || actual === null || Array.isArray(actual)) {
      fail(path, `expected object, got ${JSON.stringify(actual)}`);
    }
    const a = actual as Record<string, unknown>;
    const e = expected as Record<string, unknown>;
    const keys = new Set([...Object.keys(a), ...Object.keys(e)]);
    for (const k of keys) {
      if (!(k in e)) fail(`${path}.${k}`, 'unexpected key in actual');
      if (!(k in a)) fail(`${path}.${k}`, 'missing key in actual');
      deepCloseTo(a[k], e[k], tol, `${path}.${k}`);
    }
    return;
  }

  // string | boolean
  if (actual !== expected) fail(path, `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

/** Vitest-friendly wrapper so failures surface as a normal assertion. */
export function expectMatchesGolden(actual: unknown, golden: unknown, tol = DEFAULT_TOL): void {
  expect(() => deepCloseTo(actual, golden, tol)).not.toThrow();
}
