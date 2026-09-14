import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import GoneQuiet from '../components/GoneQuiet';
import Modal from '../components/Modal';
import PaymentDialog from '../components/PaymentDialog';
import StatCard from '../components/StatCard';
import { ErrorNote, Icon, SectionCard, Segmented, Spinner } from '../components/ui';
import { useAsync } from '../lib/useAsync';
import {
  closeCashDay,
  ensureMaintenance,
  getCashReconciliation,
  getIncomeSeries,
  getKpis,
  getPeriodStats,
  listUnclosedCashDays,
} from '../lib/api';
import {
  addDays,
  addMonths,
  count as fmtCount,
  formatDate,
  peso,
  startOfMonth,
  todayISO,
} from '../lib/format';

const IncomeChart = lazy(() => import('../components/IncomeChart'));

/** Monday of the week containing `iso`. */
function startOfWeek(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  const shift = (dt.getUTCDay() + 6) % 7; // Monday = 0
  return addDays(iso, -shift);
}

// Ranges always end today: reaching into future days would count dues that are
// not owed yet and make "not yet paid" look enormous.
function buildRange(preset, today) {
  if (preset === 'day') return { from: today, to: today, label: 'Today' };
  if (preset === 'week') return { from: startOfWeek(today), to: today, label: 'This week' };
  return { from: startOfMonth(today), to: today, label: 'This month' };
}

/** The N days immediately before `range`, same length, for period-over-period comparison. */
function previousRange(range) {
  const lengthDays = Math.round((new Date(range.to) - new Date(range.from)) / 86400000) + 1;
  const to = addDays(range.from, -1);
  const from = addDays(to, -(lengthDays - 1));
  return { from, to };
}

/** Percent change, or 'new' when there was nothing to compare against. */
function pctChange(current, previous) {
  const c = Number(current ?? 0);
  const p = Number(previous ?? 0);
  if (p === 0) return c > 0 ? 'new' : null;
  return ((c - p) / p) * 100;
}

const PRESETS = [
  { id: 'day', label: 'Daily' },
  { id: 'week', label: 'Weekly' },
  { id: 'month', label: 'Monthly' },
];

function MiniStat({ label, value, sub, tone = 'ink' }) {
  const toneClass = {
    ink: 'text-ink',
    green: 'text-green',
    red: 'text-red',
    amber: 'text-amber',
    brand: 'text-brand',
  }[tone];

  return (
    <div className="border-line px-4 py-4 sm:px-5 [&:not(:last-child)]:border-b sm:[&:not(:last-child)]:border-b-0 sm:[&:not(:last-child)]:border-r">
      <p className="text-xs font-bold uppercase tracking-wide text-faint">{label}</p>
      <p className={`tnum mt-1 text-xl font-extrabold tracking-tight sm:text-[1.375rem] ${toneClass}`}>
        {value}
      </p>
      {sub && <p className="mt-0.5 text-xs text-muted">{sub}</p>}
    </div>
  );
}

/** Shows the result once today's cash has been closed; opens the modal to redo it. */
function CashCloseBadge({ reconciliation, onEdit }) {
  const diff = Number(reconciliation.difference);
  const pillTone = diff === 0 ? 'pill-green' : diff > 0 ? 'pill-blue' : 'pill-red';
  const label =
    diff === 0 ? 'Cash matches' : diff > 0 ? `${peso(diff)} over` : `${peso(Math.abs(diff))} short`;

  return (
    <div className="flex items-center gap-2">
      <span className={`pill ${pillTone}`}>{label}</span>
      <button type="button" className="btn btn-sm btn-ghost" onClick={onEdit}>
        <Icon name="edit" size={14} />
        Edit
      </button>
    </div>
  );
}

/**
 * Counting the drawer against what the books say came in. `expectedNow` is
 * only ever a live preview here; the saved figure is snapshotted server-side
 * at the moment of closing, and stays put even if a payment is corrected later.
 */
