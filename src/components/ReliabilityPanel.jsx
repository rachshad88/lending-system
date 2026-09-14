import { Icon, SectionCard } from './ui';
import { peso } from '../lib/format';
import { GRADE_LABELS, GRADE_PILLS } from '../lib/risk';

function Figure({ label, value, hint }) {
  return (
    <div className="px-4 py-3 sm:px-5">
      <p className="text-xs font-bold uppercase tracking-wide text-faint">{label}</p>
      <p className="tnum mt-0.5 font-bold">{value}</p>
      {hint && <p className="text-xs text-muted">{hint}</p>}
    </div>
  );
}

/**
 * Decision support for the moment a member asks to borrow again — the most
 * frequent decision in a book where members cycle continuously. The grade is
 * only the headline; the figures under it are what the call is actually made on.
 *
 * Fetching lives in the parent (MemberDetail) so the same track record backs
 * both this panel and the "Re-lend" button without a second round trip.
 */
export default function ReliabilityPanel({ facts, loading, error, onRetry, verdict, ceiling, maxExposure }) {
  if (loading) {
    return (
      <SectionCard title="Track record" bodyClass="p-4 sm:p-5">
        <div className="skeleton h-24" />
      </SectionCard>
    );
  }

  if (error) {
    return (
      <SectionCard title="Track record" bodyClass="p-4 sm:p-5">
        <p className="text-sm text-muted">
          Track record needs the risk-signals migration (`0004_risk_signals.sql`) to be run on the
          database first.
        </p>
        <button type="button" className="btn btn-sm btn-outline mt-3" onClick={onRetry}>
          Try again
        </button>
      </SectionCard>
    );
  }

  if (!verdict) return null;

  const avgDays = Number(facts.avg_days_to_complete) || 0;
  const avgTerm = Number(facts.avg_term_days) || 0;
  const completed = Number(facts.loans_completed) || 0;

  return (
    <SectionCard
      title="Track record"
      action={<span className={`pill ${GRADE_PILLS[verdict.grade]}`}>{GRADE_LABELS[verdict.grade]}</span>}
    >
      <div className="border-b border-line px-4 py-3 sm:px-5">
        <ul className="space-y-1 text-sm text-muted">
          {verdict.reasons.map((reason) => (
            <li key={reason} className="flex gap-2">
              <Icon name="check" size={15} className="mt-0.5 shrink-0 text-faint" />
              {reason}
            </li>
          ))}
        </ul>
      </div>

      <div className="grid grid-cols-2 divide-x divide-y divide-[#eef0f6] sm:grid-cols-3 sm:divide-y-0">
        <Figure label="Loans finished" value={completed} hint={`${facts.loans_total} taken in total`} />
        <Figure
          label="Days to repay"
          value={completed > 0 && avgDays ? `${avgDays} avg` : '—'}
          hint={avgTerm ? `on a ${avgTerm}-day term` : undefined}
        />
        <Figure
          label="Longest silence"
          value={`${facts.longest_gap_days} days`}
          hint="worst gap between payments"
        />
        <Figure
          label="Penalties"
          value={facts.penalties_incurred}
          hint={Number(facts.loans_written_off) > 0 ? `${facts.loans_written_off} written off` : 'never written off'}
        />
        <Figure label="Owes right now" value={peso(facts.current_exposure)} hint={`${facts.loans_active} active`} />
        <Figure
          label="Biggest repaid"
          value={peso(facts.largest_completed_principal)}
          hint="largest loan seen through"
        />
      </div>

      <div className="border-t border-line px-4 py-3.5 sm:px-5">
        {ceiling === null ? (
          <p className="text-sm text-muted">
            No finished loans yet, so there is nothing to base a ceiling on. Start small.
          </p>
        ) : ceiling <= 0 ? (
          <p className="text-sm font-semibold text-red">
            Not recommended for another loan
            {maxExposure != null && Number(facts.current_exposure) >= Number(maxExposure)
              ? `: already at the ${peso(maxExposure)} exposure limit.`
              : ' on this track record.'}
          </p>
        ) : (
          <p className="text-sm">
            <span className="font-semibold">Suggested ceiling: </span>
            <span className="tnum font-extrabold text-brand">{peso(ceiling)}</span>
            <span className="text-muted">
              {' '}
              based on the {peso(facts.largest_completed_principal)} they have already repaid
              {maxExposure != null && `, within the ${peso(maxExposure)} limit per member`}.
            </span>
          </p>
        )}
      </div>
    </SectionCard>
  );
}
