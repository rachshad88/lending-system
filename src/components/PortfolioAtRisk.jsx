import { SectionCard } from './ui';
import { useAsync } from '../lib/useAsync';
import { getPortfolioAtRisk } from '../lib/api';
import { count as fmtCount, peso } from '../lib/format';

/** Under 5% at 30 days is the usual microfinance benchmark. */
function rateTone(rate) {
  if (rate >= 10) return 'text-red';
  if (rate >= 5) return 'text-amber';
  return 'text-green';
}

function pct(amount, total) {
  const a = Number(amount) || 0;
  const t = Number(total) || 0;
  return t > 0 ? (a / t) * 100 : 0;
}

function Band({ label, amount, loans, total, hint }) {
  const rate = pct(amount, total);
  return (
    <div className="px-4 py-4 sm:px-5">
      <p className="text-xs font-bold uppercase tracking-wide text-faint">{label}</p>
      <p className={`tnum mt-1 text-xl font-extrabold sm:text-2xl ${rateTone(rate)}`}>
        {rate.toFixed(1)}%
      </p>
      <p className="tnum text-sm text-muted">
        {peso(amount)} · {fmtCount(loans)} loan(s)
      </p>
      <p className="mt-0.5 text-xs text-faint">{hint}</p>
    </div>
  );
}

/**
 * Portfolio at Risk: the share of money on the street that has gone quiet, by
 * value. The figure a bank or investor asks for first, and the one that tells
 * you whether growth is actually safe.
 */
export default function PortfolioAtRisk() {
  const par = useAsync(getPortfolioAtRisk, []);

  if (par.loading) {
    return (
      <SectionCard title="Portfolio at risk" bodyClass="p-4 sm:p-5">
        <div className="skeleton h-20" />
      </SectionCard>
    );
  }

  if (par.error || !par.data) {
    return (
      <SectionCard title="Portfolio at risk" bodyClass="p-4 sm:p-5">
        <p className="text-sm text-muted">
          Needs the risk-signals migration (`0004_risk_signals.sql`) to be run on the database
          first.
        </p>
        <button type="button" className="btn btn-sm btn-outline mt-3" onClick={par.reload}>
          Try again
        </button>
      </SectionCard>
    );
  }

  const d = par.data;

  return (
    <SectionCard
      title="Portfolio at risk"
      subtitle="Share of the money still out that has stopped being collected"
    >
      <div className="grid grid-cols-1 divide-x divide-y divide-[#eef0f6] sm:grid-cols-3 sm:divide-y-0">
        <div className="px-4 py-4 sm:px-5">
          <p className="text-xs font-bold uppercase tracking-wide text-faint">On the street</p>
          <p className="tnum mt-1 text-xl font-extrabold sm:text-2xl">
            {peso(d.total_outstanding)}
          </p>
          <p className="tnum text-sm text-muted">
            {fmtCount(d.loans_outstanding)} active loan(s)
          </p>
          <p className="mt-0.5 text-xs text-faint">total still to collect</p>
        </div>
        <Band
          label="PAR 7"
          amount={d.par7_amount}
          loans={d.par7_loans}
          total={d.total_outstanding}
          hint="quiet for 7+ days"
        />
        <Band
          label="PAR 30"
          amount={d.par30_amount}
          loans={d.par30_loans}
          total={d.total_outstanding}
          hint="quiet for 30+ days"
        />
      </div>

      <p className="border-t border-line px-4 py-3 text-xs leading-relaxed text-muted sm:px-5">
        Counted from the last collection, or from release if nothing was ever collected. A 40-day
        loan that stops paying on day ten is in trouble long before its due date, so this measures
        silence rather than days past maturity. Under 5% at 30 days is the usual benchmark.
      </p>
    </SectionCard>
  );
}
