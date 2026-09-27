import type { Mark } from '@scoring-test/shared';
import type { Dict } from './i18n';

/** Seconds as m:ss.s (or m:ss.ss with digits = 2), e.g. 46.8 -> "0:46.8". */
export function clock(t: number, digits: 1 | 2 = 1): string {
  const scale = 10 ** digits;
  const units = Math.round(Math.max(0, t) * scale);
  const m = Math.floor(units / (60 * scale));
  const s = (units % (60 * scale)) / scale;
  return `${m}:${s.toFixed(digits).padStart(3 + digits, '0')}`;
}

/** A reaction delay with its sign: "+0.35 s", "-0.10 s". */
export const signed = (dt: number) => `${dt < 0 ? '-' : '+'}${Math.abs(dt).toFixed(2)} s`;

/** Clock time for a record, with the offset, so a session read abroad is never ambiguous. */
export function localStamp(ms: number): string {
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, '0');
  const offset = -d.getTimezoneOffset();
  const sign = offset < 0 ? '-' : '+';
  const hh = pad(Math.floor(Math.abs(offset) / 60)), mm = pad(Math.abs(offset) % 60);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}${sign}${hh}:${mm}`;
}

/** Just the time of day, for labelling a question that was played. */
export const timeOfDay = (ms: number) => new Date(ms).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });

/** What a mark asks for: "3", "2/4", or "Gam-jeom". */
export const pointLabel = (t: Dict, m: Pick<Mark, 'kind' | 'points'>) => (m.kind === 'gj' ? t.gamjeom : m.points.join('/'));
