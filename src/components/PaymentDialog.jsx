import { useState } from 'react';
import Modal from './Modal';
import { Spinner } from './ui';
import { useAsync } from '../lib/useAsync';
import { listOpenLoanOptions, recordPayment, updatePayment } from '../lib/api';
import { peso, todayISO } from '../lib/format';

/**
 * Records or edits a collection. Pass `loan` when the loan is already known
 * (from its own page); leave it out and the dialog offers a picker, which is
 * how the dashboard records a payment without navigating anywhere first.
 */
export default function PaymentDialog({ loan: fixedLoan = null, payment = null, onClose, onSaved }) {
  const editing = Boolean(payment);
  const needsPicker = !fixedLoan && !editing;

  const [pickedLoanId, setPickedLoanId] = useState('');
  const [amount, setAmount] = useState(
    editing
      ? String(payment.amount)
      : fixedLoan
        ? String(Number(fixedLoan.daily_due ?? 0).toFixed(2))
        : ''
  );
  const [date, setDate] = useState(editing ? payment.payment_date : todayISO());
  const [note, setNote] = useState(payment?.note ?? '');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const { data: loanOptions, loading: loansLoading } = useAsync(
    () => (needsPicker ? listOpenLoanOptions() : Promise.resolve([])),
    [needsPicker]
  );
  const options = loanOptions ?? [];
  const loan = fixedLoan ?? options.find((o) => o.loan_id === pickedLoanId) ?? null;

  const payoff = loan
    ? editing
      ? Number(loan.balance) + Number(payment.amount)
      : Number(loan.balance)
    : 0;

  const pickLoan = (loanId) => {
    setPickedLoanId(loanId);
    const picked = options.find((o) => o.loan_id === loanId);
    setAmount(picked ? String(Number(picked.daily_due ?? 0).toFixed(2)) : '');
  };

  const submit = async (event) => {
    event.preventDefault();
    if (!loan) {
      setError('Choose a loan first.');
      return;
    }
    const value = Number(amount);
    if (!value || value <= 0) {
      setError('Enter the amount collected.');
      return;
    }
    setError(null);
    setBusy(true);
    try {
      const result = editing
        ? await updatePayment({ paymentId: payment.id, amount: value, paymentDate: date, note })
        : await recordPayment({ loanId: loan.loan_id, amount: value, paymentDate: date, note });
      onSaved(result, editing);
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={editing ? 'Edit payment' : 'Record a payment'}
      subtitle={loan ? `${loan.member_name} · balance ${peso(loan.balance)}` : undefined}
      footer={
        <>
          <button type="button" className="btn btn-outline" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button type="submit" form="payment-form" className="btn btn-success" disabled={busy}>
            {busy ? <Spinner size={18} label="Saving" /> : editing ? 'Save changes' : 'Record payment'}
          </button>
        </>
      }
    >
      <form id="payment-form" onSubmit={submit} className="space-y-4">
        {needsPicker && (
          <div>
            <label className="label" htmlFor="pay-loan">
              Loan <span className="text-red">*</span>
            </label>
            <select
              id="pay-loan"
              className="select"
              value={pickedLoanId}
              onChange={(event) => pickLoan(event.target.value)}
              disabled={loansLoading || options.length === 0}
              required
            >
              <option value="">{loansLoading ? 'Loading loans…' : 'Choose a loan'}</option>
              {options.map((o) => (
                <option key={o.loan_id} value={o.loan_id}>
                  {o.member_name}
                  {o.toda ? ` (${o.toda})` : ''} — {peso(o.balance)} left
                </option>
              ))}
            </select>
            {!loansLoading && options.length === 0 && (
              <p className="mt-1 text-xs text-muted">No active loans with a balance to collect.</p>
            )}
          </div>
        )}

        <div>
          <label className="label" htmlFor="pay-amount">
            Amount collected <span className="text-red">*</span>
          </label>
          <input
            id="pay-amount"
            className="input tnum text-lg font-bold"
            type="number"
            min="0.01"
            step="0.01"
            inputMode="decimal"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            required
          />
          {loan && (
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                type="button"
                className="pill pill-grey min-h-[32px] px-3"
                onClick={() => setAmount(String(Number(loan.daily_due).toFixed(2)))}
              >
                Daily due {peso(loan.daily_due)}
              </button>
              {Number(loan.arrears) > 0 && (
                <button
                  type="button"
                  className="pill pill-amber min-h-[32px] px-3"
                  onClick={() => setAmount(String(Number(loan.arrears).toFixed(2)))}
                >
                  Catch up {peso(loan.arrears)}
                </button>
              )}
              <button
                type="button"
                className="pill pill-blue min-h-[32px] px-3"
                onClick={() => setAmount(String(payoff.toFixed(2)))}
              >
                Full payoff {peso(payoff)}
              </button>
            </div>
          )}
        </div>

        <div>
          <label className="label" htmlFor="pay-date">
            Date collected
          </label>
          <input
            id="pay-date"
            className="input"
            type="date"
            value={date}
            max={todayISO()}
            onChange={(event) => setDate(event.target.value)}
          />
        </div>

        <div>
          <label className="label" htmlFor="pay-note">
            Note
          </label>
          <input
            id="pay-note"
            className="input"
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="Optional — e.g. paid at terminal"
          />
        </div>

        <p className="text-xs leading-relaxed text-muted">
          Any amount, as many times a day as the member pays. Each collection comes off the balance
          and is split between principal and interest in the same proportion as the loan.
        </p>

        {error && (
          <p role="alert" className="rounded-xl bg-red-soft px-4 py-3 text-sm">
            {error}
          </p>
        )}
      </form>
    </Modal>
  );
}
