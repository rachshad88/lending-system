import { Link } from 'react-router-dom';
import { ErrorNote, Icon, SectionCard } from './ui';
import { useAsync } from '../lib/useAsync';
import { getSettings, listGoneQuiet } from '../lib/api';
import { formatDate, peso } from '../lib/format';
import { quietDays, quietTone } from '../lib/risk';

const PILL = { red: 'pill-red', amber: 'pill-amber', muted: 'pill-grey' };

function telHref(number) {
  return `tel:${String(number).replace(/[^\d+]/g, '')}`;
}

/**
 * Who to chase today, quietest first. A count of unpaid members tells you the
 * size of the problem; this tells you whose name to call, which is the part
 * that actually gets money back in.
 */
export default function GoneQuiet() {
  const settings = useAsync(getSettings, []);
  const threshold = Number(settings.data?.gone_quiet_days) || 3;

  const list = useAsync(() => listGoneQuiet({ minDays: threshold, limit: 8 }), [threshold]);
  const rows = list.data ?? [];

  return (
    <SectionCard
      title="Gone quiet"
      subtitle={`Active loans with nothing collected for ${threshold}+ days, longest silence first`}
    >
      <div className="px-4 pt-4 sm:px-5">
        <ErrorNote error={list.error} onRetry={list.reload} />
      </div>

      {list.loading ? (
        <div className="space-y-2 p-4 sm:p-5">
          <div className="skeleton h-14" />
          <div className="skeleton h-14" />
          <div className="skeleton h-14" />
        </div>
      ) : rows.length === 0 ? (
        <div className="flex flex-col items-center gap-2 px-6 py-10 text-center">
          <span className="grid h-11 w-11 place-items-center rounded-full bg-green-soft text-green">
            <Icon name="check" size={21} strokeWidth={2.6} />
          </span>
          <p className="font-semibold">Nobody has gone quiet</p>
          <p className="max-w-sm text-sm text-muted">
            Every active loan has had a collection within the last {threshold} days.
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-[#eef0f6]">
          {rows.map((loan) => {
            const days = quietDays(loan);
            const tone = quietTone(days, threshold);
            return (
              <li
                key={loan.loan_id}
                className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 sm:px-5"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link
                      to={`/app/loans/${loan.loan_id}`}
                      className="truncate font-bold hover:text-brand"
                    >
                      {loan.member_name}
                    </Link>
                    <span className={`pill ${PILL[tone]}`}>{days} days quiet</span>
                    {loan.is_overdue && <span className="pill pill-red">Past due</span>}
                  </div>
                  <p className="mt-0.5 text-sm text-muted">
                    {loan.last_payment_date
                      ? `Last paid ${formatDate(loan.last_payment_date)}`
                      : `Never paid, released ${formatDate(loan.start_date)}`}
                    {loan.toda ? ` · ${loan.toda}` : ''}
                  </p>
                </div>

                <div className="text-right">
                  <p className="text-xs font-semibold text-faint">Balance</p>
                  <p className="tnum font-extrabold">{peso(loan.balance)}</p>
                </div>

                {loan.contact_number ? (
                  <a
                    href={telHref(loan.contact_number)}
                    className="btn btn-sm btn-outline"
                    aria-label={`Call ${loan.member_name}`}
                  >
                    <Icon name="members" size={15} />
                    Call
                  </a>
                ) : (
                  <span className="pill pill-grey">No number</span>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </SectionCard>
  );
}
