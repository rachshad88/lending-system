import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ACTION_TONE, AuditDescription, badgeLabel } from '../components/AuditEntry';
import Pagination from '../components/Pagination';
import { EmptyState, ErrorNote, Icon, SectionCard, SkeletonRows } from '../components/ui';
import { useAsync, useDebounced } from '../lib/useAsync';
import { getRecentAudit } from '../lib/api';
import { formatDateTime } from '../lib/format';

const PAGE_SIZE = 20;

const SOURCES = [
  { id: 'all', label: 'All' },
  { id: 'member', label: 'Members' },
  { id: 'loan', label: 'Loans' },
  { id: 'payment', label: 'Payments' },
  { id: 'login', label: 'Sign-ins' },
  { id: 'logout', label: 'Sign-outs' },
];

export default function AuditLog() {
  const [source, setSource] = useState('all');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const debouncedSearch = useDebounced(search);

  const audit = useAsync(
    () => getRecentAudit({ search: debouncedSearch, source, page, pageSize: PAGE_SIZE }),
    [debouncedSearch, source, page]
  );
  const rows = audit.data?.rows ?? [];
  const total = audit.data?.total ?? 0;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight sm:text-[1.75rem]">Activity log</h1>
        <p className="max-w-2xl text-muted">
          Every member, loan and payment added, edited or removed, plus every sign-in and sign-out —
          newest first, across the whole book. A single loan's own history is also on its detail
          page.
        </p>
      </div>

      <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:flex-wrap sm:px-0">
        {SOURCES.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => {
              setSource(s.id);
              setPage(1);
            }}
            className={`pill pill-btn min-h-[36px] shrink-0 px-3.5 transition-colors ${
              source === s.id ? 'pill-blue' : 'pill-grey hover:bg-[#e6e9f1]'
            }`}
            aria-pressed={source === s.id}
          >
            {s.label}
          </button>
        ))}
      </div>

      <div className="relative">
        <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-faint">
          <Icon name="search" size={18} />
        </span>
        <input
          className="input pl-11"
          type="search"
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
            setPage(1);
          }}
          placeholder="Search by member name or admin email"
          aria-label="Search activity log"
        />
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
            title="Nothing here"
            hint={
              search
                ? 'No activity matches that search.'
                : source === 'all'
                  ? 'Any change to a member, loan or payment, or any sign-in, is logged here.'
                  : 'No activity of this kind yet.'
            }
          />
        ) : (
          <>
            <ul className="divide-y divide-[#eef0f6]">
              {rows.map((entry) => (
                <li key={`${entry.source}-${entry.id}`} className="px-4 py-3.5 sm:px-5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`pill ${ACTION_TONE[entry.action] ?? 'pill-grey'}`}>
                      {badgeLabel(entry)}
                    </span>
                    {entry.member_id ? (
                      <Link
                        to={`/app/members/${entry.member_id}`}
                        className="text-sm font-semibold hover:underline"
                      >
                        {entry.label}
                      </Link>
                    ) : (
                      entry.label && <span className="text-sm font-semibold">{entry.label}</span>
                    )}
                    <span className="text-sm text-muted">{formatDateTime(entry.changed_at)}</span>
                    {entry.loan_id && (
                      <Link
                        to={`/app/loans/${entry.loan_id}`}
                        className="ml-auto flex items-center gap-1 text-xs font-semibold text-muted hover:text-ink"
                      >
                        View loan
                        <Icon name="chevronRight" size={14} />
                      </Link>
                    )}
                  </div>
                  <div className="mt-1.5 text-sm">
                    <AuditDescription entry={{ ...entry, kind: entry.source }} />
                  </div>
                </li>
              ))}
            </ul>
            <Pagination page={page} pageSize={PAGE_SIZE} total={total} onChange={setPage} unit="changes" />
          </>
        )}
      </SectionCard>
    </div>
  );
}
