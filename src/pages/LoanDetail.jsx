import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ACTION_TONE, AuditDescription } from '../components/AuditEntry';
import LoanForm from '../components/LoanForm';
import Modal from '../components/Modal';
import PaymentDialog from '../components/PaymentDialog';
import {
  EmptyState,
  ErrorNote,
  Icon,
  PageLoader,
  SectionCard,
  Spinner,
  StatusPill,
} from '../components/ui';
import { useAsync } from '../lib/useAsync';
import {
  deleteLoan,
  deletePayment,
  getBusinessName,
  getLoan,
  getLoanAudit,
  getLoanPayments,
  getPaymentAudit,
  updateLoan,
} from '../lib/api';
import { exportLoanStatementPdf } from '../lib/exporters';
import { addDays, formatDate, formatDateTime, peso, todayISO } from '../lib/format';

/* ------------------------------------------------------------------- strip */

/**
 * One square per collection day of the term: paid, missed, or not yet due.
 * Drift is invisible in a balance figure but obvious as a run of red, and it
 * is something you can hold up in front of the member on the phone.
 */
function PaymentStrip({ loan, payments }) {
  const paidDates = new Set(payments.map((p) => p.payment_date));
  const today = todayISO();
  const term = Number(loan.term_days) || 0;
  if (term <= 0) return null;

  // day one is the first due date, the day after release
  const days = Array.from({ length: term }, (_, i) => addDays(loan.start_date, i + 1));
  const elapsed = days.filter((day) => day <= today);
  const covered = elapsed.filter((day) => paidDates.has(day));
  const afterTerm = payments.filter((p) => p.payment_date > days[term - 1]).length;

  return (
    <SectionCard
      title="Collection pattern"
      subtitle={
        elapsed.length > 0
          ? `${covered.length} of ${elapsed.length} collection days so far had a payment`
          : 'The first collection day has not arrived yet'
      }
      bodyClass="p-4 sm:p-5"
    >
      <div className="flex flex-wrap gap-1">
        {days.map((day) => {
          const paid = paidDates.has(day);
          const future = day > today;
          const tone = paid ? 'bg-green' : future ? 'bg-[#eef0f6]' : 'bg-red/70';
          return (
            <span
              key={day}
              className={`h-4 w-4 rounded-[3px] ${tone}`}
              title={`${formatDate(day)}: ${paid ? 'paid' : future ? 'not due yet' : 'nothing collected'}`}
            />
          );
        })}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-[3px] bg-green" /> Paid
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-[3px] bg-red/70" /> Nothing collected
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-[3px] bg-[#eef0f6]" /> Not due yet
        </span>
        {afterTerm > 0 && <span>{afterTerm} payment(s) landed after the due date</span>}
      </div>
    </SectionCard>
  );
}

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
        hint="Any edit or deletion of this loan or its payments is logged here with the old and new values."
      />
    );
  }

  return (
    <ul className="divide-y divide-[#eef0f6]">
      {rows.map((entry) => (
        <li key={`${entry.kind}-${entry.id}`} className="px-4 py-3.5 sm:px-5">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`pill ${ACTION_TONE[entry.action] ?? 'pill-grey'}`}>
              {entry.kind} {entry.action}
            </span>
            <span className="text-sm text-muted">{formatDateTime(entry.changed_at)}</span>
          </div>
          <div className="mt-1.5 text-sm">
            <AuditDescription entry={entry} />
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
  const navigate = useNavigate();
  const [tab, setTab] = useState('payments');
  const [paying, setPaying] = useState(false);
  const [editingPayment, setEditingPayment] = useState(null);
  const [editingLoan, setEditingLoan] = useState(false);
  const [deleting, setDeleting] = useState(null);
  const [deleteReason, setDeleteReason] = useState('');
  const [deleteError, setDeleteError] = useState(null);
  const [deletingPayment, setDeletingPayment] = useState(false);
  const [confirmDeleteLoan, setConfirmDeleteLoan] = useState(false);
  const [deleteLoanReason, setDeleteLoanReason] = useState('');
  const [deleteLoanError, setDeleteLoanError] = useState(null);
  const [deletingLoan, setDeletingLoan] = useState(false);
  const [flash, setFlash] = useState(null);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState(null);

  const loan = useAsync(() => getLoan(id), [id]);
  const payments = useAsync(() => getLoanPayments(id), [id]);
  const audit = useAsync(() => getPaymentAudit(id), [id]);
  const loanAudit = useAsync(() => getLoanAudit(id), [id]);
  const businessName = useAsync(getBusinessName, []);

  const refreshAll = () => {
    loan.reload();
    payments.reload();
    audit.reload();
    loanAudit.reload();
  };

  if (loan.loading) return <PageLoader />;
  if (loan.error) return <ErrorNote error={loan.error} onRetry={loan.reload} />;

  const l = loan.data;
  const closed = l.status !== 'active';
  const hasPayments = Number(l.payments_count) > 0;

  // one list, newest first, so a term change and the payments around it read in order
  const history = [
    ...(audit.data ?? []).map((entry) => ({ ...entry, kind: 'payment' })),
    ...(loanAudit.data ?? []).map((entry) => ({ ...entry, kind: 'loan' })),
  ].sort((a, b) => new Date(b.changed_at) - new Date(a.changed_at));

  const downloadStatement = async () => {
    setExporting(true);
    setExportError(null);
    try {
      await exportLoanStatementPdf({
        loan: l,
        payments: payments.data ?? [],
        businessName: businessName.data,
      });
    } catch (err) {
      setExportError(err.message);
    } finally {
      setExporting(false);
    }
  };

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

          <div className="flex w-full flex-wrap gap-2 sm:w-auto">
            <button
              type="button"
              className="btn btn-outline"
              onClick={downloadStatement}
              // the payment list is part of the statement, so wait until it has loaded
              disabled={exporting || payments.loading || Boolean(payments.error)}
              title="PDF for the member: terms, balance today and every payment"
            >
              {exporting ? (
                <Spinner size={18} label="Building statement" />
              ) : (
                <>
                  <Icon name="download" size={17} />
                  Statement
                </>
              )}
            </button>
            {l.status !== 'written_off' && (
              <button
                type="button"
                className="btn btn-outline"
                onClick={() => setEditingLoan(true)}
              >
                <Icon name="edit" size={17} />
                Edit loan
              </button>
            )}
            {!closed && (
              <button
                type="button"
                className="btn btn-success flex-1 sm:flex-none"
                onClick={() => setPaying(true)}
              >
                <Icon name="peso" size={18} />
                Record payment
              </button>
            )}
          </div>
        </div>

        {exportError && (
          <div className="mt-4">
            <ErrorNote error={exportError} />
          </div>
        )}

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

      {!payments.loading && <PaymentStrip loan={l} payments={payments.data ?? []} />}

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
                setDeleteError(null);
                setDeleting(row);
              }}
            />
          ))}

        {tab === 'history' &&
          (audit.loading || loanAudit.loading ? (
            <div className="p-4">
              <div className="skeleton h-32" />
            </div>
          ) : (
            <AuditTrail rows={history} />
          ))}
      </SectionCard>

      {/* Danger zone */}
      <SectionCard title="Danger zone" bodyClass="p-4 sm:p-5">
        <p className="mb-3 text-sm text-muted">
          {hasPayments
            ? 'This loan has collections on record, so it cannot be deleted. That history has to stay. Write it off instead if the money will never be recovered.'
            : 'Nothing has been collected yet, so this loan can still be removed outright. Use it when the loan was released against the wrong member or never actually handed over.'}
        </p>
        <button
          type="button"
          className="btn btn-danger"
          disabled={hasPayments}
          onClick={() => {
            setDeleteLoanReason('');
            setDeleteLoanError(null);
            setConfirmDeleteLoan(true);
          }}
        >
          <Icon name="trash" size={16} />
          Delete loan
        </button>
      </SectionCard>

      {editingLoan && (
        <LoanForm
          open
          loan={l}
          onClose={() => setEditingLoan(false)}
          onSubmit={async (values) => {
            await updateLoan({ loanId: l.loan_id, ...values });
            refreshAll();
          }}
        />
      )}

      <Modal
        open={confirmDeleteLoan}
        onClose={() => setConfirmDeleteLoan(false)}
        title="Delete this loan?"
        subtitle={`${peso(l.principal)} released to ${l.member_name} on ${formatDate(l.start_date)}`}
        size="sm"
        footer={
          <>
            <button
              type="button"
              className="btn btn-outline"
              onClick={() => setConfirmDeleteLoan(false)}
              disabled={deletingLoan}
            >
              Keep it
            </button>
            <button
              type="button"
              className="btn btn-danger"
              disabled={deletingLoan}
              onClick={async () => {
                setDeletingLoan(true);
                setDeleteLoanError(null);
                try {
                  await deleteLoan(l.loan_id, deleteLoanReason.trim() || null);
                  navigate('/app/loans');
                } catch (err) {
                  setDeleteLoanError(err.message);
                } finally {
                  setDeletingLoan(false);
                }
              }}
            >
              Delete loan
            </button>
          </>
        }
      >
        <p className="text-sm">
          The loan is removed for good and stops counting towards principal on the street. The
          deletion itself is kept in the change history.
        </p>
        <label className="label mt-4" htmlFor="del-loan-reason">
          Reason (optional)
        </label>
        <input
          id="del-loan-reason"
          className="input"
          value={deleteLoanReason}
          onChange={(event) => setDeleteLoanReason(event.target.value)}
          placeholder="e.g. released to the wrong member"
        />
        {deleteLoanError && (
          <p role="alert" className="mt-4 rounded-xl bg-red-soft px-4 py-3 text-sm">
            {deleteLoanError}
          </p>
        )}
      </Modal>

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
            <button
              type="button"
              className="btn btn-outline"
              onClick={() => setDeleting(null)}
              disabled={deletingPayment}
            >
              Keep it
            </button>
            <button
              type="button"
              className="btn btn-danger"
              disabled={deletingPayment}
              onClick={async () => {
                setDeletingPayment(true);
                setDeleteError(null);
                try {
                  await deletePayment(deleting.id, deleteReason.trim() || null);
                  setDeleting(null);
                  refreshAll();
                } catch (err) {
                  setDeleteError(err.message);
                } finally {
                  setDeletingPayment(false);
                }
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
        {deleteError && (
          <p role="alert" className="mt-4 rounded-xl bg-red-soft px-4 py-3 text-sm">
            {deleteError}
          </p>
        )}
      </Modal>
    </div>
  );
}
