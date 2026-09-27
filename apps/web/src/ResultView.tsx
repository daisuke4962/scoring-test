import type { JudgeResult, Mark } from '@scoring-test/shared';
import { fmt, sideLabel, type Dict } from './i18n';
import { clock, pointLabel, signed } from './format';

/** One phone's result for one question: the score line, then each scoring moment and how it went. */
export function ResultView({ t, marks, result }: { t: Dict; marks: Mark[]; result: JudgeResult }) {
  return (
    <div className="result">
      <div className="result-head">
        {marks.length ? fmt(t.resultLine, { correct: result.counts.correct, total: marks.length }) : t.noScoring}
      </div>
      {result.counts.extra > 0 && <div className="result-sub">{fmt(t.extraLine, { n: result.counts.extra })}</div>}
      {marks.length > 0 && (
        <ol className="result-list">
          {marks.map((m, i) => {
            const r = result.marks[i];
            return (
              <li key={m.id}>
                <span className="mono">{clock(m.t)}</span>{' '}
                <span className={m.side === 'chung' ? 'chung-t' : 'hong-t'}>{sideLabel(t, m.side)} {pointLabel(t, m)}</span>{' '}
                <span className={'v-' + r.verdict}>{t.verdict[r.verdict]}{r.dt != null ? ` ${signed(r.dt)}` : ''}</span>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
