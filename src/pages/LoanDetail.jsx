import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import Modal from '../components/Modal';
import PaymentDialog from '../components/PaymentDialog';
import {
  EmptyState,
  ErrorNote,
  Icon,
  PageLoader,
  SectionCard,
  StatusPill,
} from '../components/ui';
import { useAsync } from '../lib/useAsync';
import { deletePayment, getLoan, getLoanPayments, getPaymentAudit } from '../lib/api';
import { formatDate, formatDateTime, peso } from '../lib/format';

/* ------------------------------------------------------------------ tables */

function PaymentsTable({ rows, onEdit, onDelete }) {
  if (!rows.length) {
    return (
      <EmptyState
        icon="peso"
        title="No payments recorded yet"
        hint="Record the first collection and the split between principal and interest appears here."
      />
    );
  }

  return (
    <div className="table-wrap">
      <table className="data">
        <thead>
          <tr>
            <th>Date</th>
            <th className="num">Amount</th>
            <th className="num">To principal</th>
            <th className="num">To interest</th>
            <th className="num">To penalty</th>
            <th>Note</th>
            <th aria-label="Actions" />
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              <td className="font-semibold">{formatDate(row.payment_date)}</td>
              <td className="num tnum font-bold">{peso(row.amount)}</td>
              <td className="num tnum text-muted">{peso(row.principal_portion)}</td>
              <td className="num tnum text-green">{peso(row.interest_portion)}</td>
              <td className="num tnum text-red">
                {Number(row.penalty_portion) > 0 ? peso(row.penalty_portion) : '—'}
              </td>
              <td className="max-w-[14rem] truncate text-muted">{row.note ?? '—'}</td>
              <td>
                <div className="flex justify-end gap-1">
                  <button
                    type="button"
                    className="btn btn-sm btn-ghost"
                    onClick={() => onEdit(row)}
                    aria-label="Edit payment"
                  >
                    <Icon name="edit" size={15} />
                  </button>
                  <button
                    type="button"
                    className="btn btn-sm btn-ghost text-red"
                    onClick={() => onDelete(row)}
                    aria-label="Delete payment"
                  >
                    <Icon name="trash" size={15} />
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function AuditTrail({ rows }) {
  if (!rows.length) {
    return (
      <EmptyState
        icon="history"
        title="No changes yet"
        hint="Any edit or deletion of a payment is logged here with the old and new values."
      />
    );
  }

  const ACTION_TONE = { created: 'pill-green', updated: 'pill-amber', deleted: 'pill-red' };

  return (
    <ul className="divide-y divide-[#eef0f6]">
      {rows.map((entry) => (
        <li key={entry.id} className="px-4 py-3.5 sm:px-5">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`pill ${ACTION_TONE[entry.action] ?? 'pill-grey'}`}>
              {entry.action}
            </span>
            <span className="text-sm text-muted">{formatDateTime(entry.changed_at)}</span>
          </div>
          <div className="mt-1.5 text-sm">
            {entry.action === 'updated' && (
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
            {entry.action === 'created' && (
              <p>
                Recorded <span className="tnum font-bold">{peso(entry.new_values?.amount)}</span> on{' '}
                {formatDate(entry.new_values?.payment_date)}
              </p>
            )}
            {entry.action === 'deleted' && (
              <p>
                Removed <span className="tnum font-bold">{peso(entry.old_values?.amount)}</span>{' '}
                dated {formatDate(entry.old_values?.payment_date)}
                {entry.new_values?.reason && ` — ${entry.new_values.reason}`}
              </p>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}

/* -------------------------------------------------------------------- page */

const TABS = [
  { id: 'payments', label: 'Payments' },
  { id: 'history', label: 'Change history' },
];

export default function LoanDetail() {
  const { id } = useParams();
  const [tab, setTab] = useState('payments');
  const [paying, setPaying] = useState(false);
  const [editingPayment, setEditingPayment] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [deleteReason, setDeleteReason] = useState('');
  const [flash, setFlash] = useState(null);

  const loan = useAsync(() => getLoan(id), [id]);
  const payments = useAsync(() => getLoanPayments(id), [id]);
  const audit = useAsync(() => getPaymentAudit(id), [id]);

  const refreshAll = () => {
    loan.reload();
    payments.reload();
    audit.reload();
  };

  if (loan.loading) return <PageLoader />;
  if (loan.error) return <ErrorNote error={loan.error} onRetry={loan.reload} />;

  const l = loan.data;
  const closed = l.status !== 'active';

  return (
    <div className="space-y-5">
      <Link
        to="/app/loans"
        className="inline-flex items-center gap-2 text-sm font-semibold text-muted transition-colors hover:text-ink"
      >
        <Icon name="arrowLeft" size={16} />
        All loans
      </Link>

      <header className="card p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="mb-1 flex flex-wrap items-center gap-2">
              <StatusPill status={l.is_overdue ? 'overdue' : l.status} />
              {l.penalty_applied && (
                <span className="pill pill-red">Penalty {peso(l.penalty_amount)}</span>
              )}
              {Number(l.arrears) > 0 && !l.is_overdue && (
                <span className="pill pill-amber">Behind {peso(l.arrears)}</span>
              )}
            </div>
            <h1 className="text-xl font-extrabold tracking-tight sm:text-2xl">
              <Link to={`/app/members/${l.member_id}`} className="hover:text-brand">
                {l.member_name}
              </Link>
            </h1>
            <p className="text-muted">
              {peso(l.principal)} at {l.interest_rate}% flat · {l.term_days} days ·{' '}
              {formatDate(l.start_date)} to {formatDate(l.maturity_date)}
            </p>
          </div>

          {!closed && (
            <button
              type="button"
              className="btn btn-success w-full sm:w-auto"
              onClick={() => setPaying(true)}
            >
              <Icon name="peso" size={18} />
              Record payment
            </button>
          )}
        </div>

        {flash && (
          <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 rounded-xl border border-green/30 bg-green-soft px-4 py-3 text-sm">
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
      </header>

      {/* Money summary */}
      <div className="card grid grid-cols-2 divide-x divide-y divide-[#eef0f6] sm:grid-cols-4 sm:divide-y-0">
        {[
          ['Total payable', peso(l.total_obligation), 'text-ink'],
          ['Paid so far', peso(l.paid_total), 'text-green'],
          ['Balance', peso(l.balance), Number(l.balance) > 0 ? 'text-red' : 'text-green'],
          ['Daily due', peso(l.daily_due), 'text-brand'],
        ].map(([label, value, tone]) => (
          <div key={label} className="px-4 py-4 sm:px-5">
            <p className="text-xs font-bold uppercase tracking-wide text-faint">{label}</p>
            <p className={`tnum mt-1 text-lg font-extrabold sm:text-xl ${tone}`}>{value}</p>
          </div>
        ))}
      </div>

      <div className="card grid grid-cols-2 divide-x divide-y divide-[#eef0f6] sm:grid-cols-4 sm:divide-y-0">
        {[
          ['Principal recovered', peso(l.paid_principal)],
          ['Interest earned', peso(l.paid_interest)],
          ['Penalty collected', peso(l.paid_penalty)],
          [
            l.is_overdue ? 'Days past due' : 'Payments made',
            l.is_overdue ? `${l.days_past_maturity} days` : `${l.payments_count}`,
          ],
        ].map(([label, value]) => (
          <div key={label} className="px-4 py-3.5 sm:px-5">
            <p className="text-xs font-bold uppercase tracking-wide text-faint">{label}</p>
            <p className="tnum mt-0.5 font-bold">{value}</p>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-2" role="tablist" aria-label="Loan details">
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={tab === item.id}
            onClick={() => setTab(item.id)}
            className={`min-h-[38px] rounded-[10px] px-3.5 text-sm font-semibold transition-colors ${
              tab === item.id
                ? 'bg-brand text-white'
                : 'bg-surface text-muted hover:text-ink'
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      <SectionCard>
        {tab === 'payments' &&
          (payments.loading ? (
            <div className="p-4">
              <div className="skeleton h-32" />
            </div>
          ) : (
            <PaymentsTable
              rows={payments.data ?? []}
              onEdit={setEditingPayment}
              onDelete={(row) => {
                setDeleteReason('');
                setDeleting(row);
              }}
            />
          ))}

        {tab === 'history' &&
          (audit.loading ? (
            <div className="p-4">
              <div className="skeleton h-32" />
            </div>
          ) : (
            <AuditTrail rows={audit.data ?? []} />
          ))}
      </SectionCard>

      {(paying || editingPayment) && (
        <PaymentDialog
          loan={l}
          payment={editingPayment}
          onClose={() => {
            setPaying(false);
            setEditingPayment(null);
          }}
          onSaved={(result, wasEdit) => {
            if (!wasEdit) setFlash(result);
            refreshAll();
          }}
        />
      )}

      <Modal
        open={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        title="Delete this payment?"
        subtitle={
          deleting
            ? `${peso(deleting.amount)} dated ${formatDate(deleting.payment_date)}`
            : undefined
        }
        size="sm"
        footer={
          <>
            <button type="button" className="btn btn-outline" onClick={() => setDeleting(null)}>
              Keep it
            </button>
            <button
              type="button"
              className="btn btn-danger"
              onClick={async () => {
                await deletePayment(deleting.id, deleteReason.trim() || null);
                setDeleting(null);
                refreshAll();
              }}
            >
              Delete payment
            </button>
          </>
        }
      >
        <p className="text-sm">
          The remaining payments on this loan are recalculated afterwards. The deletion is kept in
          the change history.
        </p>
        <label className="label mt-4" htmlFor="del-reason">
          Reason (optional)
        </label>
        <input
          id="del-reason"
          className="input"
          value={deleteReason}
          onChange={(event) => setDeleteReason(event.target.value)}
          placeholder="e.g. recorded twice by mistake"
        />
      </Modal>
    </div>
  );
}
