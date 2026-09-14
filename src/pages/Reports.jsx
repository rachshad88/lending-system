import { useMemo, useState } from 'react';
import PortfolioAtRisk from '../components/PortfolioAtRisk';
import { ErrorNote, Icon, SectionCard, Spinner } from '../components/ui';
import { useAsync } from '../lib/useAsync';
import {
  getIncomeSeries,
  getPeriodStats,
  reportLoans,
  reportMembers,
  reportPayments,
} from '../lib/api';
import { exportReportToExcel, exportReportToPdf } from '../lib/exporters';
import {
  addMonths,
  count as fmtCount,
  endOfMonth,
  formatDate,
  peso,
  plainAmount,
  startOfMonth,
  todayISO,
} from '../lib/format';

const REPORTS = [
  {
    id: 'income',
    label: 'Income summary',
    description: 'Daily collections and income for the period, with totals.',
    icon: 'trendUp',
  },
  {
    id: 'payments',
    label: 'Payments ledger',
    description: 'Every payment recorded, split into principal, interest and penalty.',
    icon: 'peso',
  },
  {
    id: 'loans',
    label: 'Loan book',
    description: 'Loans released in the period with balances and status.',
    icon: 'loans',
  },
  {
    id: 'members',
    label: 'Member directory',
    description: 'All member details on file. Ignores the date range.',
    icon: 'members',
  },
];

const STATUS_LABELS = {
  active: 'Active',
  completed: 'Fully paid',
  written_off: 'Written off',
};

