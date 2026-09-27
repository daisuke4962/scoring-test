// Run with: npm test   (Node strips the types itself; no build step)
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { buildQuestionSet, buildQuestions, buildQuietQuestions, judge, normalize, DEFAULT_SETTINGS, type Mark, type Tap } from './judge.ts';

const C = 'chung' as const, H = 'hong' as const;
const tap = (side: typeof C | typeof H, value: Tap['value'], t: number): Tap => ({ side, value, t });
const mark = (id: string, t: number, side: typeof C | typeof H, points: number[], kind: Mark['kind'] = 'pt'): Mark => ({ id, t, side, kind, points });
const values = (taps: Tap[]) => normalize(taps).map(x => `${x.side[0]}${x.kind === 'gj' ? 'GJ' : x.value}`);
const verdicts = (marks: Mark[], taps: Tap[]) => judge(marks, normalize(taps)).marks.map(r => r.verdict);

describe('normalize: turning kicks and undo', () => {
  test('2 then 2 within a second is a turning trunk kick (4)', () => {
    assert.deepEqual(values([tap(C, 2, 5.0), tap(C, 2, 5.4)]), ['c4']);
  });
  test('3 then 3 within a second is a turning head kick (6), timed at the first tap', () => {
    const [x] = normalize([tap(C, 3, 5.0), tap(C, 3, 5.6)]);
    assert.equal(x.value, 6);
    assert.equal(x.t, 5.0);
  });
  test('exactly the double window still doubles; just past it does not', () => {
    assert.deepEqual(values([tap(C, 3, 5.0), tap(C, 3, 6.0)]), ['c6']);
    assert.deepEqual(values([tap(C, 3, 5.0), tap(C, 3, 6.01)]), ['c3', 'c3']);
  });
  test('two quick 1s are two punches, never a 2', () => {
    assert.deepEqual(values([tap(C, 1, 5.0), tap(C, 1, 5.2)]), ['c1', 'c1']);
  });
  test('a third quick tap starts a new press instead of tripling', () => {
    assert.deepEqual(values([tap(C, 3, 5.0), tap(C, 3, 5.3), tap(C, 3, 5.6)]), ['c6', 'c3']);
  });
  test('two quick Gam-jeoms stay two', () => {
    assert.deepEqual(values([tap(H, 'gj', 5.0), tap(H, 'gj', 5.2)]), ['hGJ', 'hGJ']);
  });
  test('a press on the other side does not break a double', () => {
    assert.deepEqual(values([tap(C, 3, 1.0), tap(H, 1, 1.2), tap(C, 3, 1.4)]), ['c6', 'h1']);
  });
  test('a different value on the same side in between blocks the double', () => {
    assert.deepEqual(values([tap(C, 3, 1.0), tap(C, 2, 1.2), tap(C, 3, 1.4)]), ['c3', 'c2', 'c3']);
  });
  test('undo after a double takes back only the turning bonus', () => {
    assert.deepEqual(values([tap(C, 3, 5.0), tap(C, 3, 5.3), tap(C, 'undo', 5.8)]), ['c3']);
  });
  test('undo removes a single press', () => {
    assert.deepEqual(values([tap(C, 2, 5.0), tap(C, 'undo', 5.5)]), []);
  });
  test('undo only touches its own side', () => {
    assert.deepEqual(values([tap(C, 2, 5.0), tap(H, 'undo', 5.5)]), ['c2']);
  });
  test('undo with nothing to take back does nothing', () => {
    assert.deepEqual(values([tap(C, 'undo', 1.0), tap(C, 1, 2.0)]), ['c1']);
  });
  test('after undoing a bonus, a fresh tap can double again', () => {
    assert.deepEqual(values([tap(C, 3, 1.0), tap(C, 3, 1.3), tap(C, 'undo', 1.5), tap(C, 3, 1.8)]), ['c6']);
  });
});

describe('judge: the window around a mark', () => {
  const m = [mark('a', 10, C, [3])];
  test('on time is correct, with no delay', () => {
    const r = judge(m, normalize([tap(C, 3, 10)]));
    assert.equal(r.marks[0].verdict, 'correct');
    assert.equal(r.marks[0].dt, 0);
  });
  test('late but inside the tolerance is correct', () => assert.deepEqual(verdicts(m, [tap(C, 3, 10.9)]), ['correct']));
  test('exactly at the tolerance edge is still correct', () => assert.deepEqual(verdicts(m, [tap(C, 3, 11.0)]), ['correct']));
  test('just past the tolerance is a miss, and the press is extra', () => {
    const r = judge(m, normalize([tap(C, 3, 11.01)]));
    assert.deepEqual(r.marks.map(x => x.verdict), ['miss']);
    assert.equal(r.counts.extra, 1);
  });
  test('slightly early (within the lead) is correct, with a negative delay', () => {
    const r = judge(m, normalize([tap(C, 3, 9.7)]));
    assert.equal(r.marks[0].verdict, 'correct');
    assert.ok(Math.abs((r.marks[0].dt as number) + 0.3) < 1e-9);
  });
  test('earlier than the lead is a miss plus an extra', () => {
    const r = judge(m, normalize([tap(C, 3, 9.69)]));
    assert.deepEqual([r.marks[0].verdict, r.counts.extra], ['miss', 1]);
  });
  test('a wider tolerance setting accepts a later press', () => {
    const r = judge(m, normalize([tap(C, 3, 11.5)]), { tolerance: 2.0, lead: 0.3 });
    assert.equal(r.marks[0].verdict, 'correct');
  });
});

