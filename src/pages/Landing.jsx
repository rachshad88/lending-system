import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Icon } from '../components/ui';
import { peso, pesoWhole } from '../lib/format';

// Swap these two for your own name and site — this is the credit line in the footer.
const CRAFTED_BY = 'Your Name';
const CRAFTED_BY_URL = '#contact';

const INTEREST_RATE = 0.2;
const DEFAULT_TERM = 40;

const AMOUNT_PRESETS = [2000, 3000, 5000, 8000, 10000];

const STEPS = [
  {
    icon: 'members',
    tone: 'brand',
    title: 'Apply in person',
    body: 'Drop by the office with a valid ID and your TODA details. No long forms, no waiting list.',
  },
  {
    icon: 'check',
    tone: 'green',
    title: 'Approved the same day',
    body: 'We review on the spot. Approved applications are released in cash within the day.',
  },
  {
    icon: 'calendar',
    tone: 'amber',
    title: 'Pay a fixed amount daily',
    body: 'One small, predictable payment every day for 40 days. Your collector comes to you.',
  },
];

const REQUIREMENTS = [
  'Any valid government ID',
  'Active TODA or association membership',
  'Proof of address in the barangay',
  "Spouse or co-maker's name",
  'Collateral (OR/CR or equivalent)',
  'Referral from a current member',
];

const TONE_CLASSES = {
  brand: 'bg-brand-soft text-brand',
  green: 'bg-green-soft text-green',
  amber: 'bg-amber-soft text-amber',
  teal: 'bg-teal-soft text-teal',
};

function Calculator() {
  const [amount, setAmount] = useState(5000);
  const [term, setTerm] = useState(DEFAULT_TERM);

  const figures = useMemo(() => {
    const interest = amount * INTEREST_RATE;
    const total = amount + interest;
    return { interest, total, daily: total / term };
  }, [amount, term]);

  return (
    <div className="card w-full p-5 sm:p-6">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-base font-bold">Estimate your daily payment</h2>
        <span className="pill pill-blue">20% flat</span>
      </div>

      <label className="label" htmlFor="calc-amount">
        How much do you need?
      </label>
      <div className="mb-3 flex items-baseline gap-2">
        <span className="text-2xl font-extrabold text-brand">₱</span>
        <input
          id="calc-amount"
          type="number"
          min="500"
          max="50000"
          step="500"
          value={amount}
          onChange={(event) => setAmount(Math.max(0, Number(event.target.value) || 0))}
          className="tnum w-full border-0 border-b-2 border-line bg-transparent pb-1 text-3xl font-extrabold tracking-tight outline-none focus:border-brand"
        />
      </div>

      <div className="mb-5 flex flex-wrap gap-2">
        {AMOUNT_PRESETS.map((preset) => (
          <button
            key={preset}
            type="button"
            onClick={() => setAmount(preset)}
            className={`pill min-h-[34px] px-3 transition-colors ${
              amount === preset ? 'pill-blue' : 'pill-grey hover:bg-[#e6e9f1]'
            }`}
          >
            {pesoWhole(preset)}
          </button>
        ))}
      </div>

      <label className="label" htmlFor="calc-term">
        Term: <span className="font-bold text-ink">{term} days</span>
      </label>
      <input
        id="calc-term"
        type="range"
        min="20"
        max="60"
        step="10"
        value={term}
        onChange={(event) => setTerm(Number(event.target.value))}
        className="mb-5 w-full accent-[#0073ea]"
      />

      <dl className="grid gap-3 rounded-xl bg-canvas p-4 sm:grid-cols-3">
        <div>
          <dt className="text-xs font-semibold uppercase tracking-wide text-faint">Pay daily</dt>
          <dd className="tnum text-xl font-extrabold text-green">{peso(figures.daily)}</dd>
        </div>
        <div>
          <dt className="text-xs font-semibold uppercase tracking-wide text-faint">Interest</dt>
          <dd className="tnum text-xl font-extrabold">{peso(figures.interest)}</dd>
        </div>
        <div>
          <dt className="text-xs font-semibold uppercase tracking-wide text-faint">Total payable</dt>
          <dd className="tnum text-xl font-extrabold">{peso(figures.total)}</dd>
        </div>
      </dl>

      <p className="mt-3 text-xs leading-relaxed text-muted">
        Estimate only. A one-time 10% charge applies to any balance left unpaid after the due date.
        Final terms are confirmed at the office.
      </p>
    </div>
  );
}

