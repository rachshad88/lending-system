import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import LoanForm from '../components/LoanForm';
import MemberForm from '../components/MemberForm';
import Modal from '../components/Modal';
import ReliabilityPanel from '../components/ReliabilityPanel';
import MemberPhoto from '../components/MemberPhoto';
import {
  EmptyState,
  ErrorNote,
  Icon,
  PageLoader,
  SectionCard,
  StatusPill,
} from '../components/ui';
import { useAsync } from '../lib/useAsync';
import {
  createLoan,
  deleteMember,
  getMember,
  getMemberLoans,
  getMemberReliability,
  getSettingsCached,
  updateMember,
} from '../lib/api';
import { formatDate, initials, peso } from '../lib/format';
import { reliabilityGrade, suggestedCeiling } from '../lib/risk';

// The one-tap re-lend amount never exceeds this, even when the track record
// would justify more — it is a quick shortcut, not the full ceiling. Edit the
// principal in the form for anything larger.
const RELEND_MAX_AMOUNT = 3000;

const PROFILE_FIELDS = [
  ['contact_number', 'Contact number'],
  ['vehicle_number', 'Vehicle / body number'],
  ['toda', 'TODA / place of work'],
  ['collateral', 'Collateral'],
  ['spouse_name', "Spouse's name"],
  ['referred_by', 'Referred by'],
  ['address', 'Address'],
];

