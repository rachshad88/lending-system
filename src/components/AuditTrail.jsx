import { Link } from 'react-router-dom';
import { EmptyState } from './ui';
import { formatDate, formatDateTime, peso } from '../lib/format';

/** Lists only the loan fields that actually moved, old value struck through. */
export function LoanUpdateSummary({ oldValues, newValues }) {
  const o = oldValues ?? {};
  const n = newValues ?? {};
  const changes = [];

  if (o.member_name !== n.member_name) changes.push(['Member', o.member_name, n.member_name]);
  if (Number(o.principal) !== Number(n.principal)) {
    changes.push(['Principal', peso(o.principal), peso(n.principal)]);
  }
  if (Number(o.term_days) !== Number(n.term_days)) {
    changes.push(['Term', `${o.term_days} days`, `${n.term_days} days`]);
  }
  if (o.start_date !== n.start_date) {
    changes.push(['Release date', formatDate(o.start_date), formatDate(n.start_date)]);
  }
  if ((o.note ?? '') !== (n.note ?? '')) changes.push(['Note', o.note || '—', n.note || '—']);

  if (!changes.length) return <p>Terms re-saved without any change.</p>;

  return (
    <ul className="space-y-0.5">
      {changes.map(([label, before, after]) => (
        <li key={label}>
          {label} <span className="text-muted line-through">{before}</span> →{' '}
          <span className="font-bold">{after}</span>
        </li>
      ))}
    </ul>
  );
}

const ACTION_TONE = { created: 'pill-green', updated: 'pill-amber', deleted: 'pill-red' };

/**
 * Renders a list of loan_audit/payment_audit rows. Each entry needs a `kind`
 * ('loan' | 'payment') alongside the row's own columns. Passing `member_name`
 * (and `member_id`) on an entry links it to that member — used on the
 * business-wide audit page; omitted on a single loan's own page, where it'd
 * be redundant.
 */
export function AuditTrail({
  rows,
  emptyHint = 'Any edit or deletion of this loan or its payments is logged here with the old and new values.',
}) {
  if (!rows.length) {
    return <EmptyState icon="history" title="No changes yet" hint={emptyHint} />;
  }

  return (
    <ul className="divide-y divide-[#eef0f6]">
      {rows.map((entry) => (
        <li key={`${entry.kind}-${entry.id}`} className="px-4 py-3.5 sm:px-5">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`pill ${ACTION_TONE[entry.action] ?? 'pill-grey'}`}>
              {entry.kind} {entry.action}
            </span>
            {entry.member_name && (
              <Link
                to={`/app/members/${entry.member_id}`}
                className="text-sm font-semibold text-brand hover:underline"
              >
                {entry.member_name}
              </Link>
            )}
            <span className="text-sm text-muted">{formatDateTime(entry.changed_at)}</span>
          </div>
          <div className="mt-1.5 text-sm">
            {entry.kind === 'loan' && entry.action === 'updated' && (
              <LoanUpdateSummary oldValues={entry.old_values} newValues={entry.new_values} />
            )}
            {entry.kind === 'loan' && entry.action === 'deleted' && (
              <p>
                Loan of <span className="tnum font-bold">{peso(entry.old_values?.principal)}</span>{' '}
                for {entry.old_values?.member_name} was removed
                {entry.new_values?.reason && `. Reason: ${entry.new_values.reason}`}
              </p>
            )}
            {entry.kind === 'payment' && entry.action === 'updated' && (
              <p>
                Amount{' '}
                <span className="tnum font-semibold text-muted line-through">
                  {peso(entry.old_values?.amount)}
                </span>{' '}
                → <span className="tnum font-bold">{peso(entry.new_values?.amount)}</span>
                {entry.old_values?.payment_date !== entry.new_values?.payment_date && (
                  <>
                    {' · date '}
                    {formatDate(entry.old_values?.payment_date)} →{' '}
                    <span className="font-semibold">
                      {formatDate(entry.new_values?.payment_date)}
                    </span>
                  </>
                )}
              </p>
            )}
            {entry.kind === 'payment' && entry.action === 'created' && (
              <p>
                Recorded <span className="tnum font-bold">{peso(entry.new_values?.amount)}</span> on{' '}
                {formatDate(entry.new_values?.payment_date)}
              </p>
            )}
            {entry.kind === 'payment' && entry.action === 'deleted' && (
              <p>
                Removed <span className="tnum font-bold">{peso(entry.old_values?.amount)}</span>{' '}
                dated {formatDate(entry.old_values?.payment_date)}
                {entry.new_values?.reason && `: ${entry.new_values.reason}`}
              </p>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}
