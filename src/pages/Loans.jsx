import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import LoanForm from '../components/LoanForm';
import Pagination from '../components/Pagination';
import { EmptyState, ErrorNote, Icon, SectionCard, SkeletonRows, StatusPill } from '../components/ui';
import { useAsync, useDebounced } from '../lib/useAsync';
import { createLoan, listLoans } from '../lib/api';
import { formatDate, peso } from '../lib/format';

const PAGE_SIZE = 20;

const VIEWS = [
  { id: 'active', label: 'Active', status: 'active', view: 'all' },
  { id: 'unpaid_today', label: 'Not paid today', status: 'active', view: 'unpaid_today' },
  { id: 'arrears', label: 'Behind schedule', status: 'active', view: 'arrears' },
  { id: 'overdue', label: 'Past due date', status: 'active', view: 'overdue' },
  { id: 'completed', label: 'Fully paid', status: 'completed', view: 'all' },
  { id: 'written_off', label: 'Written off', status: 'written_off', view: 'all' },
  { id: 'all', label: 'Everything', status: 'all', view: 'all' },
];

function progress(loan) {
  const total = Number(loan.total_obligation) || 0;
  if (total <= 0) return 0;
  return Math.min(100, Math.round((Number(loan.paid_total) / total) * 100));
}

function ProgressBar({ value, tone = 'bg-brand' }) {
  return (
    <span className="block h-1.5 w-full overflow-hidden rounded-full bg-[#eef0f6]">
      <span className={`block h-full rounded-full ${tone}`} style={{ width: `${value}%` }} />
    </span>
  );
}

export default function Loans() {
  const navigate = useNavigate();
  const [viewId, setViewId] = useState('active');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [creating, setCreating] = useState(false);
  const debouncedSearch = useDebounced(search);

  const active = VIEWS.find((v) => v.id === viewId) ?? VIEWS[0];

  const { data, error, loading, reload } = useAsync(
    () =>
      listLoans({
        search: debouncedSearch,
        status: active.status,
        view: active.view,
        page,
        pageSize: PAGE_SIZE,
      }),
    [debouncedSearch, active.status, active.view, page]
  );

  const rows = data?.rows ?? [];

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight sm:text-[1.75rem]">Loans</h1>
          <p className="text-muted">Find a loan to record a collection or check a balance.</p>
        </div>
        <button type="button" className="btn btn-primary" onClick={() => setCreating(true)}>
          <Icon name="plus" size={18} />
          New loan
        </button>
      </header>

      <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:flex-wrap sm:px-0">
        {VIEWS.map((view) => (
          <button
            key={view.id}
            type="button"
            onClick={() => {
              setViewId(view.id);
              setPage(1);
            }}
            className={`pill min-h-[36px] shrink-0 px-3.5 transition-colors ${
              viewId === view.id ? 'pill-blue' : 'pill-grey hover:bg-[#e6e9f1]'
            }`}
            aria-pressed={viewId === view.id}
          >
            {view.label}
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
          placeholder="Search by member name or TODA"
          aria-label="Search loans"
        />
      </div>

      <ErrorNote error={error} onRetry={reload} />

      <SectionCard>
        {loading ? (
          <div className="p-4">
            <SkeletonRows rows={6} />
          </div>
        ) : rows.length === 0 ? (
          <EmptyState
            icon="loans"
            title="Nothing here"
            hint={
              viewId === 'unpaid_today'
                ? 'Every active loan has a payment recorded today.'
                : 'No loans match this filter.'
            }
          />
        ) : (
          <>
            {/* Phone list */}
            <ul className="divide-y divide-[#eef0f6] sm:hidden">
              {rows.map((loan) => (
                <li key={loan.loan_id}>
                  <Link
                    to={`/app/loans/${loan.loan_id}`}
                    className="block px-4 py-3.5 active:bg-[#f8fafd]"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate font-bold">{loan.member_name}</p>
                        <p className="text-sm text-muted">
                          {peso(loan.principal)} · {formatDate(loan.start_date)}
                        </p>
                      </div>
                      <StatusPill status={loan.is_overdue ? 'overdue' : loan.status} />
                    </div>
                    <div className="mt-2.5 flex items-end justify-between gap-3">
                      <div>
                        <p className="text-xs font-semibold text-faint">Balance</p>
                        <p className="tnum font-extrabold">{peso(loan.balance)}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-xs font-semibold text-faint">Daily due</p>
                        <p className="tnum font-bold text-brand">{peso(loan.daily_due)}</p>
                      </div>
                    </div>
                    <div className="mt-2.5">
                      <ProgressBar
                        value={progress(loan)}
                        tone={loan.is_overdue ? 'bg-red' : 'bg-green'}
                      />
                    </div>
                  </Link>
                </li>
              ))}
            </ul>

            {/* Desktop table */}
            <div className="table-wrap hidden sm:block">
              <table className="data">
                <thead>
                  <tr>
                    <th>Member</th>
                    <th className="num">Principal</th>
                    <th className="num">Daily due</th>
                    <th className="num">Paid</th>
                    <th className="num">Balance</th>
                    <th className="num">Behind</th>
                    <th>Progress</th>
                    <th>Status</th>
                    <th aria-label="Open" />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((loan) => (
                    <tr key={loan.loan_id} className="clickable">
                      <td>
                        <Link to={`/app/loans/${loan.loan_id}`} className="font-bold">
                          {loan.member_name}
                        </Link>
                        <span className="block text-xs text-muted">
                          {formatDate(loan.start_date)} · {loan.term_days}d
                        </span>
                      </td>
                      <td className="num tnum">{peso(loan.principal)}</td>
                      <td className="num tnum text-brand">{peso(loan.daily_due)}</td>
                      <td className="num tnum text-green">{peso(loan.paid_total)}</td>
                      <td className="num tnum font-bold">{peso(loan.balance)}</td>
                      <td className="num tnum">
                        {Number(loan.arrears) > 0 ? (
                          <span className="font-semibold text-red">{peso(loan.arrears)}</span>
                        ) : (
                          <span className="text-faint">—</span>
                        )}
                      </td>
                      <td className="w-28">
                        <ProgressBar
                          value={progress(loan)}
                          tone={loan.is_overdue ? 'bg-red' : 'bg-green'}
                        />
                        <span className="tnum mt-1 block text-xs text-muted">
                          {progress(loan)}%
                        </span>
                      </td>
                      <td>
                        <StatusPill status={loan.is_overdue ? 'overdue' : loan.status} />
                      </td>
                      <td className="num">
                        <Link
                          to={`/app/loans/${loan.loan_id}`}
                          className="btn btn-sm btn-ghost"
                          aria-label={`Open loan for ${loan.member_name}`}
                        >
                          <Icon name="chevronRight" size={16} />
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <Pagination
              page={page}
              pageSize={PAGE_SIZE}
              total={data?.total ?? 0}
              onChange={setPage}
              unit="loans"
            />
          </>
        )}
      </SectionCard>

      {creating && (
        <LoanForm
          open
          onClose={() => setCreating(false)}
          onSubmit={async (values) => {
            const loanId = await createLoan(values);
            navigate(`/app/loans/${loanId}`);
          }}
        />
      )}
    </div>
  );
}
