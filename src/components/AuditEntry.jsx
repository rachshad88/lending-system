import { formatDate, peso } from '../lib/format';

export const ACTION_TONE = {
  created: 'pill-green',
  updated: 'pill-amber',
  deleted: 'pill-red',
  ok: 'pill-green',
  bad_password: 'pill-red',
  locked: 'pill-amber',
  signed_out: 'pill-grey',
};

const LOGIN_OUTCOME_LABEL = { ok: 'succeeded', bad_password: 'failed', locked: 'blocked' };

/** Badge text for one row. Loan/payment/member read as "loan updated"; a
 * sign-in reads as "login failed" rather than the raw outcome code. */
export function badgeLabel(entry) {
  const source = entry.source ?? entry.kind;
  if (source === 'login') return `login ${LOGIN_OUTCOME_LABEL[entry.action] ?? entry.action}`;
  if (source === 'logout') return 'logout';
  return `${source} ${entry.action}`;
}

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

  return <FieldDiffList changes={changes} />;
}

const MEMBER_FIELD_LABELS = {
  name: 'Name',
  contact_number: 'Contact number',
  vehicle_number: 'Vehicle / body number',
  toda: 'TODA / place of work',
  collateral: 'Collateral',
  spouse_name: "Spouse's name",
  referred_by: 'Referred by',
  address: 'Address',
  notes: 'Notes',
};

/** Lists only the member fields that actually moved, old value struck through. */
export function MemberUpdateSummary({ oldValues, newValues }) {
  const o = oldValues ?? {};
  const n = newValues ?? {};
  const changes = Object.entries(MEMBER_FIELD_LABELS)
    .filter(([key]) => (o[key] ?? '') !== (n[key] ?? ''))
    .map(([key, label]) => [label, o[key] || '—', n[key] || '—']);

  if (!changes.length) return <p>Details re-saved without any change.</p>;

  return <FieldDiffList changes={changes} />;
}

function FieldDiffList({ changes }) {
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

/** One audit row's description — what actually happened, in plain language. */
export function AuditDescription({ entry }) {
  if (entry.kind === 'loan' && entry.action === 'created') {
    return (
      <p>
        Released <span className="tnum font-bold">{peso(entry.new_values?.principal)}</span> over{' '}
        {entry.new_values?.term_days} days
      </p>
    );
  }
  if (entry.kind === 'loan' && entry.action === 'updated') {
    return <LoanUpdateSummary oldValues={entry.old_values} newValues={entry.new_values} />;
  }
  if (entry.kind === 'loan' && entry.action === 'deleted') {
    return (
      <p>
        Loan of <span className="tnum font-bold">{peso(entry.old_values?.principal)}</span> for{' '}
        {entry.old_values?.member_name} was removed
        {entry.new_values?.reason && `. Reason: ${entry.new_values.reason}`}
      </p>
    );
  }
  if (entry.kind === 'payment' && entry.action === 'updated') {
    return (
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
            <span className="font-semibold">{formatDate(entry.new_values?.payment_date)}</span>
          </>
        )}
      </p>
    );
  }
  if (entry.kind === 'payment' && entry.action === 'created') {
    return (
      <p>
        Recorded <span className="tnum font-bold">{peso(entry.new_values?.amount)}</span> on{' '}
        {formatDate(entry.new_values?.payment_date)}
      </p>
    );
  }
  if (entry.kind === 'payment' && entry.action === 'deleted') {
    return (
      <p>
        Removed <span className="tnum font-bold">{peso(entry.old_values?.amount)}</span> dated{' '}
        {formatDate(entry.old_values?.payment_date)}
        {entry.new_values?.reason && `: ${entry.new_values.reason}`}
      </p>
    );
  }
  if (entry.kind === 'member' && entry.action === 'created') {
    return <p>Added as a new member.</p>;
  }
  if (entry.kind === 'member' && entry.action === 'updated') {
    return <MemberUpdateSummary oldValues={entry.old_values} newValues={entry.new_values} />;
  }
  if (entry.kind === 'member' && entry.action === 'deleted') {
    return <p>Member record removed.</p>;
  }
  if (entry.kind === 'login') {
    const ip = entry.new_values?.ip;
    const text =
      entry.action === 'ok'
        ? 'Signed in'
        : entry.action === 'bad_password'
          ? 'Wrong password entered'
          : 'Sign-in blocked after too many recent failures';
    return (
      <p>
        {text}
        {ip && <span className="text-muted"> · {ip}</span>}
      </p>
    );
  }
  if (entry.kind === 'logout') {
    return <p>Signed out.</p>;
  }
  return null;
}
