import { count as fmtCount } from '../lib/format';

/**
 * "N past days ..." plus a capped, overflow-summarized pill list — the shared
 * shape behind the Dashboard's unclosed-cash banner and the Cash page's own
 * list. Each caller supplies its own pill markup (a Link on the Dashboard, a
 * date-picking button on the Cash page) via `renderDay`.
 */
export default function UnclosedDaysList({
  days,
  limit,
  message,
  overflowLabel = 'more',
  labelClassName = 'font-bold',
  renderDay,
}) {
  return (
    <>
      <p className={labelClassName}>
        {days.length === 1 ? `1 past day ${message}` : `${fmtCount(days.length)} past days ${message}`}
      </p>
      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
        {days.slice(0, limit).map(renderDay)}
        {days.length > limit && (
          <span className="self-center text-xs font-semibold text-muted">
            +{fmtCount(days.length - limit)} {overflowLabel}
          </span>
        )}
      </div>
    </>
  );
}
