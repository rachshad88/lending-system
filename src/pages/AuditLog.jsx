import { Link } from 'react-router-dom';
import { ACTION_TONE, AuditDescription } from '../components/AuditEntry';
import { EmptyState, ErrorNote, Icon, SectionCard, SkeletonRows } from '../components/ui';
import { useAsync } from '../lib/useAsync';
import { getRecentAudit } from '../lib/api';
import { formatDateTime } from '../lib/format';

const LIMIT = 200;

export default function AuditLog() {
  const audit = useAsync(() => getRecentAudit(LIMIT), []);
  const rows = audit.data ?? [];

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight sm:text-[1.75rem]">Activity log</h1>
        <p className="max-w-2xl text-muted">
          Every loan and payment edit or deletion across the whole book, newest first, with the old
          and new values. A single loan's own history is also on its detail page.
        </p>
      </div>

      <SectionCard>
        {audit.loading ? (
          <SkeletonRows rows={8} className="p-4 sm:p-5" />
        ) : audit.error ? (
          <div className="p-4 sm:p-5">
            <ErrorNote error={audit.error} onRetry={audit.reload} />
          </div>
        ) : rows.length === 0 ? (
          <EmptyState
            icon="history"
            title="Nothing changed yet"
            hint="Any edit or deletion of a loan or a payment, anywhere in the book, is logged here."
          />
        ) : (
          <ul className="divide-y divide-[#eef0f6]">
            {rows.map((entry) => (
              <li key={`${entry.source}-${entry.id}`} className="px-4 py-3.5 sm:px-5">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`pill ${ACTION_TONE[entry.action] ?? 'pill-grey'}`}>
                    {entry.source} {entry.action}
                  </span>
                  <Link
                    to={`/app/members/${entry.member_id}`}
                    className="text-sm font-semibold hover:underline"
                  >
                    {entry.member_name}
                  </Link>
                  <span className="text-sm text-muted">{formatDateTime(entry.changed_at)}</span>
                  <Link
                    to={`/app/loans/${entry.loan_id}`}
                    className="ml-auto flex items-center gap-1 text-xs font-semibold text-muted hover:text-ink"
                  >
                    View loan
                    <Icon name="chevronRight" size={14} />
                  </Link>
                </div>
                <div className="mt-1.5 text-sm">
                  <AuditDescription entry={{ ...entry, kind: entry.source }} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

      {rows.length === LIMIT && (
        <p className="text-center text-sm text-muted">
          Showing the most recent {LIMIT} changes.
        </p>
      )}
    </div>
  );
}