export default function MemberDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [editing, setEditing] = useState(false);
  // null | 'new' | 'relend' — one LoanForm instance either way, so the two
  // entry points can never both be open at once.
  const [loanFormMode, setLoanFormMode] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleteError, setDeleteError] = useState(null);

  const member = useAsync(() => getMember(id), [id]);
  const loans = useAsync(() => getMemberLoans(id), [id]);
  const settings = useAsync(getSettingsCached, []);
  const reliability = useAsync(() => getMemberReliability(id), [id]);

  if (member.loading) return <PageLoader />;
  if (member.error) return <ErrorNote error={member.error} onRetry={member.reload} />;

  const goneQuietDays = Number(settings.data?.gone_quiet_days) || 3;
  const maxExposure = settings.data?.max_exposure_per_member ?? null;
  const verdict = reliabilityGrade(reliability.data, { goneQuietDays });
  const ceiling = verdict ? suggestedCeiling(reliability.data, verdict.grade, { maxExposure }) : null;
  const relendAmount = ceiling != null ? Math.min(ceiling, RELEND_MAX_AMOUNT) : null;

  const m = member.data;
  const rows = loans.data ?? [];
  const totals = rows.reduce(
    (acc, loan) => ({
      borrowed: acc.borrowed + Number(loan.principal),
      paid: acc.paid + Number(loan.paid_total),
      balance: acc.balance + (loan.status === 'written_off' ? 0 : Number(loan.balance)),
    }),
    { borrowed: 0, paid: 0, balance: 0 }
  );

  return (
    <div className="space-y-5">
      <Link
        to="/app/members"
        className="inline-flex items-center gap-2 text-sm font-semibold text-muted transition-colors hover:text-ink"
      >
        <Icon name="arrowLeft" size={16} />
        All members
      </Link>

      <header className="card flex flex-wrap items-center gap-4 p-4 sm:p-5">
        <span className="grid h-14 w-14 shrink-0 place-items-center rounded-full bg-brand-soft text-lg font-extrabold text-brand">
          {initials(m.name)}
        </span>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-xl font-extrabold tracking-tight sm:text-2xl">{m.name}</h1>
          <p className="text-muted">
            {m.toda}
            {m.toda && m.contact_number ? ' · ' : ''}
            {m.contact_number && (
              <a
                href={`tel:${String(m.contact_number).replace(/[^\d+]/g, '')}`}
                className="font-semibold text-brand hover:underline"
              >
                {m.contact_number}
              </a>
            )}
            {!m.toda && !m.contact_number && 'No contact details yet'}
          </p>
        </div>
        <div className="flex w-full gap-2 sm:w-auto">
          <button
            type="button"
            className="btn btn-outline flex-1 sm:flex-none"
            onClick={() => setEditing(true)}
          >
            <Icon name="edit" size={16} />
            Edit
          </button>
          {ceiling >= RELEND_MAX_AMOUNT && (
            <button
              type="button"
              className="btn btn-success flex-1 sm:flex-none"
              onClick={() => setLoanFormMode('relend')}
              title={`Track record suggests up to ${peso(ceiling)}${
                ceiling > relendAmount ? '; edit the amount for more' : ''
              }`}
            >
              <Icon name="trendUp" size={18} />
              Re-lend {peso(relendAmount)}
            </button>
          )}
          <button
            type="button"
            className="btn btn-primary flex-1 sm:flex-none"
            onClick={() => setLoanFormMode('new')}
          >
            <Icon name="plus" size={18} />
            New loan
          </button>
        </div>
      </header>

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <SectionCard
            title="Loans"
            subtitle={`${rows.length} loan(s) on record`}
            bodyClass="divide-y divide-[#eef0f6]"
          >
            {loans.loading ? (
              <div className="p-4">
                <div className="skeleton h-20" />
              </div>
            ) : rows.length === 0 ? (
              <EmptyState
                icon="loans"
                title="No loans yet"
                hint="Release a loan to start collecting."
                action={
                  <button
                    type="button"
                    className="btn btn-primary mt-2"
                    onClick={() => setLoanFormMode('new')}
                  >
                    <Icon name="plus" size={18} />
                    New loan
                  </button>
                }
              />
            ) : (
              rows.map((loan) => (
                <Link
                  key={loan.loan_id}
                  to={`/app/loans/${loan.loan_id}`}
                  className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-4 transition-colors hover:bg-[#f8fafd] sm:px-5"
                >
                  <div className="min-w-[7rem] flex-1">
                    <p className="tnum text-lg font-extrabold">{peso(loan.principal)}</p>
                    <p className="text-sm text-muted">
                      {formatDate(loan.start_date)} · {loan.term_days} days
                    </p>
                  </div>

                  <div className="min-w-[6rem]">
                    <p className="text-xs font-semibold text-faint">Balance</p>
                    <p className="tnum font-bold">{peso(loan.balance)}</p>
                  </div>

                  <div className="min-w-[6rem]">
                    <p className="text-xs font-semibold text-faint">Paid</p>
                    <p className="tnum font-bold text-green">{peso(loan.paid_total)}</p>
                  </div>

                  <div className="flex items-center gap-2">
                    <StatusPill status={loan.is_overdue ? 'overdue' : loan.status} />
                    <Icon name="chevronRight" size={18} className="text-faint" />
                  </div>
                </Link>
              ))
            )}
          </SectionCard>

          <SectionCard title="Totals" bodyClass="grid grid-cols-3 divide-x divide-[#eef0f6]">
            {[
              ['Borrowed', peso(totals.borrowed), 'text-ink'],
              ['Paid back', peso(totals.paid), 'text-green'],
              ['Still owed', peso(totals.balance), totals.balance > 0 ? 'text-red' : 'text-green'],
            ].map(([label, value, tone]) => (
              <div key={label} className="px-4 py-4">
                <p className="text-xs font-bold uppercase tracking-wide text-faint">{label}</p>
                <p className={`tnum mt-1 text-lg font-extrabold sm:text-xl ${tone}`}>{value}</p>
              </div>
            ))}
          </SectionCard>
        </div>

        <div className="space-y-5">
          <ReliabilityPanel
            facts={reliability.data}
            loading={reliability.loading}
            error={reliability.error}
            onRetry={reliability.reload}
            verdict={verdict}
            ceiling={ceiling}
            maxExposure={maxExposure}
          />

          <SectionCard title="Photos" bodyClass="p-4 sm:p-5">
            <div className="grid grid-cols-2 gap-4">
              <MemberPhoto
                memberId={id}
                path={m.photo_path}
                kind="photo"
                label="Member photo"
                onUploaded={member.reload}
              />
              <MemberPhoto
                memberId={id}
                path={m.id_photo_path}
                kind="id"
                label="ID photo"
                onUploaded={member.reload}
              />
            </div>
          </SectionCard>

          <SectionCard title="Profile" bodyClass="px-4 py-2 sm:px-5">
            <dl className="divide-y divide-[#eef0f6]">
              {PROFILE_FIELDS.map(([key, label]) => (
                <div key={key} className="flex items-start justify-between gap-4 py-2.5">
                  <dt className="text-sm text-muted">{label}</dt>
                  <dd className="max-w-[60%] text-right font-semibold">{m[key] || '—'}</dd>
                </div>
              ))}
              <div className="flex items-start justify-between gap-4 py-2.5">
                <dt className="text-sm text-muted">Member since</dt>
                <dd className="text-right font-semibold">{formatDate(m.created_at)}</dd>
              </div>
            </dl>
          </SectionCard>

          {m.notes && (
            <SectionCard title="Notes" bodyClass="px-4 py-3 sm:px-5">
              <p className="whitespace-pre-wrap text-sm">{m.notes}</p>
            </SectionCard>
          )}

          <SectionCard title="Danger zone" bodyClass="p-4 sm:p-5">
            {rows.length > 0 && (
              <p className="mb-3 text-sm text-muted">
                A member with loans on record cannot be deleted. That history has to stay.
              </p>
            )}
            <button
              type="button"
              className="btn btn-outline w-full text-red"
              onClick={() => {
                setDeleteError(null);
                setConfirmDelete(true);
              }}
            >
              <Icon name="trash" size={16} />
              Delete member
            </button>
          </SectionCard>
        </div>
      </div>

      {editing && (
        <MemberForm
          open
          title="Edit member"
          initial={m}
          onClose={() => setEditing(false)}
          onSubmit={async (values) => {
            const { id: _id, created_at: _createdAt, ...patch } = values;
            await updateMember(id, patch);
            member.reload();
          }}
        />
      )}

      {loanFormMode && (
        <LoanForm
          open
          memberId={id}
          memberName={m.name}
          suggestedPrincipal={loanFormMode === 'relend' ? relendAmount : null}
          onClose={() => setLoanFormMode(null)}
          onSubmit={async (values) => {
            const loanId = await createLoan({ memberId: id, ...values });
            navigate(`/app/loans/${loanId}`);
          }}
        />
      )}

      <Modal
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title={`Delete ${m.name}?`}
        size="sm"
        footer={
          <>
            <button
              type="button"
              className="btn btn-outline"
              onClick={() => setConfirmDelete(false)}
            >
              Keep member
            </button>
            <button
              type="button"
              className="btn btn-danger"
              onClick={async () => {
                try {
                  await deleteMember(id);
                  navigate('/app/members');
                } catch (err) {
                  setDeleteError(err.message);
                }
              }}
            >
              Delete
            </button>
          </>
        }
      >
        <p className="text-sm">This cannot be undone.</p>
        {deleteError && (
          <p role="alert" className="mt-3 rounded-xl bg-red-soft px-4 py-3 text-sm">
            {deleteError}
          </p>
        )}
      </Modal>
    </div>
  );
}
