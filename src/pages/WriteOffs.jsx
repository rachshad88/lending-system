import { useState } from 'react';
import { Link } from 'react-router-dom';
import Modal from '../components/Modal';
import {
  EmptyState,
  ErrorNote,
  Icon,
  SectionCard,
  SkeletonRows,
  Spinner,
  StatusPill,
} from '../components/ui';
import { useAsync } from '../lib/useAsync';
import {
  confirmWriteOff,
  dismissWriteOff,
  ensureMaintenance,
  getSettingsCached,
  listGoneQuiet,
  listWriteOffs,
  reopenLoan,
} from '../lib/api';
import { formatDate, formatDateTime, peso } from '../lib/format';
import { quietDays, quietTone } from '../lib/risk';

const TABS = [
  { id: 'slipping', label: 'Slipping' },
  { id: 'flagged', label: 'For review' },
  { id: 'confirmed', label: 'Bad debt' },
  { id: 'dismissed', label: 'Dismissed' },
  { id: 'all', label: 'All' },
];

const PILL = { red: 'pill-red', amber: 'pill-amber', muted: 'pill-grey' };

/**
 * Loans still inside their term that have stopped paying. These are the ones
 * worth a phone call — by the time a loan reaches the write-off tab the money
 * has usually been gone for months.
 */
function SlippingList({ quietThreshold }) {
  const list = useAsync(
    () => listGoneQuiet({ minDays: quietThreshold, limit: 50 }),
    [quietThreshold]
  );
  const rows = list.data ?? [];

  if (list.loading) {
    return (
      <div className="p-4">
        <SkeletonRows rows={4} />
      </div>
    );
  }
  if (list.error) {
    return (
      <div className="p-4">
        <ErrorNote error={list.error} onRetry={list.reload} />
      </div>
    );
  }
  if (rows.length === 0) {
    return (
      <EmptyState
        icon="check"
        title="Nobody is slipping"
        hint={`Every active loan has had a collection within the last ${quietThreshold} days.`}
      />
    );
  }

  return rows.map((loan) => {
    const days = quietDays(loan);
    return (
      <div key={loan.loan_id} className="flex flex-wrap items-center gap-x-4 gap-y-2 p-4 sm:p-5">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Link to={`/app/loans/${loan.loan_id}`} className="truncate font-bold hover:text-brand">
              {loan.member_name}
            </Link>
            <span className={`pill ${PILL[quietTone(days, quietThreshold)]}`}>
              {days} days quiet
            </span>
            {loan.is_overdue && <span className="pill pill-red">Past due</span>}
          </div>
          <p className="mt-0.5 text-sm text-muted">
            {loan.last_payment_date
              ? `Last paid ${formatDate(loan.last_payment_date)}`
              : `Never paid, released ${formatDate(loan.start_date)}`}
            {Number(loan.arrears) > 0 && ` · ${peso(loan.arrears)} behind`}
          </p>
        </div>
        <div className="text-right">
          <p className="text-xs font-semibold text-faint">Balance</p>
          <p className="tnum font-extrabold">{peso(loan.balance)}</p>
        </div>
        {loan.contact_number && (
          <a
            href={`tel:${String(loan.contact_number).replace(/[^\d+]/g, '')}`}
            className="btn btn-sm btn-outline"
            aria-label={`Call ${loan.member_name}`}
          >
            <Icon name="members" size={15} />
            Call
          </a>
        )}
      </div>
    );
  });
}

