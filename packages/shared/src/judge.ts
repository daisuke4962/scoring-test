// Judging, shared by the instructor's server (live sessions) and, later, phones practicing
// alone, so every screen judges the same way. Pure functions: no I/O, no clocks.
import type { Side, TapValue } from './index.ts';

export type MarkKind = 'pt' | 'gj';

/** A scoring moment the instructor marked. For a Gam-jeom, `side` is the penalized athlete. */
export interface Mark {
  id: string;
  t: number;            // seconds into the video
  side: Side;
  kind: MarkKind;
  points: number[];     // accepted values; more than one when either reading is fair, e.g. [2, 4]
}

/** A stretch of one video that is played as one question. */
export interface Question {
  id: string;
  videoId: string;
  start: number;
  end: number;
  marks: Mark[];
}

export interface JudgeSettings {
  tolerance: number;    // seconds after a mark that still count
  lead: number;         // seconds before a mark that still count (reacting together with the judge)
  doubleWindow: number; // two taps of 2 or 3 this close together are one turning kick
  pre: number;          // shortest run-up before the first mark of a question
  preVary: number;      // up to this much more run-up, decided per question
  post: number;         // video shown after the last mark
}

export const DEFAULT_SETTINGS: JudgeSettings = { tolerance: 1.0, lead: 0.3, doubleWindow: 1.0, pre: 5, preVary: 0, post: 5 };

/** A raw button press, in video time. */
export interface Tap { id?: string; side: Side; value: TapValue; t: number }

/** A press after doubling and undo are applied. `t` is the time of its first tap. */
export interface Input { id: string; side: Side; kind: MarkKind; value: number; t: number; taps: 1 | 2 }

// Only kicks double: 2 -> 4 (turning trunk) and 3 -> 6 (turning head). Two quick 1s are two punches.
const DOUBLEABLE = new Set([2, 3]);
const EPS = 1e-6;

/**
 * Apply the button rules to raw presses, in the order they were pressed:
 * - a second tap of the same 2 or 3 on the same side within `doubleWindow` doubles the first;
 * - Undo takes back that side's last tap (so it turns a 6 back into a 3, or removes a single).
 */
export function normalize(taps: Tap[], doubleWindow = DEFAULT_SETTINGS.doubleWindow): Input[] {
  const out: Input[] = [];
  const lastOnSide = (side: Side) => {
    for (let i = out.length - 1; i >= 0; i--) if (out[i].side === side) return i;
    return -1;
  };
  taps.forEach((tap, n) => {
    const i = lastOnSide(tap.side);
    const id = tap.id ?? `i${n}`;
    if (tap.value === 'undo') {
      if (i < 0) return;
      const prev = out[i];
      if (prev.taps === 2) out[i] = { ...prev, value: prev.value / 2, taps: 1 };
      else out.splice(i, 1);
      return;
    }
    if (tap.value === 'gj') {
      out.push({ id, side: tap.side, kind: 'gj', value: 1, t: tap.t, taps: 1 });
      return;
    }
    const v = tap.value;
    const prev = i >= 0 ? out[i] : null;
    const gap = prev ? tap.t - prev.t : Infinity;
    if (prev && prev.kind === 'pt' && prev.taps === 1 && prev.value === v && DOUBLEABLE.has(v)
        && gap >= -EPS && gap <= doubleWindow + EPS) {
      out[i] = { ...prev, value: v * 2, taps: 2 };
      return;
    }
    out.push({ id, side: tap.side, kind: 'pt', value: v, t: tap.t, taps: 1 });
  });
  return out;
}

export type Verdict = 'correct' | 'value' | 'color' | 'miss';

export interface MarkResult {
  markId: string;
  verdict: Verdict;
  inputId?: string;
  dt?: number;          // press time minus mark time; negative means pressed early
}

export interface JudgeResult {
  marks: MarkResult[];  // same order as the marks passed in
  extra: Input[];       // presses that match no mark
  counts: Record<Verdict | 'extra', number>;
  medianDt: number | null; // over correct answers only
}

/**
 * Pair presses with marks. A press counts for a mark when it falls in
 * [mark - lead, mark + tolerance]. Each press serves at most one mark. Pairing runs in three
 * passes so the best reading wins: exact (side and value), then right side with the wrong value,
 * then the wrong side. Within a pass the pairs closest in time are taken first.
 */