export default function Landing() {
  return (
    <div className="min-h-screen bg-surface">
      <header className="sticky top-0 z-40 border-b border-line bg-surface/90 backdrop-blur">
        <div className="mx-auto flex max-w-[1180px] items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <a href="#top" className="flex items-center gap-2.5">
            <span className="grid h-10 w-10 place-items-center rounded-[11px] bg-brand text-lg font-extrabold text-white">
              D
            </span>
            <span className="leading-tight">
              <span className="block text-sm font-extrabold tracking-tight sm:text-base">
                DRL Lending
              </span>
              <span className="block text-[10px] font-bold tracking-[0.18em] text-faint">
                COOPERATIVE
              </span>
            </span>
          </a>

          <nav className="hidden items-center gap-7 text-sm font-semibold text-muted md:flex">
            <a href="#how" className="transition-colors hover:text-ink">
              How it works
            </a>
            <a href="#rates" className="transition-colors hover:text-ink">
              Rates
            </a>
            <a href="#requirements" className="transition-colors hover:text-ink">
              Requirements
            </a>
            <a href="#contact" className="transition-colors hover:text-ink">
              Contact
            </a>
          </nav>

          <Link to="/login" className="btn btn-primary btn-sm">
            Admin login
          </Link>
        </div>
      </header>

      {/* Hero */}
      <section
        id="top"
        className="relative overflow-hidden border-b border-line"
        style={{
          background:
            'radial-gradient(1100px 500px at 12% -8%, #e6f1fe 0%, transparent 60%),' +
            'radial-gradient(800px 420px at 92% 4%, #e1f7ee 0%, transparent 58%),' +
            'radial-gradient(700px 380px at 60% 100%, #fef5e6 0%, transparent 60%)',
        }}
      >
        <div className="mx-auto grid max-w-[1180px] items-center gap-10 px-4 py-14 sm:px-6 sm:py-20 lg:grid-cols-[1.05fr_0.95fr] lg:gap-14">
          <div>
            <span className="pill pill-green mb-5">
              <Icon name="check" size={13} />
              Serving drivers and small earners since 2019
            </span>

            <h1 className="text-[clamp(2.1rem,6vw,3.6rem)] font-extrabold leading-[1.05] tracking-[-0.03em]">
              Small loans,
              <br />
              <span className="text-brand">released the same day.</span>
            </h1>

            <p className="mt-5 max-w-xl text-lg leading-relaxed text-muted">
              Serbisyong mabilis, patas, at malinaw. Borrow what you need today and pay one fixed
              amount every day — no hidden charges, no surprises at the end.
            </p>

            <div className="mt-7 flex flex-wrap gap-3">
              <a href="#contact" className="btn btn-primary">
                Talk to us today
                <Icon name="chevronRight" size={17} />
              </a>
              <a href="#how" className="btn btn-outline">
                See how it works
              </a>
            </div>

            <dl className="mt-10 grid max-w-lg grid-cols-3 gap-4 border-t border-line/80 pt-6">
              {[
                { value: '40 days', label: 'Standard term' },
                { value: 'Same day', label: 'Cash release' },
                { value: '20% flat', label: 'No compounding' },
              ].map((item) => (
                <div key={item.label}>
                  <dt className="text-xl font-extrabold tracking-tight sm:text-2xl">
                    {item.value}
                  </dt>
                  <dd className="text-xs font-semibold text-faint sm:text-sm">{item.label}</dd>
                </div>
              ))}
            </dl>
          </div>

          <Calculator />
        </div>
      </section>

      {/* How it works */}
      <section id="how" className="mx-auto max-w-[1180px] px-4 py-14 sm:px-6 sm:py-20">
        <div className="mb-10 max-w-2xl">
          <span className="pill pill-blue mb-3">How it works</span>
          <h2 className="text-[clamp(1.6rem,4vw,2.4rem)] font-extrabold leading-tight tracking-[-0.025em]">
            Three steps, one visit.
          </h2>
          <p className="mt-3 text-lg text-muted">
            We keep the process short because your time on the road is money. Most members walk out
            with cash the same afternoon.
          </p>
        </div>

        <ol className="grid gap-5 md:grid-cols-3">
          {STEPS.map((step, index) => (
            <li key={step.title} className="card p-6">
              <div className="mb-4 flex items-center justify-between">
                <span
                  className={`grid h-11 w-11 place-items-center rounded-xl ${TONE_CLASSES[step.tone]}`}
                >
                  <Icon name={step.icon} size={21} />
                </span>
                <span className="tnum text-3xl font-extrabold text-line">0{index + 1}</span>
              </div>
              <h3 className="text-lg font-bold">{step.title}</h3>
              <p className="mt-2 text-muted">{step.body}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* Rates */}
      <section id="rates" className="border-y border-line bg-canvas">
        <div className="mx-auto max-w-[1180px] px-4 py-14 sm:px-6 sm:py-20">
          <div className="mb-8 max-w-2xl">
            <span className="pill pill-amber mb-3">Rates</span>
            <h2 className="text-[clamp(1.6rem,4vw,2.4rem)] font-extrabold leading-tight tracking-[-0.025em]">
              What you pay is printed on day one.
            </h2>
            <p className="mt-3 text-lg text-muted">
              A flat 20% on the amount you borrow, divided evenly across your term. The daily
              amount never changes.
            </p>
          </div>

          <div className="card overflow-hidden">
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    <th>Loan amount</th>
                    <th className="num">Interest (20%)</th>
                    <th className="num">Total payable</th>
                    <th className="num">Daily for 40 days</th>
                  </tr>
                </thead>
                <tbody>
                  {[2000, 3000, 5000, 8000, 10000].map((principal) => {
                    const interest = principal * INTEREST_RATE;
                    const total = principal + interest;
                    return (
                      <tr key={principal}>
                        <td className="font-bold">{pesoWhole(principal)}</td>
                        <td className="num tnum text-muted">{pesoWhole(interest)}</td>
                        <td className="num tnum font-semibold">{pesoWhole(total)}</td>
                        <td className="num tnum font-extrabold text-green">{peso(total / 40)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <p className="mt-4 flex items-start gap-2 text-sm text-muted">
            <Icon name="risk" size={16} className="mt-0.5 shrink-0 text-amber" />
            If a balance is still open after the due date, a one-time 10% charge is added to the
            remaining balance. It is charged once — never again on the same loan.
          </p>
        </div>
      </section>

      {/* Requirements */}
      <section id="requirements" className="mx-auto max-w-[1180px] px-4 py-14 sm:px-6 sm:py-20">
        <div className="grid gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
          <div>
            <span className="pill pill-teal mb-3">Requirements</span>
            <h2 className="text-[clamp(1.6rem,4vw,2.4rem)] font-extrabold leading-tight tracking-[-0.025em]">
              Bring these and we can start.
            </h2>
            <p className="mt-3 text-lg text-muted">
              We lend to people we can reach and verify. If something on this list is missing, talk
              to us anyway — a referral from a current member goes a long way.
            </p>
          </div>

          <ul className="grid gap-3 sm:grid-cols-2">
            {REQUIREMENTS.map((item) => (
              <li key={item} className="card flex items-center gap-3 p-4">
                <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-green-soft text-green">
                  <Icon name="check" size={15} strokeWidth={2.6} />
                </span>
                <span className="font-semibold">{item}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Contact */}
      <section id="contact" className="border-t border-line bg-navy text-white">
        <div className="mx-auto grid max-w-[1180px] gap-8 px-4 py-14 sm:px-6 sm:py-20 lg:grid-cols-2 lg:items-center">
          <div>
            <h2 className="text-[clamp(1.7rem,4vw,2.6rem)] font-extrabold leading-tight tracking-[-0.025em] text-white">
              Come see us. Bring your questions.
            </h2>
            <p className="mt-4 max-w-lg text-lg text-white/70">
              We are open six days a week. Ask for a computation before you decide — we will show
              you the exact daily amount and the total you will pay.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            {[
              { icon: 'members', label: 'Office', value: 'Brgy. Poblacion, Main St.' },
              { icon: 'clock', label: 'Open', value: 'Mon–Sat, 8:00am – 5:00pm' },
              { icon: 'peso', label: 'Loan range', value: '₱1,500 – ₱20,000' },
              { icon: 'calendar', label: 'Collection', value: 'Daily, at your terminal' },
            ].map((item) => (
              <div key={item.label} className="rounded-xl border border-white/15 bg-white/5 p-4">
                <span className="mb-2 grid h-9 w-9 place-items-center rounded-[10px] bg-white/10 text-white">
                  <Icon name={item.icon} size={18} />
                </span>
                <p className="text-xs font-bold uppercase tracking-wider text-white/50">
                  {item.label}
                </p>
                <p className="font-semibold text-white">{item.value}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <footer className="bg-navy text-white/60">
        <div className="mx-auto flex max-w-[1180px] flex-col gap-4 border-t border-white/10 px-4 py-7 text-sm sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <p>© {new Date().getFullYear()} DRL Lending Cooperative. All rights reserved.</p>
          <p>
            Crafted by{' '}
            <a
              href={CRAFTED_BY_URL}
              className="font-semibold text-white underline decoration-white/30 underline-offset-4 transition-colors hover:decoration-white"
            >
              {CRAFTED_BY}
            </a>
          </p>
        </div>
      </footer>
    </div>
  );
}
