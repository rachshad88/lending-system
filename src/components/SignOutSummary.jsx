import { useEffect, useRef, useState } from 'react';
import Modal from './Modal';
import { Spinner } from './ui';
import { useAsync } from '../lib/useAsync';
import { getKpis } from '../lib/api';
import { peso, count as fmtCount } from '../lib/format';

const COUNTDOWN_SECONDS = 5;

/**
 * Shown on sign-out: today's collection figures, for 5 seconds, before the
 * session actually ends. Not a schedule — this app runs on a live balance,
 * not fixed day-by-day amortization (see README) — just a closing snapshot.
 */
export default function SignOutSummary({ open, onCancel, onSignOut }) {
  const [secondsLeft, setSecondsLeft] = useState(COUNTDOWN_SECONDS);
  const kpis = useAsync(() => (open ? getKpis() : Promise.resolve(null)), [open]);
  // The interval is created once per `open` toggle; a fresh onSignOut identity
  // every render must not restart it, so the callback lives in a ref instead.
  const onSignOutRef = useRef(onSignOut);
  onSignOutRef.current = onSignOut;

  useEffect(() => {
    if (!open) {
      setSecondsLeft(COUNTDOWN_SECONDS);
      return undefined;
    }
    const timer = setInterval(() => {
      setSecondsLeft((seconds) => {
        if (seconds <= 1) {
          clearInterval(timer);
          onSignOutRef.current();
          return 0;
        }
        return seconds - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [open]);

  if (!open) return null;

  const k = kpis.data;

  return (
    <Modal
      open={open}
      onClose={onCancel}
      title="Today's collection summary"
      subtitle={`Signing out in ${secondsLeft}s`}
      size="sm"
      footer={
        <>
          <button type="button" className="btn btn-outline" onClick={onCancel}>
            Stay signed in
          </button>
          <button type="button" className="btn btn-primary" onClick={() => onSignOutRef.current()}>
            Sign out now
          </button>
        </>
      }
    >
      {kpis.loading ? (
        <div className="flex justify-center py-6">
          <Spinner size={24} />
        </div>
      ) : kpis.error || !k ? (
        <p className="text-sm text-muted">Could not load today's figures.</p>
      ) : (
        <dl className="grid grid-cols-2 gap-3 rounded-xl bg-canvas p-3">
          <div>
            <dt className="text-xs font-bold uppercase tracking-wide text-faint">Collected today</dt>
            <dd className="tnum mt-1 text-lg font-extrabold text-green">{peso(k.collected_today)}</dd>
          </div>
          <div>
            <dt className="text-xs font-bold uppercase tracking-wide text-faint">Income today</dt>
            <dd className="tnum mt-1 text-lg font-extrabold text-teal">{peso(k.income_today)}</dd>
          </div>
          <div>
            <dt className="text-xs font-bold uppercase tracking-wide text-faint">Paid / expected</dt>
            <dd className="tnum mt-1 text-lg font-extrabold">
              {fmtCount(k.paid_today)} / {fmtCount(k.expected_today)}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-bold uppercase tracking-wide text-faint">Payments recorded</dt>
            <dd className="tnum mt-1 text-lg font-extrabold">{fmtCount(k.payments_today)}</dd>
          </div>
        </dl>
      )}
      <p className="mt-3 text-xs text-muted">A last look at today's collections before you go.</p>
    </Modal>
  );
}
