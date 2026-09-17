import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { EmptyState, ErrorNote, Icon, SectionCard, SkeletonRows, Spinner } from '../components/ui';
import UnclosedDaysList from '../components/UnclosedDaysList';
import { useAsync } from '../lib/useAsync';
import {
  closeCashDay,
  getCashReconciliation,
  getPeriodStats,
  listCashReconciliations,
  listUnclosedCashDays,
} from '../lib/api';
import { formatDate, formatDateTime, peso, todayISO } from '../lib/format';

/** A `?date=` link is user-editable, so only a real past-or-today date is honoured. */
function initialDate(param, today) {
  return /^\d{4}-\d{2}-\d{2}$/.test(param ?? '') && param <= today ? param : today;
}

/** Green when the drawer matches, amber for a small gap, red past that. */
function differenceTone(difference) {
  const value = Math.abs(Number(difference));
  if (value < 0.005) return 'text-green';
  if (value <= 20) return 'text-amber';
  return 'text-red';
}

export default function CashReconciliation() {
  const today = todayISO();
  const [searchParams, setSearchParams] = useSearchParams();
  const [date, setDateState] = useState(() => initialDate(searchParams.get('date'), today));
  const setDate = (next) => {
    setDateState(next);
    setCounted('');
    setNote('');
    setError(null);
    setSearchParams(next === today ? {} : { date: next }, { replace: true });
  };
  const [counted, setCounted] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const closed = useAsync(() => getCashReconciliation(date), [date]);
  const expected = useAsync(() => getPeriodStats(date, date), [date]);
  const history = useAsync(() => listCashReconciliations({ limit: 14 }), []);
  const unclosed = useAsync(listUnclosedCashDays, []);
  const unclosedDays = unclosed.data ?? [];

  const existing = closed.data;
  // closed.data still holds the previous date's row while a new date is
  // loading (useAsync doesn't clear data on refetch), so anything that
  // decides what to SHOW — not just what to fetch — must also check
  // closed.loading, or switching dates flashes the old day's "Already
  // closed" title for a frame before the real (possibly empty) result lands.
  const showingExisting = !closed.loading && Boolean(existing);
  const expectedAmount = existing ? Number(existing.expected_amount) : Number(expected.data?.collected ?? 0);

  const submit = async (event) => {
    event.preventDefault();
    const value = Number(counted);
    if (counted === '' || Number.isNaN(value) || value < 0) {
      setError('Enter the amount counted.');
      return;
    }
    setError(null);
    setBusy(true);
    try {
      await closeCashDay({ businessDate: date, countedAmount: value, note: note.trim() });
      setCounted('');
      setNote('');
      closed.reload();
      history.reload();
      unclosed.reload();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const startEdit = () => {
    setCounted(String(Number(existing.counted_amount).toFixed(2)));
    setNote(existing.note ?? '');
    setError(null);
  };

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-extrabold tracking-tight sm:text-[1.75rem]">Cash reconciliation</h1>
        <p className="text-muted">
          At the end of the day, count what is actually in hand and check it against what the system
          says came in. Closing a day again (say, after fixing a payment) recomputes the expected
          figure but keeps the day's history.
        </p>
      </header>

      <SectionCard title="1. Pick the day" bodyClass="p-4 sm:p-5">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="label" htmlFor="cash-date">
              Business date
            </label>
            <input
              id="cash-date"
              className="input"
              type="date"
              value={date}
              max={today}
              onChange={(event) => setDate(event.target.value)}
            />
          </div>
          {date !== today && (
            <button type="button" className="pill pill-btn pill-grey min-h-[38px] px-3" onClick={() => setDate(today)}>
              Today
            </button>
          )}
        </div>

        {unclosedDays.length > 0 && (
          <div className="mt-4 rounded-xl border border-red/25 bg-red-soft p-3">
            <UnclosedDaysList
              days={unclosedDays}
              limit={12}
              message="still need a count"
              overflowLabel="older"
              labelClassName="text-sm font-bold"
              renderDay={(day) => (
                <button
                  key={day.business_date}
                  type="button"
                  onClick={() => setDate(day.business_date)}
                  aria-pressed={date === day.business_date}
                  className={`pill pill-btn min-h-[32px] px-3 transition-colors ${
                    date === day.business_date ? 'pill-blue' : 'bg-white text-ink hover:text-brand'
                  }`}
                >
                  {formatDate(day.business_date)} · {peso(day.expected_amount)}
                </button>
              )}
            />
          </div>
        )}
      </SectionCard>

      <SectionCard
        title={showingExisting ? 'Already closed' : '2. Count the drawer'}
        subtitle={formatDate(date)}
        bodyClass="p-4 sm:p-5"
      >
        {closed.loading || expected.loading ? (
          <SkeletonRows rows={2} />
        ) : closed.error ? (
          <ErrorNote error={closed.error} onRetry={closed.reload} />
        ) : !existing && expected.error ? (
          // Without a saved close, the expected figure comes entirely from this
          // fetch — showing the form with a silent ₱0 would let a real day get
          // closed against a fabricated figure.
          <ErrorNote error={expected.error} onRetry={expected.reload} />
        ) : (
          <>
            <div className="mb-4 grid grid-cols-2 gap-3 rounded-xl bg-canvas p-3 sm:grid-cols-3">
              <div>
                <p className="text-xs font-bold uppercase tracking-wide text-faint">
                  {existing ? 'Expected (at closing)' : 'Expected'}
                </p>
                <p className="tnum mt-1 text-lg font-extrabold">{peso(expectedAmount)}</p>
              </div>
              {existing && (
                <>
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wide text-faint">Counted</p>
                    <p className="tnum mt-1 text-lg font-extrabold">{peso(existing.counted_amount)}</p>
                  </div>
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wide text-faint">Difference</p>
                    <p className={`tnum mt-1 text-lg font-extrabold ${differenceTone(existing.difference)}`}>
                      {Number(existing.difference) > 0 ? '+' : ''}
                      {peso(existing.difference)}
                    </p>
                  </div>
                </>
              )}
            </div>

            {existing && (
              <p className="mb-4 text-sm text-muted">
                Closed {formatDateTime(existing.closed_at)}
                {existing.note && (
                  <>
                    {' · '}
                    <span className="font-semibold">Note:</span> {existing.note}
                  </>
                )}
              </p>
            )}

            {existing && counted === '' ? (
              <button type="button" className="btn btn-outline" onClick={startEdit}>
                <Icon name="edit" size={16} />
                Recount / correct this day
              </button>
            ) : (
              <form onSubmit={submit} noValidate className="space-y-4">
                <div>
                  <label className="label" htmlFor="cash-counted">
                    Amount counted <span className="text-red">*</span>
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
                  <button
                    type="button"
                    className="pill pill-btn pill-grey mt-2 min-h-[32px] px-3"
                    onClick={() => setCounted(expectedAmount.toFixed(2))}
                  >
                    Matches expected {peso(expectedAmount)}
                  </button>
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
                    placeholder="Optional, e.g. reason for a shortage"
                  />
                </div>

                {counted !== '' && !Number.isNaN(Number(counted)) && (() => {
                  const diff = Number(counted) - expectedAmount;
                  return (
                    <p className={`text-sm font-semibold ${differenceTone(diff)}`}>
                      {diff === 0 ? 'Matches exactly.' : diff > 0 ? `${peso(diff)} over.` : `${peso(Math.abs(diff))} short.`}
                    </p>
                  );
                })()}

                <ErrorNote error={error} />

                <div className="flex flex-wrap gap-2">
                  <button type="submit" className="btn btn-primary" disabled={busy}>
                    {busy ? (
                      <Spinner size={18} label="Saving" />
                    ) : existing ? (
                      'Save correction'
                    ) : (
                      'Close the day'
                    )}
                  </button>
                  {existing && (
                    <button
                      type="button"
                      className="btn btn-outline"
                      onClick={() => {
                        setCounted('');
                        setNote('');
                        setError(null);
                      }}
                      disabled={busy}
                    >
                      Cancel
                    </button>
                  )}
                </div>
              </form>
            )}
          </>
        )}
      </SectionCard>

      <SectionCard title="Recent closes" bodyClass="overflow-x-auto">
        {history.loading ? (
          <div className="p-4">
            <SkeletonRows rows={4} />
          </div>
        ) : history.error ? (
          <div className="p-4">
            <ErrorNote error={history.error} onRetry={history.reload} />
          </div>
        ) : (history.data ?? []).length === 0 ? (
          <EmptyState icon="wallet" title="No day has been closed yet" hint="Close today's cash count above to start the history." />
        ) : (
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs font-bold uppercase tracking-wide text-faint">
                <th className="px-4 py-2.5 sm:px-5">Date</th>
                <th className="px-4 py-2.5 text-right">Expected</th>
                <th className="px-4 py-2.5 text-right">Counted</th>
                <th className="px-4 py-2.5 text-right">Difference</th>
                <th className="px-4 py-2.5 sm:px-5">Note</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#eef0f6]">
              {history.data.map((row) => (
                <tr key={row.business_date}>
                  <td className="px-4 py-2.5 font-semibold sm:px-5">
                    <button type="button" className="hover:text-brand" onClick={() => setDate(row.business_date)}>
                      {formatDate(row.business_date)}
                    </button>
                  </td>
                  <td className="tnum px-4 py-2.5 text-right">{peso(row.expected_amount)}</td>
                  <td className="tnum px-4 py-2.5 text-right">{peso(row.counted_amount)}</td>
                  <td className={`tnum px-4 py-2.5 text-right font-semibold ${differenceTone(row.difference)}`}>
                    {Number(row.difference) > 0 ? '+' : ''}
                    {peso(row.difference)}
                  </td>
                  <td className="max-w-[220px] truncate px-4 py-2.5 text-muted sm:px-5" title={row.note ?? ''}>
                    {row.note ?? '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </SectionCard>
    </div>
  );
}