export default function WriteOffs() {
  const [tab, setTab] = useState('slipping');
  const [action, setAction] = useState(null); // { kind, row }
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const settings = useAsync(getSettingsCached, []);
  const list = useAsync(async () => {
    if (tab === 'slipping') return [];
    await ensureMaintenance();
    return listWriteOffs(tab);
  }, [tab]);

  const rows = list.data ?? [];
  const threshold = settings.data?.writeoff_threshold_days ?? 90;
  const quietThreshold = Number(settings.data?.gone_quiet_days) || 3;

  const runAction = async () => {
    setBusy(true);
    setError(null);
    try {
      if (action.kind === 'confirm') {
        await confirmWriteOff(action.row.loan_id, reason.trim() || null);
      } else if (action.kind === 'dismiss') {
        await dismissWriteOff(action.row.loan_id, reason.trim() || null);
      } else {
        await reopenLoan(action.row.loan_id);
      }
      setAction(null);
      setReason('');
      list.reload();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const dialogCopy = {
    confirm: {
      title: 'Write this loan off as bad debt?',
      body: `The unrecovered principal is deducted from net income and the loan is closed. Interest you never collected is not deducted, because it was never counted as income.`,
      cta: 'Confirm write-off',
      className: 'btn-danger',
    },
    dismiss: {
      title: 'Keep collecting on this loan?',
      body: 'The flag is cleared and the loan stays active. It will not be flagged again unless you re-run the check after clearing it.',
      cta: 'Dismiss flag',
      className: 'btn-primary',
    },
    reopen: {
      title: 'Reopen this loan?',
      body: 'The loan goes back to active and the write-off loss is removed from net income.',
      cta: 'Reopen loan',
      className: 'btn-primary',
    },
  }[action?.kind ?? 'confirm'];

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-extrabold tracking-tight sm:text-[1.75rem]">Risk review</h1>
        <p className="text-muted">
          <strong>Slipping</strong> catches loans that stopped paying {quietThreshold}+ days ago,
          while there is still something to recover. Loans more than {threshold} days past their due
          date are flagged for review automatically, and nothing affects net income until you
          confirm it.
        </p>
      </header>

      <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setTab(item.id)}
            aria-pressed={tab === item.id}
            className={`pill pill-btn min-h-[36px] shrink-0 px-3.5 transition-colors ${
              tab === item.id ? 'pill-blue' : 'pill-grey hover:bg-[#e6e9f1]'
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      <ErrorNote error={list.error} onRetry={list.reload} />

      <SectionCard bodyClass="divide-y divide-[#eef0f6]">
        {tab === 'slipping' ? (
          // Mounting before the configured threshold arrives would fetch the
          // list once with the fallback and again with the real value.
          settings.loading ? (
            <div className="p-4">
              <SkeletonRows rows={4} />
            </div>
          ) : (
            <SlippingList quietThreshold={quietThreshold} />
          )
        ) : list.loading ? (
          <div className="p-4">
            <SkeletonRows rows={4} />
          </div>
        ) : rows.length === 0 ? (
          <EmptyState
            icon="shield"
            title={tab === 'flagged' ? 'Nothing needs a decision' : 'Nothing here'}
            hint={
              tab === 'flagged'
                ? `No active loan is more than ${threshold} days past its due date.`
                : 'Try another tab.'
            }
          />
        ) : (
          rows.map((row) => {
            const loan = row.loan;
            return (
              <div key={row.id} className="p-4 sm:p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="mb-1 flex flex-wrap items-center gap-2">
                      <StatusPill status={row.status} />
                      <span className="text-sm text-muted">
                        Flagged {formatDateTime(row.flagged_at)}
                      </span>
                    </div>
                    <h2 className="text-lg font-bold">
                      {loan ? (
                        <Link to={`/app/loans/${row.loan_id}`} className="hover:text-brand">
                          {loan.member_name}
                        </Link>
                      ) : (
                        'Loan removed'
                      )}
                    </h2>
                    {loan && (
                      <p className="text-sm text-muted">
                        {peso(loan.principal)} released {formatDate(loan.start_date)} · due{' '}
                        {formatDate(loan.maturity_date)} ·{' '}
                        <span className="font-semibold text-red">
                          {loan.days_past_maturity} days past due
                        </span>
                      </p>
                    )}
                  </div>

                  <div className="flex w-full gap-2 sm:w-auto">
                    {row.status === 'flagged' && (
                      <>
                        <button
                          type="button"
                          className="btn btn-sm btn-outline flex-1 sm:flex-none"
                          onClick={() => {
                            setReason('');
                            setAction({ kind: 'dismiss', row });
                          }}
                        >
                          Keep collecting
                        </button>
                        <button
                          type="button"
                          className="btn btn-sm btn-danger flex-1 sm:flex-none"
                          onClick={() => {
                            setReason('');
                            setAction({ kind: 'confirm', row });
                          }}
                        >
                          Write off
                        </button>
                      </>
                    )}
                    {row.status === 'confirmed' && (
                      <button
                        type="button"
                        className="btn btn-sm btn-outline flex-1 sm:flex-none"
                        onClick={() => setAction({ kind: 'reopen', row })}
                      >
                        Reopen loan
                      </button>
                    )}
                  </div>
                </div>

                <dl className="mt-3 grid grid-cols-2 gap-3 rounded-xl bg-canvas p-3 sm:grid-cols-4">
                  <div>
                    <dt className="text-xs font-bold uppercase tracking-wide text-faint">
                      Balance
                    </dt>
                    <dd className="tnum font-bold">
                      {peso(loan?.balance ?? row.balance_at_flag)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs font-bold uppercase tracking-wide text-faint">
                      Principal at risk
                    </dt>
                    <dd className="tnum font-bold text-red">
                      {peso(row.principal_loss ?? loan?.principal_balance ?? 0)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs font-bold uppercase tracking-wide text-faint">
                      Already collected
                    </dt>
                    <dd className="tnum font-bold text-green">{peso(loan?.paid_total ?? 0)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-bold uppercase tracking-wide text-faint">
                      Last payment
                    </dt>
                    <dd className="font-bold">
                      {loan?.last_payment_date ? formatDate(loan.last_payment_date) : 'Never'}
                    </dd>
                  </div>
                </dl>

                {row.reason && (
                  <p className="mt-2 text-sm text-muted">
                    <span className="font-semibold">Reason:</span> {row.reason}
                  </p>
                )}
              </div>
            );
          })
        )}
      </SectionCard>

      <Modal
        open={Boolean(action)}
        onClose={() => setAction(null)}
        title={dialogCopy.title}
        subtitle={action?.row?.loan?.member_name}
        size="sm"
        footer={
          <>
            <button type="button" className="btn btn-outline" onClick={() => setAction(null)}>
              Cancel
            </button>
            <button
              type="button"
              className={`btn ${dialogCopy.className}`}
              onClick={runAction}
              disabled={busy}
            >
              {busy ? <Spinner size={18} label="Saving" /> : dialogCopy.cta}
            </button>
          </>
        }
      >
        <p className="text-sm">{dialogCopy.body}</p>

        {action?.kind === 'confirm' && action.row.loan && (
          <p className="mt-3 rounded-xl bg-red-soft px-4 py-3 text-sm">
            <span className="font-bold">{peso(action.row.loan.principal_balance)}</span> of principal
            will be deducted from net income.
          </p>
        )}

        {action?.kind !== 'reopen' && (
          <>
            <label className="label mt-4" htmlFor="wo-reason">
              Reason (optional)
            </label>
            <input
              id="wo-reason"
              className="input"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="e.g. borrower moved away"
            />
          </>
        )}

        {error && (
          <p role="alert" className="mt-3 rounded-xl bg-red-soft px-4 py-3 text-sm">
            {error}
          </p>
        )}
      </Modal>
    </div>
  );
}