export function judge(marks: Mark[], inputs: Input[], s: Pick<JudgeSettings, 'tolerance' | 'lead'> = DEFAULT_SETTINGS): JudgeResult {
  const inWindow = (m: Mark, x: Input) => x.t >= m.t - s.lead - EPS && x.t <= m.t + s.tolerance + EPS;
  const accepts = (m: Mark, x: Input) => m.kind === x.kind && (m.kind === 'gj' || m.points.includes(x.value));
  const passes: [Exclude<Verdict, 'miss'>, (m: Mark, x: Input) => boolean][] = [
    ['correct', (m, x) => m.side === x.side && accepts(m, x)],
    ['value', (m, x) => m.side === x.side],
    ['color', () => true],
  ];

  const byMark = new Map<string, MarkResult>();
  const used = new Set<number>();
  for (const [verdict, fits] of passes) {
    const pairs: { m: Mark; xi: number; d: number }[] = [];
    for (const m of marks) {
      if (byMark.has(m.id)) continue;
      inputs.forEach((x, xi) => {
        if (!used.has(xi) && inWindow(m, x) && fits(m, x)) pairs.push({ m, xi, d: Math.abs(x.t - m.t) });
      });
    }
    pairs.sort((a, b) => a.d - b.d || a.m.t - b.m.t || a.xi - b.xi);
    for (const { m, xi } of pairs) {
      if (byMark.has(m.id) || used.has(xi)) continue;
      used.add(xi);
      byMark.set(m.id, { markId: m.id, verdict, inputId: inputs[xi].id, dt: inputs[xi].t - m.t });
    }
  }

  const results: MarkResult[] = marks.map(m => byMark.get(m.id) ?? { markId: m.id, verdict: 'miss' });
  const extra = inputs.filter((_, xi) => !used.has(xi));
  const counts = { correct: 0, value: 0, color: 0, miss: 0, extra: extra.length };
  for (const r of results) counts[r.verdict]++;
  const dts = results.filter(r => r.verdict === 'correct').map(r => r.dt as number).sort((a, b) => a - b);
  const mid = Math.floor(dts.length / 2);
  const medianDt = dts.length === 0 ? null : dts.length % 2 ? dts[mid] : (dts[mid - 1] + dts[mid]) / 2;
  return { marks: results, extra, counts, medianDt };
}

/** A stable 0..1 from a question's id, so its run-up is the same on every screen and every run. */
function hash01(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  return ((h >>> 0) % 1024) / 1024;
}

/**
 * Turn a video's marks into questions. Each question runs from its run-up before its first mark to
 * `post` after its last. The run-up is `pre` plus up to `preVary` more, fixed per question, so a
 * trainee cannot learn how long to wait. Marks whose padded stretches would overlap share one
 * question, so a question never shows a scoring moment it does not ask about.
 */
export function buildQuestions(videoId: string, marks: Mark[], duration: number, s: Pick<JudgeSettings, 'pre' | 'preVary' | 'post'> = DEFAULT_SETTINGS): Question[] {
  const sorted = [...marks].sort((a, b) => a.t - b.t);
  const groups: Mark[][] = [];
  const reach = s.pre + s.preVary + s.post;   // the furthest a question can ever stretch
  for (const m of sorted) {
    const g = groups[groups.length - 1];
    if (g && m.t - g[g.length - 1].t <= reach + EPS) g.push(m);
    else groups.push([m]);
  }
  return groups.map(g => {
    const id = `q-${g[0].id}`;
    const runUp = s.pre + hash01(id) * s.preVary;
    return {
      id,
      videoId,
      start: Math.max(0, g[0].t - runUp),
      end: Math.min(duration, g[g.length - 1].t + s.post),
      marks: g,
    };
  });
}

/**
 * Stretches where nothing is scored, offered as questions of their own: the only way to practise
 * not pressing, and the only way an over-eager judge shows up. Each one keeps clear of every
 * scoring moment by more than the tolerance, so a press meant for a real mark never lands here.
 */
export function buildQuietQuestions(
  videoId: string,
  questions: Question[],
  duration: number,
  s: Pick<JudgeSettings, 'pre' | 'post' | 'tolerance'> = DEFAULT_SETTINGS,
  max = 6,
): Question[] {
  if (!Number.isFinite(duration)) return [];
  const length = Math.max(4, s.pre + s.post);
  const margin = s.tolerance + 0.5;
  const busy = [...questions].sort((a, b) => a.start - b.start);
  const out: Question[] = [];
  let from = 0;
  for (const q of [...busy, null]) {
    const until = q ? q.start - margin : duration;
    if (until - from >= length) {
      const start = Math.round((from + (until - from - length) / 2) * 1000) / 1000;
      out.push({ id: `quiet-${Math.round(start * 1000)}`, videoId, start, end: start + length, marks: [] });
    }
    if (q) from = Math.max(from, q.end + margin);
  }
  return out.slice(0, max);
}

/** Every question for a clip, in the order they happen: the scoring ones and the quiet ones. */
export function buildQuestionSet(videoId: string, marks: Mark[], duration: number, s: JudgeSettings = DEFAULT_SETTINGS): Question[] {
  const scoring = buildQuestions(videoId, marks, duration, s);
  return [...scoring, ...buildQuietQuestions(videoId, scoring, duration, s)].sort((a, b) => a.start - b.start);
}

/** The whole video as one question, for a clip that is already short. */
export function wholeClip(videoId: string, marks: Mark[], duration: number): Question {
  return { id: `${videoId}@all`, videoId, start: 0, end: duration, marks: [...marks].sort((a, b) => a.t - b.t) };
}
