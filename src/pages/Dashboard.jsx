import { lazy, Suspense, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import PaymentDialog from '../components/PaymentDialog';
import StatCard from '../components/StatCard';
import { ErrorNote, Icon, SectionCard, Spinner } from '../components/ui';
import { useAsync } from '../lib/useAsync';
import {
  getIncomeSeries,
  getKpis,
  getPeriodStats,
  runMaintenance,
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

const PRESETS = [
  { id: 'day', label: 'Daily' },
  { id: 'week', label: 'Weekly' },
  { id: 'month', label: 'Monthly' },
];

function Segmented({ options, value, onChange, ariaLabel }) {
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className="inline-flex rounded-[10px] border border-line bg-canvas p-0.5"
    >
      {options.map((option) => (
        <button
          key={option.id}
          role="tab"
          type="button"
          aria-selected={value === option.id}
          onClick={() => onChange(option.id)}
          className={`min-h-[34px] rounded-lg px-3 text-sm font-semibold transition-colors ${
            value === option.id
              ? 'bg-surface text-brand shadow-[0_1px_3px_rgba(27,31,46,0.12)]'
              : 'text-muted hover:text-ink'
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

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

export default function Dashboard() {
  const today = useMemo(() => todayISO(), []);
  const [preset, setPreset] = useState('day');
  const [granularity, setGranularity] = useState('day');
  const [paying, setPaying] = useState(false);
  const [flash, setFlash] = useState(null);

  const range = useMemo(() => buildRange(preset, today), [preset, today]);

  // One maintenance pass per dashboard load keeps overdue penalties and
  // write-off flags current without needing a scheduled job.
  const kpis = useAsync(async () => {
    await runMaintenance().catch(() => null);
    return getKpis();
  }, []);

  const period = useAsync(() => getPeriodStats(range.from, range.to), [range.from, range.to]);

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

  const collectionRate =
    k.expected_today > 0 ? Math.round((k.paid_today / k.expected_today) * 100) : null;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight sm:text-[1.75rem]">Dashboard</h1>
          <p className="text-muted">{formatDate(today, { weekday: 'long' })}</p>
        </div>
        <button type="button" className="btn btn-success" onClick={() => setPaying(true)}>
          <Icon name="peso" size={18} />
          Record payment
        </button>
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

      {/* All-time headline figures */}
      <section aria-label="All-time figures">
        <div className="mb-3 flex items-center gap-2">
          <h2 className="text-sm font-bold uppercase tracking-wide text-faint">All time</h2>
          <span className="h-px flex-1 bg-line" />
        </div>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <StatCard
            label="Principal on the street"
            value={peso(k.principal_outstanding)}
            hint={`${peso(k.principal_released)} released all time`}
            icon="wallet"
            tone="brand"
            emphasis
            loading={kpis.loading}
          />
          <StatCard
            label="Gross income"
            value={peso(k.gross_income)}
            hint="Interest and penalties actually collected"
            icon="trendUp"
            tone="green"
            emphasis
            loading={kpis.loading}
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
            loading={kpis.loading}
          />
        </div>
      </section>

      {/* Today's collection */}
      <SectionCard
        title="Today's collection"
        subtitle="A member counts as paid once any amount is recorded today"
        bodyClass="grid sm:grid-cols-4"
      >
        <MiniStat
          label="Expected today"
          value={kpis.loading ? '—' : fmtCount(k.expected_today)}
          sub="Active loans with a balance"
        />
        <MiniStat
          label="Paid"
          value={kpis.loading ? '—' : fmtCount(k.paid_today)}
          sub={collectionRate === null ? null : `${collectionRate}% of expected`}
          tone="green"
        />
        <MiniStat
          label="Not yet paid"
          value={kpis.loading ? '—' : fmtCount(k.unpaid_today)}
          sub={k.unpaid_today > 0 ? 'Needs follow-up' : 'All collected'}
          tone={k.unpaid_today > 0 ? 'red' : 'green'}
        />
        <MiniStat
          label="Collected today"
          value={kpis.loading ? '—' : peso(k.collected_today)}
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
            loading={period.loading}
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
            loading={period.loading}
          />
          <StatCard
            label="Income earned"
            value={peso(p.income)}
            hint={`${peso(p.principal_collected)} of principal recovered`}
            icon="trendUp"
            tone="teal"
            loading={period.loading}
          />
          <StatCard
            label="New loans"
            value={fmtCount(p.new_loans)}
            hint={`${peso(p.new_loans_principal)} released`}
            icon="loans"
            tone="brand"
            loading={period.loading}
          />
          <StatCard
            label="Finished loans"
            value={fmtCount(p.finished_loans)}
            hint="Fully paid in this period"
            icon="check"
            tone="green"
            loading={period.loading}
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
            loading={period.loading}
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
        ) : (
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
          value={kpis.loading ? '—' : fmtCount(k.active_loans)}
          sub={`${peso(k.balance_outstanding)} still to collect`}
          tone="brand"
        />
        <MiniStat
          label="Behind schedule"
          value={kpis.loading ? '—' : peso(k.total_arrears)}
          sub="Total arrears across active loans"
          tone={k.total_arrears > 0 ? 'amber' : 'green'}
        />
        <MiniStat
          label="Fully paid"
          value={kpis.loading ? '—' : fmtCount(k.completed_loans)}
          sub="Closed loans, all time"
          tone="green"
        />
        <MiniStat
          label="Written off"
          value={kpis.loading ? '—' : fmtCount(k.written_off_loans)}
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
    </div>
  );
}