export default function Reports() {
  const today = useMemo(() => todayISO(), []);
  const [reportId, setReportId] = useState('income');
  const [from, setFrom] = useState(() => startOfMonth(today));
  const [to, setTo] = useState(today);
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState(null);

  const stats = useAsync(() => getPeriodStats(from, to), [from, to]);

  const preset = (kind) => {
    if (kind === 'this-month') {
      setFrom(startOfMonth(today));
      setTo(today);
    } else if (kind === 'last-month') {
      const start = addMonths(startOfMonth(today), -1);
      setFrom(start);
      setTo(endOfMonth(start));
    } else if (kind === 'this-year') {
      setFrom(`${today.slice(0, 4)}-01-01`);
      setTo(today);
    } else {
      setFrom(today);
      setTo(today);
    }
  };

  /** Builds the report payload shared by both export formats. */
  const buildReport = async () => {
    const rangeLabel = `${formatDate(from)} – ${formatDate(to)}`;
    const s = stats.data ?? {};

    if (reportId === 'income') {
      const series = await getIncomeSeries(from, to, 'day');
      return {
        title: 'Income summary',
        subtitle: rangeLabel,
        filenameBase: 'drl-income-summary',
        summary: [
          ['Total collected', plainAmount(s.collected)],
          ['Income earned (interest + penalty)', plainAmount(s.income)],
          ['Principal recovered', plainAmount(s.principal_collected)],
          ['Scheduled to collect', plainAmount(s.scheduled_due)],
          ['Not collected', plainAmount(s.unpaid)],
          ['Collection rate', s.collection_rate === null ? 'n/a' : `${s.collection_rate}%`],
          ['Payments recorded', fmtCount(s.payments_count)],
          ['New loans released', `${fmtCount(s.new_loans)} (${plainAmount(s.new_loans_principal)})`],
          ['Loans fully paid', fmtCount(s.finished_loans)],
          ['New members', fmtCount(s.new_members)],
          ['Written off', `${fmtCount(s.write_offs)} (${plainAmount(s.write_off_loss)})`],
        ],
        columns: [
          { header: 'Date', key: 'bucket', width: 14 },
          { header: 'Collected (PHP)', key: 'collected', kind: 'money', width: 18 },
          { header: 'Income (PHP)', key: 'income', kind: 'money', width: 18 },
          { header: 'Payments', key: 'payments', kind: 'number', width: 12 },
        ],
        rows: series,
      };
    }

    if (reportId === 'payments') {
      const rows = await reportPayments({ from, to });
      return {
        title: 'Payments ledger',
        subtitle: rangeLabel,
        filenameBase: 'drl-payments',
        summary: [
          ['Payments recorded', fmtCount(rows.length)],
          ['Total collected', plainAmount(s.collected)],
          ['Income earned', plainAmount(s.income)],
          ['Principal recovered', plainAmount(s.principal_collected)],
        ],
        columns: [
          { header: 'Date', key: 'payment_date', width: 13 },
          { header: 'Member', key: 'member', width: 26 },
          { header: 'TODA', key: 'toda', width: 20 },
          { header: 'Amount (PHP)', key: 'amount', kind: 'money', width: 15 },
          { header: 'Principal (PHP)', key: 'principal_portion', kind: 'money', width: 15 },
          { header: 'Interest (PHP)', key: 'interest_portion', kind: 'money', width: 15 },
          { header: 'Penalty (PHP)', key: 'penalty_portion', kind: 'money', width: 15 },
          { header: 'Note', key: 'note', width: 24 },
        ],
        rows: rows.map((row) => ({
          ...row,
          member: row.members?.name ?? '—',
          toda: row.members?.toda ?? '',
        })),
      };
    }

    if (reportId === 'loans') {
      const rows = await reportLoans({ from, to });
      return {
        title: 'Loan book',
        subtitle: `Released ${rangeLabel}`,
        filenameBase: 'drl-loan-book',
        summary: [
          ['Loans released', fmtCount(rows.length)],
          ['Principal released', plainAmount(rows.reduce((a, r) => a + Number(r.principal), 0))],
          ['Collected to date', plainAmount(rows.reduce((a, r) => a + Number(r.paid_total), 0))],
          ['Balance outstanding', plainAmount(rows.reduce((a, r) => a + Number(r.balance), 0))],
        ],
        columns: [
          { header: 'Released', key: 'start_date', width: 13 },
          { header: 'Member', key: 'member_name', width: 26 },
          { header: 'Principal (PHP)', key: 'principal', kind: 'money', width: 15 },
          { header: 'Total payable (PHP)', key: 'total_obligation', kind: 'money', width: 17 },
          { header: 'Paid (PHP)', key: 'paid_total', kind: 'money', width: 15 },
          { header: 'Balance (PHP)', key: 'balance', kind: 'money', width: 15 },
          { header: 'Behind (PHP)', key: 'arrears', kind: 'money', width: 14 },
          { header: 'Due date', key: 'maturity_date', width: 13 },
          { header: 'Status', key: 'statusLabel', width: 14 },
        ],
        rows: rows.map((row) => ({
          ...row,
          statusLabel: row.is_overdue ? 'Overdue' : (STATUS_LABELS[row.status] ?? row.status),
        })),
      };
    }

    const rows = await reportMembers();
    return {
      title: 'Member directory',
      subtitle: `${rows.length} members on file`,
      filenameBase: 'drl-members',
      summary: [['Members on file', fmtCount(rows.length)]],
      columns: [
        { header: 'Name', key: 'name', width: 26 },
        { header: 'Contact', key: 'contact_number', width: 16 },
        { header: 'TODA', key: 'toda', width: 20 },
        { header: 'Vehicle', key: 'vehicle_number', width: 14 },
        { header: 'Collateral', key: 'collateral', width: 20 },
        { header: 'Spouse', key: 'spouse_name', width: 20 },
        { header: 'Referred by', key: 'referred_by', width: 20 },
        { header: 'Address', key: 'address', width: 30 },
      ],
      rows,
    };
  };

  const run = async (format) => {
    setBusy(format);
    setError(null);
    try {
      const report = await buildReport();
      if (!report.rows.length) {
        setError('There is nothing to export for this selection.');
        return;
      }
      if (format === 'pdf') await exportReportToPdf(report);
      else await exportReportToExcel(report);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(null);
    }
  };

  const s = stats.data ?? {};
  const needsRange = reportId !== 'members';

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-extrabold tracking-tight sm:text-[1.75rem]">Reports</h1>
        <p className="text-muted">
          Export for bookkeeping, or keep a copy as your own backup. PDF and Excel contain the same
          figures shown below.
        </p>
      </header>

      <PortfolioAtRisk />

      <SectionCard title="1. Pick a report" bodyClass="grid gap-3 p-4 sm:grid-cols-2 sm:p-5">
        {REPORTS.map((report) => (
          <button
            key={report.id}
            type="button"
            onClick={() => setReportId(report.id)}
            aria-pressed={reportId === report.id}
            className={`flex items-start gap-3 rounded-xl border p-4 text-left transition-colors ${
              reportId === report.id
                ? 'border-brand bg-brand-soft'
                : 'border-line bg-surface hover:border-[#c6ccdb]'
            }`}
          >
            <span
              className={`grid h-10 w-10 shrink-0 place-items-center rounded-[10px] ${
                reportId === report.id ? 'bg-brand text-white' : 'bg-canvas text-muted'
              }`}
            >
              <Icon name={report.icon} size={19} />
            </span>
            <span>
              <span className="block font-bold">{report.label}</span>
              <span className="block text-sm text-muted">{report.description}</span>
            </span>
          </button>
        ))}
      </SectionCard>

      <SectionCard
        title="2. Choose the period"
        subtitle={needsRange ? undefined : 'The member directory covers everyone, regardless of date.'}
        bodyClass="p-4 sm:p-5"
      >
        <div className={needsRange ? '' : 'pointer-events-none opacity-50'}>
          <div className="mb-4 flex flex-wrap gap-2">
            {[
              ['today', 'Today'],
              ['this-month', 'This month'],
              ['last-month', 'Last month'],
              ['this-year', 'This year'],
            ].map(([kind, label]) => (
              <button
                key={kind}
                type="button"
                className="pill pill-btn pill-grey min-h-[34px] px-3 transition-colors hover:bg-[#e6e9f1]"
                onClick={() => preset(kind)}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="rep-from">
                From
              </label>
              <input
                id="rep-from"
                className="input"
                type="date"
                value={from}
                max={to}
                onChange={(event) => setFrom(event.target.value)}
              />
            </div>
            <div>
              <label className="label" htmlFor="rep-to">
                To
              </label>
              <input
                id="rep-to"
                className="input"
                type="date"
                value={to}
                min={from}
                max={today}
                onChange={(event) => setTo(event.target.value)}
              />
            </div>
          </div>
        </div>
      </SectionCard>

      {needsRange && (
        <SectionCard
          title="Figures for this period"
          subtitle={`${formatDate(from)} – ${formatDate(to)}`}
          bodyClass="grid grid-cols-2 divide-x divide-y divide-[#eef0f6] sm:grid-cols-4 sm:divide-y-0"
        >
          {[
            ['Collected', peso(s.collected), 'text-green'],
            ['Income earned', peso(s.income), 'text-teal'],
            ['Not collected', peso(s.unpaid), 'text-red'],
            ['Payments', fmtCount(s.payments_count), 'text-ink'],
          ].map(([label, value, tone]) => (
            <div key={label} className="px-4 py-4">
              <p className="text-xs font-bold uppercase tracking-wide text-faint">{label}</p>
              <p className={`tnum mt-1 text-lg font-extrabold sm:text-xl ${tone}`}>
                {stats.loading ? '—' : value}
              </p>
            </div>
          ))}
        </SectionCard>
      )}

      <ErrorNote error={error ?? stats.error} />

      <SectionCard title="3. Download" bodyClass="flex flex-col gap-3 p-4 sm:flex-row sm:p-5">
        <button
          type="button"
          className="btn btn-primary flex-1"
          onClick={() => run('pdf')}
          disabled={Boolean(busy)}
        >
          {busy === 'pdf' ? (
            <Spinner size={18} label="Building PDF" />
          ) : (
            <>
              <Icon name="download" size={18} />
              Download PDF
            </>
          )}
        </button>
        <button
          type="button"
          className="btn btn-success flex-1"
          onClick={() => run('excel')}
          disabled={Boolean(busy)}
        >
          {busy === 'excel' ? (
            <Spinner size={18} label="Building Excel file" />
          ) : (
            <>
              <Icon name="download" size={18} />
              Download Excel
            </>
          )}
        </button>
      </SectionCard>
    </div>
  );
}