describe('judge: what kind of mistake', () => {
  test('right side, wrong value', () => assert.deepEqual(verdicts([mark('a', 10, C, [3])], [tap(C, 2, 10.2)]), ['value']));
  test('wrong side', () => assert.deepEqual(verdicts([mark('a', 10, C, [3])], [tap(H, 3, 10.2)]), ['color']));
  test('a turning head kick entered as a double is correct', () => assert.deepEqual(verdicts([mark('a', 10, C, [6])], [tap(C, 3, 10.1), tap(C, 3, 10.4)]), ['correct']));
  test('a turning head kick entered too slowly: the first 3 is a wrong value, the second is extra', () => {
    const r = judge([mark('a', 10, C, [6])], normalize([tap(C, 3, 10.1), tap(C, 3, 11.3)]));
    assert.deepEqual([r.marks[0].verdict, r.counts.extra], ['value', 1]);
  });
  test('a mark that accepts either reading takes both', () => {
    assert.deepEqual(verdicts([mark('a', 10, C, [2, 4])], [tap(C, 2, 10.2)]), ['correct']);
    assert.deepEqual(verdicts([mark('a', 10, C, [2, 4])], [tap(C, 2, 10.2), tap(C, 2, 10.5)]), ['correct']);
  });
  test('Gam-jeom on the right athlete is correct; on the other athlete it is the wrong side', () => {
    const m = [mark('g', 10, H, [1], 'gj')];
    assert.deepEqual(verdicts(m, [tap(H, 'gj', 10.3)]), ['correct']);
    assert.deepEqual(verdicts(m, [tap(C, 'gj', 10.3)]), ['color']);
  });
  test('a point pressed where a Gam-jeom was due is a wrong value', () => {
    assert.deepEqual(verdicts([mark('g', 10, H, [1], 'gj')], [tap(H, 1, 10.3)]), ['value']);
  });
  test('nothing pressed is a miss', () => assert.deepEqual(verdicts([mark('a', 10, C, [3])], []), ['miss']));
});

describe('judge: pairing presses with marks', () => {
  test('the exact press wins over a closer press on the wrong side', () => {
    const r = judge([mark('a', 5, C, [3])], normalize([tap(H, 3, 5.1), tap(C, 3, 5.3)]));
    assert.equal(r.marks[0].verdict, 'correct');
    assert.ok(Math.abs((r.marks[0].dt as number) - 0.3) < 1e-9);
    assert.equal(r.counts.extra, 1);
  });
  test('the same answer pressed twice (too far apart to double) counts once; the rest is extra', () => {
    const r = judge([mark('a', 5, C, [2])], normalize([tap(C, 2, 5.1), tap(C, 2, 6.3)]), { tolerance: 1.5, lead: 0.3 });
    assert.deepEqual([r.marks[0].verdict, r.counts.extra], ['correct', 1]);
  });
  test('two marks close together each get their own press', () => {
    const r = judge([mark('a', 3.0, C, [1]), mark('b', 3.4, C, [1])], normalize([tap(C, 1, 3.35), tap(C, 1, 3.45)]), { tolerance: 1.5, lead: 0.3 });
    assert.deepEqual(r.marks.map(x => x.verdict), ['correct', 'correct']);
    assert.equal(r.counts.extra, 0);
    assert.notEqual(r.marks[0].inputId, r.marks[1].inputId);
  });
  test('points for both athletes in the same moment are judged separately', () => {
    const r = judge([mark('a', 8, C, [2]), mark('b', 8, H, [3])], normalize([tap(H, 3, 8.2), tap(C, 2, 8.3)]));
    assert.deepEqual(r.marks.map(x => x.verdict), ['correct', 'correct']);
  });
  test('a question with no scoring: nothing pressed is perfect, any press is extra', () => {
    assert.equal(judge([], normalize([])).counts.extra, 0);
    assert.equal(judge([], normalize([tap(C, 1, 4)])).counts.extra, 1);
  });
  test('counts and the median delay add up', () => {
    const marks = [mark('a', 1, C, [1]), mark('b', 10, H, [2]), mark('c', 20, C, [3]), mark('d', 30, H, [3])];
    const r = judge(marks, normalize([tap(C, 1, 1.2), tap(H, 2, 10.6), tap(C, 2, 20.1), tap(C, 1, 40)]));
    assert.deepEqual(r.counts, { correct: 2, value: 1, color: 0, miss: 1, extra: 1 });
    assert.ok(Math.abs((r.medianDt as number) - 0.4) < 1e-9);
  });
});

