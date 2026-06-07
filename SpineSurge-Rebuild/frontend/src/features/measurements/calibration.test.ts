/* Step 7c — numeric calibration refinement (MASTER §8.2).
 *
 * Locks the refined contract: calibration is a pure numeric scaling of a pixel-space magnitude, and
 * rounding happens only at format time. The headline test reproduces the OLD display-string
 * round-trip and shows it loses precision the numeric model preserves. */
import { describe, it, expect } from 'vitest';
import { type Quantity, toDisplay, formatQuantity } from './calibration';

describe('calibration · numeric scaling (7c)', () => {
  const cal = { pixelToMm: 0.5 };

  it('scales length by the ratio', () => {
    expect(toDisplay({ value: 40, dimension: 'length' }, cal)).toEqual({ value: 20, unit: 'mm' });
  });

  it('scales area by the ratio squared', () => {
    expect(toDisplay({ value: 40, dimension: 'area' }, cal)).toEqual({ value: 10, unit: 'mm²' });
  });

  it('leaves angle untouched and calibration-invariant', () => {
    expect(toDisplay({ value: 17.5, dimension: 'angle' }, cal)).toEqual({ value: 17.5, unit: '°' });
    expect(toDisplay({ value: 17.5, dimension: 'angle' }, { pixelToMm: null })).toEqual({
      value: 17.5,
      unit: '°',
    });
  });

  it('reports pixels when uncalibrated (null / non-positive ratio)', () => {
    expect(toDisplay({ value: 33.07, dimension: 'length' })).toEqual({ value: 33.07, unit: 'px' });
    expect(toDisplay({ value: 33.07, dimension: 'length' }, { pixelToMm: 0 })).toEqual({
      value: 33.07,
      unit: 'px',
    });
  });

  it('formats (rounds) only at render, not in storage', () => {
    const q: Quantity = { value: 123.456, dimension: 'length' };
    expect(formatQuantity(q, cal, 1)).toBe('61.7mm');
    expect(formatQuantity(q, cal, 3)).toBe('61.728mm');
    expect(formatQuantity({ value: 20, dimension: 'angle' }, cal)).toBe('20.0°');
  });

  it('preserves precision the old display-string round-trip lost', () => {
    // OLD path: format px to a 1-dp string, then regex the number back out and scale.
    const rawPx = 123.456;
    const ratio = 0.5;
    const oldDisplayString = `${rawPx.toFixed(1)} px`; // "123.5 px" — already lossy
    const reparsed = Number.parseFloat(oldDisplayString.match(/(-?\d+(?:\.\d+)?)\s*px/)![1]);
    const oldMm = reparsed * ratio; // 123.5 * 0.5 = 61.75 (carries the 0.044 error)

    // NEW path: keep the number, scale, format last.
    const newMm = toDisplay({ value: rawPx, dimension: 'length' }, { pixelToMm: ratio }).value;

    expect(oldMm).toBeCloseTo(61.75, 10); // the corrupted value
    expect(newMm).toBeCloseTo(61.728, 10); // the faithful value
    expect(Math.abs(newMm - oldMm)).toBeGreaterThan(0.02); // the error the refinement removes
  });
});
