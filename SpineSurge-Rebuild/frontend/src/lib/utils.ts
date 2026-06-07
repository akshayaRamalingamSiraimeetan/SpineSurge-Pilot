import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** shadcn-style class combiner: clsx for conditionals, tailwind-merge to dedupe conflicts. */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

/** Format a backend date for display. Accepts ISO-8601 or already-human strings.
 *  ISO timestamps become "Jan 10, 2024"; non-ISO text (e.g. "Jan 10, 2024") passes through. */
export function formatDate(value: string | null | undefined): string {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value; // already a human string
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

/** Relative time from an ISO-8601 timestamp ("2 hours ago"). Falls through for non-ISO text. */
export function relativeTime(value: string | null | undefined): string {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  const secs = Math.round((Date.now() - d.getTime()) / 1000);
  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ['year', 31536000], ['month', 2592000], ['day', 86400],
    ['hour', 3600], ['minute', 60], ['second', 1],
  ];
  const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
  for (const [unit, secsPer] of units) {
    if (Math.abs(secs) >= secsPer || unit === 'second') {
      return rtf.format(-Math.round(secs / secsPer), unit);
    }
  }
  return 'just now';
}