describe('buildQuestions', () => {
  test('one mark becomes a question from 5 s before to 5 s after', () => {
    const [q] = buildQuestions('v', [mark('a', 20, C, [3])], 60);
    assert.deepEqual([q.start, q.end, q.marks.length], [15, 25, 1]);
  });
  test('the start never goes below 0 and the end never past the video', () => {
    const [q] = buildQuestions('v', [mark('a', 2, C, [3])], 5);
    assert.deepEqual([q.start, q.end], [0, 5]);
  });
  test('marks whose stretches would overlap share one question', () => {
    const qs = buildQuestions('v', [mark('a', 20, C, [3]), mark('b', 28, H, [2])], 60);
    assert.deepEqual(qs.map(q => [q.start, q.end, q.marks.length]), [[15, 33, 2]]);
  });
  test('marks far apart become separate questions that do not overlap', () => {
    const qs = buildQuestions('v', [mark('b', 40, H, [2]), mark('a', 20, C, [3])], 60);
    assert.deepEqual(qs.map(q => [q.start, q.end]), [[15, 25], [35, 45]]);
    assert.ok(qs[0].end <= qs[1].start);
  });
  test('question ids follow the first mark, so nudging a mark keeps the id', () => {
    const a = buildQuestions('v', [mark('m1', 20, C, [3])], 60)[0].id;
    const b = buildQuestions('v', [mark('m1', 20.03, C, [3])], 60)[0].id;
    assert.equal(a, b);
  });
});

describe('buildQuestions: a run-up the trainee cannot predict', () => {
  const vary = { pre: 1, preVary: 5, post: 4 };
  const marks = [mark('a', 20, C, [3]), mark('b', 60, H, [2]), mark('c', 100, C, [1])];
  test('each question starts between pre and pre + preVary before its mark', () => {
    for (const q of buildQuestions('v', marks, 200, vary)) {
      const gap = q.marks[0].t - q.start;
      assert.ok(gap >= vary.pre - 1e-9 && gap <= vary.pre + vary.preVary + 1e-9, `run-up was ${gap}`);
    }
  });
  test('the run-ups are not all the same', () => {
    const gaps = buildQuestions('v', marks, 200, vary).map(q => +(q.marks[0].t - q.start).toFixed(3));
    assert.ok(new Set(gaps).size > 1, `all questions used ${gaps[0]} s`);
  });
  test('the same question gets the same run-up every time', () => {
    const once = buildQuestions('v', marks, 200, vary).map(q => q.start);
    const twice = buildQuestions('v', marks, 200, vary).map(q => q.start);
    assert.deepEqual(once, twice);
  });
  test('questions still never overlap, however long the run-up turns out', () => {
    const dense = Array.from({ length: 12 }, (_, i) => mark('m' + i, 12 + i * 11, C, [2]));
    const qs = buildQuestions('v', dense, 200, vary);
    for (let i = 1; i < qs.length; i++) assert.ok(qs[i].start >= qs[i - 1].end, `${qs[i - 1].end} then ${qs[i].start}`);
  });
  test('preVary 0 keeps the plain run-up', () => {
    const [q] = buildQuestions('v', [mark('a', 20, C, [3])], 60, { pre: 5, preVary: 0, post: 5 });
    assert.deepEqual([q.start, q.end], [15, 25]);
  });
});

describe('buildQuietQuestions: stretches with no scoring', () => {
  const s = { ...DEFAULT_SETTINGS, pre: 2, preVary: 0, post: 3, tolerance: 1 };
  const marks = [mark('a', 20, C, [3]), mark('b', 60, H, [2])];
  const scoring = buildQuestions('v', marks, 90, s);
  const quiet = buildQuietQuestions('v', scoring, 90, s);
  test('they carry no marks', () => assert.ok(quiet.length > 0 && quiet.every(q => q.marks.length === 0)));
  test('they keep clear of every scoring question', () => {
    for (const q of quiet) for (const r of scoring) assert.ok(q.end <= r.start || q.start >= r.end, `${q.start}-${q.end} met ${r.start}-${r.end}`);
  });
  test('no scoring moment falls inside one', () => {
    for (const q of quiet) for (const m of marks) assert.ok(m.t < q.start - 1 || m.t > q.end + 1, `mark at ${m.t} sat in ${q.start}-${q.end}`);
  });
  test('they stay inside the clip', () => {
    for (const q of quiet) assert.ok(q.start >= 0 && q.end <= 90);
  });
  test('a clip whose length is unknown gets none', () => {
    assert.deepEqual(buildQuietQuestions('v', scoring, Infinity, s), []);
  });
  test('the whole set comes back in the order it happens', () => {
    const set = buildQuestionSet('v', marks, 90, s);
    assert.equal(set.length, scoring.length + quiet.length);
    for (let i = 1; i < set.length; i++) assert.ok(set[i].start >= set[i - 1].start);
  });
});