function CashCloseModal({ open, businessDate, expectedNow, existing, onClose, onSaved }) {
  const [counted, setCounted] = useState(existing ? String(existing.counted_amount) : '');
  const [note, setNote] = useState(existing?.note ?? '');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const submit = async (event) => {
    event.preventDefault();
    const value = Number(counted);
    if (!counted || value < 0) {
      setError('Enter the amount counted.');
      return;
    }
    setError(null);
    setBusy(true);
    try {
      await closeCashDay({ businessDate, countedAmount: value, note: note.trim() || null });
      onSaved();
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={existing ? "Update today's cash count" : "Close today's cash"}
      subtitle={`System expected ${peso(expectedNow)} collected today`}
      size="sm"
      footer={
        <>
          <button type="button" className="btn btn-outline" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button type="submit" form="cash-close-form" className="btn btn-success" disabled={busy}>
            {busy ? <Spinner size={18} label="Saving" /> : existing ? 'Save count' : 'Close cash'}
          </button>
        </>
      }
    >
      <form id="cash-close-form" onSubmit={submit} noValidate className="space-y-4">
        <div>
          <label className="label" htmlFor="cash-counted">
            Cash counted <span className="text-red">*</span>
          </label>
          <input
            id="cash-counted"
            className="input tnum text-lg font-bold"
            type="number"
            min="0"
            step="0.01"
            inputMode="decimal"
            value={counted}
            onChange={(event) => setCounted(event.target.value)}
            required
          />
        </div>

        <div>
          <label className="label" htmlFor="cash-note">
            Note
          </label>
          <input
            id="cash-note"
            className="input"
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="Optional, e.g. gave wrong change earlier"
          />
        </div>

        {error && (
          <p role="alert" className="rounded-xl bg-red-soft px-4 py-3 text-sm">
            {error}
          </p>
        )}
      </form>
    </Modal>
  );
}

export default function Dashboard() {
  // The server's figures roll over at Manila midnight, so a dashboard left open
  // overnight has to roll over with them instead of pinning the mount date.
  const [today, setToday] = useState(todayISO);
  useEffect(() => {
    const timer = setInterval(() => {
      setToday((current) => {
        const next = todayISO();
        return next === current ? current : next;
      });
    }, 60 * 1000);
    return () => clearInterval(timer);
  }, []);

  const [preset, setPreset] = useState('day');
  const [granularity, setGranularity] = useState('day');
  const [paying, setPaying] = useState(false);
  const [flash, setFlash] = useState(null);
  const [closingCash, setClosingCash] = useState(false);

  const cashClose = useAsync(() => getCashReconciliation(today), [today]);
  const unclosed = useAsync(listUnclosedCashDays, [today]);
  const unclosedDays = unclosed.data ?? [];

  const range = useMemo(() => buildRange(preset, today), [preset, today]);

  // One maintenance pass per session keeps overdue penalties and write-off
  // flags current without needing a scheduled job.
  const kpis = useAsync(async () => {
    await ensureMaintenance();
    return getKpis();
  }, []);

  const period = useAsync(() => getPeriodStats(range.from, range.to), [range.from, range.to]);

  const prevRange = useMemo(() => previousRange(range), [range.from, range.to]);
  const previousPeriod = useAsync(
    () => getPeriodStats(prevRange.from, prevRange.to),
    [prevRange.from, prevRange.to]
  );

  const chartRange = useMemo(
    () =>
      granularity === 'day'
        ? { from: addDays(today, -29), to: today }
        : { from: addMonths(startOfMonth(today), -11), to: today },
    [granularity, today]
  );

  const series = useAsync(
    () => getIncomeSeries(chartRange.from, chartRange.to, granularity),
    [chartRange.from, chartRange.to, granularity]
  );

  const k = kpis.data ?? {};
  const p = period.data ?? {};
  const pp = previousPeriod.data ?? {};
  const kpisUnavailable = kpis.loading || !!kpis.error;
  const periodUnavailable = period.loading || !!period.error;
  const trendUnavailable = periodUnavailable || previousPeriod.loading || !!previousPeriod.error;
  const trend = (current, previous, goodDirection = 'up') =>
    trendUnavailable ? undefined : { pct: pctChange(current, previous), goodDirection };

  const collectionRate =
    k.expected_today > 0 ? Math.round((k.paid_today / k.expected_today) * 100) : null;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight sm:text-[1.75rem]">Dashboard</h1>
          <p className="text-muted">{formatDate(today, { weekday: 'long' })}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link to="/app/amortization" className="btn btn-outline">
            <Icon name="calendar" size={18} />
            Amortization report
          </Link>
          <Link to="/app/members?new=1" className="btn btn-outline">
            <Icon name="members" size={18} />
            Add borrower
          </Link>
          <button type="button" className="btn btn-success" onClick={() => setPaying(true)}>
            <Icon name="peso" size={18} />
            Record payment
          </button>
        </div>
      </header>

      {flash && (
        <div className="card flex flex-wrap items-center gap-x-4 gap-y-1 border-green/30 bg-green-soft px-4 py-3 text-sm">
          <Icon name="check" size={17} className="text-green" strokeWidth={2.6} />
          <span className="font-semibold">{peso(flash.amount)} recorded.</span>
          <span className="text-muted">
            {peso(flash.principal_portion)} went to the loan, {peso(flash.interest_portion)} to
            interest
            {Number(flash.penalty_portion) > 0 && `, ${peso(flash.penalty_portion)} to penalty`}.
          </span>
          <button
            type="button"
            className="btn btn-sm btn-ghost ml-auto"
            onClick={() => setFlash(null)}
            aria-label="Dismiss"
          >
            <Icon name="x" size={15} />
          </button>
        </div>
      )}

      <ErrorNote error={kpis.error} onRetry={kpis.reload} />

      {/* Needs-attention banner */}
      {!kpis.loading && (k.flagged_pending > 0 || k.overdue_loans > 0) && (
        <div className="card flex flex-wrap items-center gap-4 border-amber/30 bg-amber-soft p-4">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[10px] bg-white text-amber">
            <Icon name="risk" size={20} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-bold">
              {k.overdue_loans > 0 && `${fmtCount(k.overdue_loans)} loan(s) past the due date`}
              {k.overdue_loans > 0 && k.flagged_pending > 0 && ' · '}
              {k.flagged_pending > 0 &&
                `${fmtCount(k.flagged_pending)} waiting for a write-off decision`}
            </p>
            <p className="text-sm text-muted">
              {peso(k.overdue_balance)} in overdue balances still open.
            </p>
          </div>
          <Link to="/app/risk" className="btn btn-sm btn-outline bg-white">
            Review
            <Icon name="chevronRight" size={15} />
          </Link>
        </div>
      )}

      {/* Past days that took payments but were never counted against the drawer */}
      {unclosedDays.length > 0 && (
        <div className="card flex flex-wrap items-center gap-4 border-red/25 bg-red-soft p-4">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[10px] bg-white text-red">
            <Icon name="wallet" size={20} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-bold">
              {unclosedDays.length === 1
                ? '1 past day was never cash-closed'
                : `${fmtCount(unclosedDays.length)} past days were never cash-closed`}
            </p>
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              {unclosedDays.slice(0, 4).map((day) => (
                <Link
                  key={day.business_date}
                  to={`/app/cash?date=${day.business_date}`}
                  className="pill pill-btn bg-white text-ink transition-colors hover:text-brand"
                  title={`${fmtCount(day.payments_count)} payment(s) recorded`}
                >
                  {formatDate(day.business_date)} · {peso(day.expected_amount)}
                </Link>
              ))}
              {unclosedDays.length > 4 && (
                <span className="text-xs font-semibold text-muted">
                  +{fmtCount(unclosedDays.length - 4)} more
                </span>
              )}
            </div>
          </div>
          <Link
            to={`/app/cash?date=${unclosedDays[0].business_date}`}
            className="btn btn-sm btn-outline bg-white"
          >
            Count now
            <Icon name="chevronRight" size={15} />
          </Link>
        </div>
      )}

      <GoneQuiet />

      {/* All-time headline figures */}
      <section aria-label="All-time figures">
        <div className="mb-3 flex items-center gap-2">
          <h2 className="text-sm font-bold uppercase tracking-wide text-faint">All time</h2>
          <span className="h-px flex-1 bg-line" />
        </div>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            label="Total ever lent"
            value={peso(k.principal_released)}
            hint="Every loan ever released. Only grows. Paying off a loan never reduces this."
            icon="loans"
            tone="brand"
            emphasis
            loading={kpisUnavailable}
          />
          <StatCard
            label="Principal on the street"
            value={peso(k.principal_outstanding)}
            hint="Principal still to be collected on active loans"
            icon="wallet"
            tone="amber"
            emphasis
            loading={kpisUnavailable}
          />
          <StatCard
            label="Gross income"
            value={peso(k.gross_income)}
            hint="Interest and penalties actually collected"
            icon="trendUp"
            tone="green"
            emphasis
            loading={kpisUnavailable}
          />
          <StatCard
            label="Net income"
            value={peso(k.net_income)}
            hint={
              k.writeoff_principal_loss > 0
                ? `After ${peso(k.writeoff_principal_loss)} written off as bad debt`
                : 'No bad debt written off yet'
            }
            icon="peso"
            tone={k.net_income < 0 ? 'red' : 'teal'}
            emphasis
            loading={kpisUnavailable}
          />
        </div>
      </section>

      {/* Today's collection */}
      <SectionCard
        title="Today's collection"
        subtitle="A member counts as paid once any amount is recorded today"
        bodyClass="grid sm:grid-cols-4"
        action={
          !cashClose.loading &&
          (cashClose.data ? (
            <CashCloseBadge reconciliation={cashClose.data} onEdit={() => setClosingCash(true)} />
          ) : (
            <button
              type="button"
              className="btn btn-sm btn-outline"
              onClick={() => setClosingCash(true)}
            >
              <Icon name="wallet" size={15} />
              Close today's cash
            </button>
          ))
        }
      >
        <MiniStat
          label="Expected today"
          value={kpisUnavailable ? '—' : fmtCount(k.expected_today)}
          sub="Active loans with a balance"
        />
        <MiniStat
          label="Paid"
          value={kpisUnavailable ? '—' : fmtCount(k.paid_today)}
          sub={collectionRate === null ? null : `${collectionRate}% of expected`}
          tone="green"
        />
        <MiniStat
          label="Not yet paid"
          value={kpisUnavailable ? '—' : fmtCount(k.unpaid_today)}
          sub={k.unpaid_today > 0 ? 'Needs follow-up' : 'All collected'}
          tone={k.unpaid_today > 0 ? 'red' : 'green'}
        />
        <MiniStat
          label="Collected today"
          value={kpisUnavailable ? '—' : peso(k.collected_today)}
          sub={`${peso(k.income_today)} of it is income`}
          tone="brand"
        />
      </SectionCard>

      {/* Period breakdown */}
      <section aria-label="Period breakdown" className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-bold uppercase tracking-wide text-faint">Breakdown</h2>
            <span className="pill pill-grey">
              {range.label} · {formatDate(range.from)}
              {range.from !== range.to && ` – ${formatDate(range.to)}`}
            </span>
          </div>
          <Segmented
            options={PRESETS}
            value={preset}
            onChange={setPreset}
            ariaLabel="Period filter"
          />
        </div>

        <ErrorNote error={period.error} onRetry={period.reload} />

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <StatCard
            label="Total paid"
            value={peso(p.collected)}
            hint={`${fmtCount(p.payments_count)} payment(s) from ${fmtCount(p.members_paid)} member(s)`}
            icon="peso"
            tone="green"
            loading={periodUnavailable}
            trend={trend(p.collected, pp.collected, 'up')}
          />
          <StatCard
            label="Not paid"
            value={peso(p.unpaid)}
            hint={
              p.scheduled_due > 0
                ? `${p.collection_rate ?? 0}% of ${peso(p.scheduled_due)} due was collected`
                : 'Nothing was scheduled in this period'
            }
            icon="risk"
            tone={p.unpaid > 0 ? 'red' : 'green'}
            loading={periodUnavailable}
            trend={trend(p.unpaid, pp.unpaid, 'down')}
          />
          <StatCard
            label="Income earned"
            value={peso(p.income)}
            hint={`${peso(p.principal_collected)} of principal recovered`}
            icon="trendUp"
            tone="teal"
            loading={periodUnavailable}
            trend={trend(p.income, pp.income, 'up')}
          />
          <StatCard
            label="New loans"
            value={fmtCount(p.new_loans)}
            hint={`${peso(p.new_loans_principal)} released`}
            icon="loans"
            tone="brand"
            loading={periodUnavailable}
            trend={trend(p.new_loans, pp.new_loans, 'up')}
          />
          <StatCard
            label="Finished loans"
            value={fmtCount(p.finished_loans)}
            hint="Fully paid in this period"
            icon="check"
            tone="green"
            loading={periodUnavailable}
            trend={trend(p.finished_loans, pp.finished_loans, 'up')}
          />
          <StatCard
            label="New members"
            value={fmtCount(p.new_members)}
            hint={
              p.write_offs > 0
                ? `${fmtCount(p.write_offs)} written off (${peso(p.write_off_loss)})`
                : 'No write-offs in this period'
            }
            icon="members"
            tone="amber"
            loading={periodUnavailable}
            trend={trend(p.new_members, pp.new_members, 'up')}
          />
        </div>
      </section>

      {/* Earnings chart */}
      <SectionCard
        title="Income over time"
        subtitle={granularity === 'day' ? 'Last 30 days' : 'Last 12 months'}
        action={
          <Segmented
            options={[
              { id: 'day', label: 'By day' },
              { id: 'month', label: 'By month' },
            ]}
            value={granularity}
            onChange={setGranularity}
            ariaLabel="Chart granularity"
          />
        }
        bodyClass="p-4 sm:p-5"
      >
        <ErrorNote error={series.error} onRetry={series.reload} />
        {series.loading ? (
          <div className="skeleton h-[280px]" />
        ) : series.error ? null : (
          <Suspense
            fallback={
              <div className="grid h-[280px] place-items-center">
                <Spinner />
              </div>
            }
          >
            <IncomeChart data={series.data ?? []} granularity={granularity} />
          </Suspense>
        )}
      </SectionCard>

      {/* Book summary */}
      <SectionCard title="Loan book" bodyClass="grid sm:grid-cols-4">
        <MiniStat
          label="Active loans"
          value={kpisUnavailable ? '—' : fmtCount(k.active_loans)}
          sub={`${peso(k.balance_outstanding)} still to collect`}
          tone="brand"
        />
        <MiniStat
          label="Behind schedule"
          value={kpisUnavailable ? '—' : peso(k.total_arrears)}
          sub="Total arrears across active loans"
          tone={k.total_arrears > 0 ? 'amber' : 'green'}
        />
        <MiniStat
          label="Fully paid"
          value={kpisUnavailable ? '—' : fmtCount(k.completed_loans)}
          sub="Closed loans, all time"
          tone="green"
        />
        <MiniStat
          label="Written off"
          value={kpisUnavailable ? '—' : fmtCount(k.written_off_loans)}
          sub={`${peso(k.writeoff_principal_loss)} principal lost`}
          tone={k.written_off_loans > 0 ? 'red' : 'ink'}
        />
      </SectionCard>

      {paying && (
        <PaymentDialog
          onClose={() => setPaying(false)}
          onSaved={(result) => {
            setFlash(result);
            kpis.reload();
            period.reload();
            series.reload();
          }}
        />
      )}

      {closingCash && (
        <CashCloseModal
          open
          businessDate={today}
          expectedNow={k.collected_today ?? 0}
          existing={cashClose.data}
          onClose={() => setClosingCash(false)}
          onSaved={() => cashClose.reload()}
        />
      )}
    </div>
  );
}
