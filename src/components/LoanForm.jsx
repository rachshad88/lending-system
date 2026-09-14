import { useMemo, useState } from 'react';
import Modal from './Modal';
import { Spinner } from './ui';
import { useAsync } from '../lib/useAsync';
import { getSettingsCached, listMemberOptions } from '../lib/api';
import { addDays, formatDate, peso, todayISO } from '../lib/format';

/** Pass `loan` to correct an existing one; leave it out to release a new one. */
export default function LoanForm({
  open,
  onClose,
  onSubmit,
  memberId = null,
  memberName,
  loan = null,
  suggestedPrincipal = null,
}) {
  const { data: settings } = useAsync(getSettingsCached, []);
  const editing = Boolean(loan);
  // While editing, the picker is always offered — reassigning a loan released
  // against the wrong member is the main reason to open this form again.
  const needsMemberPicker = editing || !memberId;
  const [pickedMemberId, setPickedMemberId] = useState(loan?.member_id ?? '');
  const [principal, setPrincipal] = useState(
    loan ? String(loan.principal) : suggestedPrincipal ? String(suggestedPrincipal) : ''
  );
  const [term, setTerm] = useState(loan ? String(loan.term_days) : '');
  const [startDate, setStartDate] = useState(loan?.start_date ?? todayISO());
  const [note, setNote] = useState(loan?.note ?? '');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const { data: memberOptions, loading: membersLoading } = useAsync(
    () => (needsMemberPicker ? listMemberOptions() : Promise.resolve([])),
    [needsMemberPicker]
  );

  const members = memberOptions ?? [];
  const pickedMember = members.find((m) => m.id === pickedMemberId);

  // An existing loan keeps the rate it was written at, whatever Settings says now.
  const rate = editing ? Number(loan.interest_rate) : Number(settings?.interest_rate ?? 20);
  const penaltyRate = Number(settings?.penalty_rate ?? 10);
  const effectiveTerm = Number(term) || Number(settings?.default_term_days ?? 40);

  const preview = useMemo(() => {
    const amount = Number(principal) || 0;
    const interest = Math.round(amount * (rate / 100) * 100) / 100;
    const total = amount + interest;
    return {
      interest,
      total,
      daily: effectiveTerm > 0 ? total / effectiveTerm : 0,
      dailyPrincipal: effectiveTerm > 0 ? amount / effectiveTerm : 0,
      dailyInterest: effectiveTerm > 0 ? interest / effectiveTerm : 0,
      maturity: addDays(startDate, effectiveTerm),
    };
  }, [principal, rate, effectiveTerm, startDate]);

  const submit = async (event) => {
    event.preventDefault();
    if (needsMemberPicker && !pickedMemberId) {
      setError('Choose a member first.');
      return;
    }
    const amount = Number(principal);
    if (!amount || amount <= 0) {
      setError('Enter the amount being released.');
      return;
    }
    setError(null);
    setBusy(true);
    try {
      await onSubmit({
        ...(needsMemberPicker ? { memberId: pickedMemberId } : {}),
        principal: amount,
        termDays: effectiveTerm,
        startDate,
        note: note.trim() || null,
      });
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editing ? 'Correct this loan' : 'Release a new loan'}
      subtitle={
        memberName ? `For ${memberName}` : pickedMember ? `For ${pickedMember.name}` : undefined
      }
      size="lg"
      footer={
        <>
          <button type="button" className="btn btn-outline" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button type="submit" form="loan-form" className="btn btn-primary" disabled={busy}>
            {busy ? (
              <Spinner size={18} label="Saving" />
            ) : editing ? (
              'Save changes'
            ) : (
              'Release loan'
            )}
          </button>
        </>
      }
    >
      <form id="loan-form" onSubmit={submit} noValidate className="space-y-4">
        {editing && Number(loan.payments_count) > 0 && (
          <p className="rounded-xl bg-amber-soft px-4 py-3 text-sm">
            {loan.payments_count} payment(s) already collected on this loan. Changing the terms
            re-splits every one of them between principal and interest.
          </p>
        )}

        {needsMemberPicker && (
          <div>
            <label className="label" htmlFor="lf-member">
              Member <span className="text-red">*</span>
            </label>
            <select
              id="lf-member"
              className="select"
              value={pickedMemberId}
              onChange={(event) => setPickedMemberId(event.target.value)}
              disabled={membersLoading || members.length === 0}
              required
            >
              <option value="">
                {membersLoading ? 'Loading members…' : 'Choose a member'}
              </option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.toda ? `${m.name} (${m.toda})` : m.name}
                </option>
              ))}
            </select>
            {!membersLoading && members.length === 0 && (
              <p className="mt-1 text-xs text-muted">
                No members yet. Add a member first, then release their loan.
              </p>
            )}
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="lf-principal">
              Principal released <span className="text-red">*</span>
            </label>
            <input
              id="lf-principal"
              className="input tnum"
              type="number"
              min="1"
              step="0.01"
              inputMode="decimal"
              value={principal}
              onChange={(event) => setPrincipal(event.target.value)}
              placeholder="5000"
              required
            />
            {suggestedPrincipal != null && !editing && (
              <p className="mt-1 text-xs text-muted">
                Prefilled from their track record. Change it if this loan should be different.
              </p>
            )}
          </div>

          <div>
            <label className="label" htmlFor="lf-term">
              Term in days
            </label>
            <input
              id="lf-term"
              className="input tnum"
              type="number"
              min="1"
              max="365"
              inputMode="numeric"
              value={term}
              onChange={(event) => setTerm(event.target.value)}
              placeholder={String(settings?.default_term_days ?? 40)}
            />
            <p className="mt-1 text-xs text-muted">
              Leave blank for the standard {settings?.default_term_days ?? 40} days.
            </p>
          </div>

          <div>
            <label className="label" htmlFor="lf-start">
              Release date
            </label>
            <input
              id="lf-start"
              className="input"
              type="date"
              value={startDate}
              max={todayISO()}
              onChange={(event) => setStartDate(event.target.value)}
            />
          </div>

          <div>
            <label className="label" htmlFor="lf-note">
              Note
            </label>
            <input
              id="lf-note"
              className="input"
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="Optional"
            />
          </div>
        </div>

        {/* Live computation, so nothing is a surprise after saving */}
        <div className="rounded-xl border border-line bg-canvas p-4">
          <p className="mb-3 text-xs font-bold uppercase tracking-wide text-faint">
            Computation at {rate}% flat
          </p>
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div>
              <dt className="text-xs font-semibold text-muted">Interest</dt>
              <dd className="tnum text-lg font-extrabold">{peso(preview.interest)}</dd>
            </div>
            <div>
              <dt className="text-xs font-semibold text-muted">Total payable</dt>
              <dd className="tnum text-lg font-extrabold">{peso(preview.total)}</dd>
            </div>
            <div>
              <dt className="text-xs font-semibold text-muted">Pay daily</dt>
              <dd className="tnum text-lg font-extrabold text-green">{peso(preview.daily)}</dd>
            </div>
            <div>
              <dt className="text-xs font-semibold text-muted">Due date</dt>
              <dd className="text-lg font-extrabold">{formatDate(preview.maturity)}</dd>
            </div>
          </dl>
          <p className="mt-3 text-xs leading-relaxed text-muted">
            Each daily payment is {peso(preview.dailyPrincipal)} principal +{' '}
            {peso(preview.dailyInterest)} interest. First due date is{' '}
            {formatDate(addDays(startDate, 1))}. If a balance is still open after{' '}
            {formatDate(preview.maturity)}, a one-time {penaltyRate}% charge is added to whatever is
            left.
          </p>
        </div>

        {error && (
          <p role="alert" className="rounded-xl bg-red-soft px-4 py-3 text-sm">
            {error}
          </p>
        )}
      </form>
    </Modal>
  );
}
