import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { EmptyState, ErrorNote, Icon, SectionCard, Segmented, SkeletonRows } from '../components/ui';
import { useAsync, useDebounced } from '../lib/useAsync';
import { getAmortizationSeries } from '../lib/api';
import {
  addDays,
  count as fmtCount,
  endOfMonth,
  formatDate,
  formatDateShort,
  formatMonth,
  formatWeekLabel,
  peso,
  todayISO,
} from '../lib/format';

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

const GRANULARITIES = [
  { id: 'day', label: 'Daily' },
  { id: 'week', label: 'Weekly' },
  { id: 'month', label: 'Monthly' },
];

/** Monday of the week containing `iso`. */
function startOfWeek(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  const shift = (dt.getUTCDay() + 6) % 7; // Monday = 0
  return addDays(iso, -shift);
}

// Every granularity is pinned to a single period the user picks (a day, the
// week containing a date, or a month/year), so the report shows exactly what
// was asked for instead of a long scrollable list.
function windowFor(granularity, today, pickedDay, pickedWeek, pickedMonth, pickedYear) {
  if (granularity === 'week') {
    const from = startOfWeek(pickedWeek);
    const to = addDays(from, 6);
    return { from, to: to > today ? today : to };
  }
  if (granularity === 'month') {
    const from = `${pickedYear}-${String(pickedMonth).padStart(2, '0')}-01`;
    const to = endOfMonth(from);
    return { from, to: to > today ? today : to };
  }
  return { from: pickedDay, to: pickedDay };
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
  const [pickedDay, setPickedDay] = useState(today);
  const [pickedWeek, setPickedWeek] = useState(today);
  const [pickedMonth, setPickedMonth] = useState(Number(today.slice(5, 7)));
  const [pickedYear, setPickedYear] = useState(Number(today.slice(0, 4)));
  // The native date input fires onChange as soon as each field (year, month,
  // day) resolves to a valid date while typing, not just on a final pick —
  // debounce so a half-typed date doesn't fire an RPC per keystroke.
  const debouncedDay = useDebounced(pickedDay, 400);
  const debouncedWeek = useDebounced(pickedWeek, 400);
  const range = useMemo(
    () => windowFor(granularity, today, debouncedDay, debouncedWeek, pickedMonth, pickedYear),
    [granularity, today, debouncedDay, debouncedWeek, pickedMonth, pickedYear]
  );

  const currentYear = Number(today.slice(0, 4));
  const yearOptions = useMemo(
    () => Array.from({ length: 6 }, (_, i) => currentYear - i),
    [currentYear]
  );

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
            What the book as a whole owed each period: every active loan's daily figure added up,
            against what actually came in. The loans themselves run on a live balance, not a fixed
            schedule; this is the aggregate view of it.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {granularity === 'day' && (
            <input
              type="date"
              className="input w-auto"
              value={pickedDay}
              max={today}
              onChange={(event) => setPickedDay(event.target.value || today)}
              aria-label="Pick a date"
            />
          )}
          {granularity === 'week' && (
            <input
              type="date"
              className="input w-auto"
              value={pickedWeek}
              max={today}
              onChange={(event) => setPickedWeek(event.target.value || today)}
              aria-label="Pick a date in the week"
            />
          )}
          {granularity === 'month' && (
            <>
              <select
                className="select w-auto"
                value={pickedMonth}
                onChange={(event) => setPickedMonth(Number(event.target.value))}
                aria-label="Pick a month"
              >
                {MONTH_NAMES.map((name, index) => (
                  <option key={name} value={index + 1}>
                    {name}
                  </option>
                ))}
              </select>
              <select
                className="select w-auto"
                value={pickedYear}
                onChange={(event) => setPickedYear(Number(event.target.value))}
                aria-label="Pick a year"
              >
                {yearOptions.map((year) => (
                  <option key={year} value={year}>
                    {year}
                  </option>
                ))}
              </select>
            </>
          )}
          <Segmented
            options={GRANULARITIES}
            value={granularity}
            onChange={setGranularity}
            ariaLabel="Report granularity"
          />
        </div>
      </header>

      <SectionCard
        title="Totals for this window"
        subtitle={range.from === range.to ? formatDate(range.from) : `${formatDate(range.from)} – ${formatDate(range.to)}`}
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
