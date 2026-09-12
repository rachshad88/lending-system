import { Icon } from './ui';
import { count as fmtCount } from '../lib/format';

export default function Pagination({ page, pageSize, total, onChange, unit = 'records' }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (total === 0) return null;

  const first = (page - 1) * pageSize + 1;
  const last = Math.min(page * pageSize, total);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-4 py-3 sm:px-5">
      <p className="text-sm text-muted">
        <span className="tnum font-semibold text-ink">
          {fmtCount(first)}–{fmtCount(last)}
        </span>{' '}
        of <span className="tnum font-semibold text-ink">{fmtCount(total)}</span> {unit}
      </p>
      <div className="flex items-center gap-2">
        <button
          type="button"
          className="btn btn-sm btn-outline"
          onClick={() => onChange(page - 1)}
          disabled={page <= 1}
          aria-label="Previous page"
        >
          <Icon name="chevronLeft" size={16} />
          <span className="hidden sm:inline">Back</span>
        </button>
        <span className="tnum text-sm text-muted">
          {page} / {pages}
        </span>
        <button
          type="button"
          className="btn btn-sm btn-outline"
          onClick={() => onChange(page + 1)}
          disabled={page >= pages}
          aria-label="Next page"
        >
          <span className="hidden sm:inline">Next</span>
          <Icon name="chevronRight" size={16} />
        </button>
      </div>
    </div>
  );
}
