import { useMemo, useState } from 'react';
import PaymentDialog from '../components/PaymentDialog';
import { EmptyState, ErrorNote, Icon, SectionCard, SkeletonRows } from '../components/ui';
import { useAsync } from '../lib/useAsync';
import { getPeriodStats, listRouteSheetLoans } from '../lib/api';
import { peso, todayISO } from '../lib/format';

/** Active balances grouped by TODA, in the order the route sheet already sorts them. */
function groupByToda(rows) {
  const groups = [];
  const index = new Map();
  for (const row of rows) {
    const key = row.toda || 'No TODA';
    if (!index.has(key)) {
      index.set(key, groups.length);
      groups.push([key, []]);
    }
    groups[index.get(key)][1].push(row);
  }
  return groups;
}

export default function Collect() {
  const today = todayISO();
  const [search, setSearch] = useState('');
  const [showDone, setShowDone] = useState(false);
  const [payingLoan, setPayingLoan] = useState(null);

  const route = useAsync(listRouteSheetLoans, []);
  const collected = useAsync(() => getPeriodStats(today, today), [today]);

  const rows = route.data ?? [];
  const term = search.trim().toLowerCase();
  const filtered = term
    ? rows.filter(
        (r) => r.member_name.toLowerCase().includes(term) || (r.toda ?? '').toLowerCase().includes(term)
      )
    : rows;

  const pending = filtered.filter((r) => !r.paid_today);
  const done = filtered.filter((r) => r.paid_today);
  const pendingGroups = useMemo(() => groupByToda(pending), [pending]);

  const recordPayment = (loan) => setPayingLoan(loan);

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-extrabold tracking-tight sm:text-[1.75rem]">Collect</h1>
        <p className="text-muted">Today's route, grouped by TODA. Tap a member to record what they paid.</p>
      </header>

      <SectionCard bodyClass="p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-faint">Collected today</p>
            <p className="tnum mt-1 text-2xl font-extrabold text-green">
              {collected.loading ? '—' : peso(collected.data?.collected ?? 0)}
            </p>
          </div>
          <div className="relative w-full sm:w-64">
            <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-faint">
              <Icon name="search" size={18} />
            </span>
            <input
              className="input pl-11"
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search name or TODA"
              aria-label="Search today's route"
            />
          </div>
        </div>
      </SectionCard>

      <ErrorNote error={route.error} onRetry={route.reload} />

      {route.loading ? (
        <SectionCard bodyClass="p-4">
          <SkeletonRows rows={6} />
        </SectionCard>
      ) : rows.length === 0 ? (
        <EmptyState icon="wallet" title="Nothing to collect" hint="No active loan currently owes a balance." />
      ) : pending.length === 0 ? (
        <EmptyState
          icon="check"
          title={term ? 'No match' : 'Route complete'}
          hint={term ? 'No pending member matches that search.' : 'Every active balance has a payment recorded today.'}
        />
      ) : (
        <div className="space-y-4">
          {pendingGroups.map(([toda, members]) => (
            <SectionCard key={toda} title={toda} bodyClass="divide-y divide-[#eef0f6]">
              {members.map((loan) => (
                <button
                  key={loan.loan_id}
                  type="button"
                  onClick={() => recordPayment(loan)}
                  className="flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left active:bg-[#f8fafd] sm:px-5"
                >
                  <div className="min-w-0">
                    <p className="truncate font-bold">{loan.member_name}</p>
                    {loan.contact_number && <p className="truncate text-sm text-muted">{loan.contact_number}</p>}
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    {Number(loan.arrears) > 0 && (
                      <span className="pill pill-amber px-2.5 py-1 text-xs font-bold">{peso(loan.arrears)} behind</span>
                    )}
                    <div className="text-right">
                      <p className="text-xs font-semibold text-faint">Daily due</p>
                      <p className="tnum font-extrabold text-brand">{peso(loan.daily_due)}</p>
                    </div>
                    <Icon name="chevronRight" size={18} className="text-faint" />
                  </div>
                </button>
              ))}
            </SectionCard>
          ))}
        </div>
      )}

      {done.length > 0 && (
        <SectionCard bodyClass="p-0">
          <button
            type="button"
            onClick={() => setShowDone((v) => !v)}
            className="flex w-full items-center justify-between px-4 py-3.5 text-left sm:px-5"
            aria-expanded={showDone}
          >
            <span className="font-bold text-green">
              <Icon name="check" size={16} className="mr-1.5 inline align-[-2px]" />
              {done.length} done today
            </span>
            <Icon name={showDone ? 'chevronLeft' : 'chevronRight'} size={16} className="text-faint" />
          </button>
          {showDone && (
            <ul className="divide-y divide-[#eef0f6] border-t border-line">
              {done.map((loan) => (
                <li key={loan.loan_id}>
                  <button
                    type="button"
                    onClick={() => recordPayment(loan)}
                    className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left active:bg-[#f8fafd] sm:px-5"
                  >
                    <p className="truncate font-semibold text-muted">{loan.member_name}</p>
                    <p className="tnum text-sm text-faint">{peso(loan.balance)} left</p>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
      )}

      {payingLoan && (
        <PaymentDialog
          loan={payingLoan}
          onClose={() => setPayingLoan(null)}
          onSaved={() => {
            route.reload();
            collected.reload();
          }}
        />
      )}
    </div>
  );
}
