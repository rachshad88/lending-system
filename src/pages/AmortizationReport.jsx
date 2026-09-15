import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { EmptyState, ErrorNote, Icon, SectionCard, Segmented, SkeletonRows } from '../components/ui';
import { useAsync } from '../lib/useAsync';
import { getAmortizationSeries } from '../lib/api';
import {
  addDays,
  addMonths,
  count as fmtCount,
  formatDate,
  formatDateShort,
  formatMonth,
  formatWeekLabel,
  peso,
  startOfMonth,
  todayISO,
} from '../lib/format';

const GRANULARITIES = [
  { id: 'day', label: 'Daily' },
  { id: 'week', label: 'Weekly' },
  { id: 'month', label: 'Monthly' },
];

// Each toggle gets a window long enough to be useful without turning into an
// unbounded query — 30 daily rows, ~12 weekly rows, 12 monthly rows.
function windowFor(granularity, today) {
  if (granularity === 'week') return { from: addDays(today, -83), to: today };
  if (granularity === 'month') return { from: addMonths(startOfMonth(today), -11), to: today };
  return { from: addDays(today, -29), to: today };
}

function bucketLabel(bucket, granularity) {
  if (granularity === 'month') return formatMonth(bucket);
  if (granularity === 'week') return formatWeekLabel(bucket);
  return formatDateShort(bucket);
}

/** Green when fully collected, amber part-paid, red nothing in against a real due amount. */
function rateTone(expected, collected) {
  if (expected <= 0) return 'text-faint';
  if (collected >= expected) return 'text-green';
  if (collected > 0) return 'text-amber';
  return 'text-red';
}

export default function AmortizationReport() {
  const today = useMemo(() => todayISO(), []);
  const [granularity, setGranularity] = useState('day');
  const range = useMemo(() => windowFor(granularity, today), [granularity, today]);

  const series = useAsync(
    () => getAmortizationSeries(range.from, range.to, granularity),
    [range.from, range.to, granularity]
  );

  const rows = series.data ?? [];
  const totals = rows.reduce(
    (acc, row) => ({
      expected: acc.expected + Number(row.expected),
      collected: acc.collected + Number(row.collected),
      income: acc.income + Number(row.income),
      payments: acc.payments + Number(row.payments),
    }),
    { expected: 0, collected: 0, income: 0, payments: 0 }
  );
  const overallRate = totals.expected > 0 ? Math.round((totals.collected / totals.expected) * 100) : null;

  return (
    <div className="space-y-5">
      <Link
        to="/app"
        className="inline-flex items-center gap-2 text-sm font-semibold text-muted transition-colors hover:text-ink"
      >
        <Icon name="arrowLeft" size={16} />
        Dashboard
      </Link>

      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight sm:text-[1.75rem]">
            Amortization report
          </h1>
          <p className="max-w-2xl text-muted">
            What the book as a whole owed each period — every active loan's daily figure added up —
            against what actually came in. The loans themselves run on a live balance, not a fixed
            schedule; this is the aggregate view of it.
          </p>
        </div>
        <Segmented
          options={GRANULARITIES}
          value={granularity}
          onChange={setGranularity}
          ariaLabel="Report granularity"
        />
      </header>

      <SectionCard
        title="Totals for this window"
        subtitle={`${formatDate(range.from)} – ${formatDate(range.to)}`}
        bodyClass="grid grid-cols-2 divide-x divide-y divide-[#eef0f6] sm:grid-cols-4 sm:divide-y-0"
      >
        {[
          ['Expected', series.loading || series.error ? '—' : peso(totals.expected), 'text-ink'],
          ['Collected', series.loading || series.error ? '—' : peso(totals.collected), 'text-green'],
          ['Income earned', series.loading || series.error ? '—' : peso(totals.income), 'text-teal'],
          [
            'Collection rate',
            series.loading || series.error ? '—' : overallRate === null ? 'n/a' : `${overallRate}%`,
            'text-brand',
          ],
        ].map(([label, value, tone]) => (
          <div key={label} className="px-4 py-4">
            <p className="text-xs font-bold uppercase tracking-wide text-faint">{label}</p>
            <p className={`tnum mt-1 text-lg font-extrabold sm:text-xl ${tone}`}>{value}</p>
          </div>
        ))}
      </SectionCard>

      <SectionCard bodyClass="overflow-x-auto">
        {series.loading ? (
          <div className="p-4">
            <SkeletonRows rows={8} />
          </div>
        ) : series.error ? (
          <div className="p-4">
            <ErrorNote error={series.error} onRetry={series.reload} />
          </div>
        ) : rows.length === 0 ? (
          <EmptyState
            icon="calendar"
            title="Nothing in this window"
            hint="No loan was active and nothing was collected in this period."
          />
        ) : (
          <table className="data">
            <thead>
              <tr>
                <th>Period</th>
                <th className="num">Expected</th>
                <th className="num">Collected</th>
                <th className="num">Income</th>
                <th className="num">Payments</th>
                <th className="num">Rate</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const expected = Number(row.expected);
                const collected = Number(row.collected);
                const rate = expected > 0 ? Math.round((collected / expected) * 100) : null;
                return (
                  <tr key={row.bucket}>
                    <td className="font-semibold">{bucketLabel(row.bucket, granularity)}</td>
                    <td className="num tnum">{expected > 0 ? peso(expected) : '—'}</td>
                    <td className="num tnum text-green">{collected > 0 ? peso(collected) : '—'}</td>
                    <td className="num tnum text-teal">
                      {Number(row.income) > 0 ? peso(row.income) : '—'}
                    </td>
                    <td className="num tnum">{fmtCount(row.payments)}</td>
                    <td className={`num tnum font-semibold ${rateTone(expected, collected)}`}>
                      {rate === null ? '—' : `${rate}%`}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="font-bold">
                <td>Total</td>
                <td className="num tnum">{peso(totals.expected)}</td>
                <td className="num tnum text-green">{peso(totals.collected)}</td>
                <td className="num tnum text-teal">{peso(totals.income)}</td>
                <td className="num tnum">{fmtCount(totals.payments)}</td>
                <td className={`num tnum ${rateTone(totals.expected, totals.collected)}`}>
                  {overallRate === null ? '—' : `${overallRate}%`}
                </td>
              </tr>
            </tfoot>
          </table>
        )}
      </SectionCard>
    </div>
  );
}
