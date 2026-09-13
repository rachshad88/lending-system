import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Icon } from '../components/ui';
import { peso, pesoWhole } from '../lib/format';

// Swap these two for your own name and site — this is the credit line in the footer.
const CRAFTED_BY = 'Dave Shadrach';
const CRAFTED_BY_URL = 'https://github.com/rachshad88';

const INTEREST_RATE = 0.2;
const DEFAULT_TERM = 40;

const AMOUNT_PRESETS = [2000, 3000, 5000, 8000, 10000];
const RATE_TABLE_AMOUNTS = [2000, 3000, 5000, 8000, 10000];

const STEP_META = [
  { icon: 'members', tone: 'brand' },
  { icon: 'check', tone: 'green' },
  { icon: 'calendar', tone: 'amber' },
];

const TONE_STYLE = {
  brand: { background: 'var(--color-brand-soft)', color: 'var(--color-brand)' },
  green: { background: 'rgb(52 199 89 / 0.16)', color: '#1f8a3a' },
  amber: { background: 'rgb(255 159 10 / 0.16)', color: '#a5620a' },
};

const CONTACT_META = [
  { icon: 'members', key: 'office' },
  { icon: 'clock', key: 'open' },
  { icon: 'peso', key: 'loanRange' },
  { icon: 'calendar', key: 'collection' },
];

const HERO_TAGLINE = 'Serbisyong mabilis, patas, at malinaw.';

const CONTENT = {
  en: {
    nav: { how: 'How it works', rates: 'Rates', requirements: 'Requirements', contact: 'Contact' },
    adminLogin: 'Admin login',
    hero: {
      badge: 'Serving drivers and small earners since 2024',
      titleLine1: 'Small loans,',
      titleLine2: 'released the same day.',
      subhead:
        'Borrow what you need today and pay one fixed amount every day. No hidden charges, no surprises at the end.',
      ctaPrimary: 'Talk to us today',
      ctaSecondary: 'See how it works',
      stats: [
        { value: '40 days', label: 'Standard term' },
        { value: 'Same day', label: 'Cash release' },
        { value: '20% flat', label: 'No compounding' },
      ],
    },
    calculator: {
      title: 'Estimate your daily payment',
      pill: '20% flat',
      amountLabel: 'How much do you need?',
      termLabel: 'Term:',
      days: 'days',
      payDaily: 'Pay daily',
      interest: 'Interest',
      totalPayable: 'Total payable',
      disclaimer:
        'Estimate only. A one-time 10% charge applies to any balance left unpaid after the due date. Final terms are confirmed at the office.',
    },
    how: {
      pill: 'How it works',
      heading: 'Three steps, one visit.',
      body: 'We keep the process short because your time on the road is money. Most members walk out with cash the same afternoon.',
    },
    steps: [
      {
        title: 'Apply in person',
        body: 'Drop by the office with a valid ID and your TODA (Tricycle Operators and Drivers Association) details. No long forms, no waiting list.',
      },
      {
        title: 'Approved the same day',
        body: 'We review on the spot. Approved applications are released in cash within the day.',
      },
      {
        title: 'Pay a fixed amount daily',
        body: 'One small, predictable payment every day for 40 days. Your collector comes to you.',
      },
    ],
    rates: {
      pill: 'Rates',
      heading: 'What you pay is printed on day one.',
      body: 'A flat 20% on the amount you borrow, divided evenly across your term. The daily amount never changes.',
      table: {
        loanAmount: 'Loan amount',
        interest: 'Interest (20%)',
        totalPayable: 'Total payable',
        dailyFor40: 'Daily for 40 days',
      },
      footnote:
        'If a balance is still open after the due date, a one-time 10% charge is added to the remaining balance. It is charged once, never again on the same loan.',
    },
    requirements: {
      pill: 'Requirements',
      heading: 'Bring these and we can start.',
      body: 'We lend to people we can reach and verify. If something on this list is missing, talk to us anyway. A referral from a current member goes a long way.',
      items: [
        'Any valid government ID',
        'Active TODA or association membership',
        'Proof of address in the barangay',
        "Spouse or co-maker's name",
        'Collateral (OR/CR or equivalent)',
        'Referral from a current member',
      ],
    },
    contact: {
      heading: 'Come see us. Bring your questions.',
      body: 'We are open six days a week. Ask for a computation before you decide. We will show you the exact daily amount and the total you will pay.',
      office: { label: 'Office', value: 'Brgy. Poblacion, Main St.' },
      open: { label: 'Open', value: 'Mon–Sat, 8:00am – 5:00pm' },
      loanRange: { label: 'Loan range', value: '₱1,500 – ₱20,000' },
      collection: { label: 'Collection', value: 'Daily, at your terminal' },
    },
    footer: {
      rights: 'All rights reserved.',
      craftedBy: 'Crafted by',
    },
  },
  fil: {
    nav: { how: 'Paano Ito Gumagana', rates: 'Mga Rate', requirements: 'Mga Kailangan', contact: 'Makipag-ugnayan' },
    adminLogin: 'Admin login',
    hero: {
      badge: 'Naglilingkod sa mga drivers at maliliit na kumikita mula 2024',
      titleLine1: 'Maliit na utang,',
      titleLine2: 'inilalabas sa parehong araw.',
      subhead:
        'Manghiram ng kailangan mo ngayon at magbayad ng iisang tiyak na halaga araw-araw. Walang tagong bayad, walang gulat sa huli.',
      ctaPrimary: 'Makipag-usap sa amin ngayon',
      ctaSecondary: 'Tingnan kung paano ito gumagana',
      stats: [
        { value: '40 araw', label: 'Karaniwang termino' },
        { value: 'Parehong araw', label: 'Paglabas ng cash' },
        { value: '20% patag', label: 'Walang tumutubong tubo' },
      ],
    },
    calculator: {
      title: 'Tantyahin ang araw-araw mong babayaran',
      pill: '20% patag',
      amountLabel: 'Magkano ang kailangan mo?',
      termLabel: 'Termino:',
      days: 'araw',
      payDaily: 'Bayad araw-araw',
      interest: 'Tubo',
      totalPayable: 'Kabuuang babayaran',
      disclaimer:
        'Pagtantya lamang. May isang beses na 10% na singil sa anumang balanseng hindi nabayaran pagkatapos ng takdang petsa. Ang huling tuntunin ay kinukumpirma sa opisina.',
    },
    how: {
      pill: 'Paano Ito Gumagana',
      heading: 'Tatlong hakbang, isang pagbisita.',
      body: 'Pinapanatili naming maikli ang proseso dahil ang oras mo sa daan ay pera. Karamihan sa mga miyembro ay umuuwi nang may cash sa parehong hapon.',
    },
    steps: [
      {
        title: 'Mag-apply nang personal',
        body: 'Bumisita sa opisina nang may balidong ID at detalye ng iyong TODA (Tricycle Operators and Drivers Association). Walang mahahabang porma, walang waiting list.',
      },
      {
        title: 'Inaaprubahan sa parehong araw',
        body: 'Sinusuri namin agad. Ang mga inaprubahang aplikasyon ay inilalabas nang cash sa loob ng araw.',
      },
      {
        title: 'Magbayad ng nakapirming halaga araw-araw',
        body: 'Isang maliit at tiyak na bayad araw-araw sa loob ng 40 araw. Pupuntahan ka ng iyong kolektor.',
      },
    ],
    rates: {
      pill: 'Mga Rate',
      heading: 'Malinaw na nakasaad ang babayaran mo sa unang araw.',
      body: 'Isang patag na 20% sa halagang hiniram mo, pantay na hinati sa buong termino. Hindi nagbabago ang araw-araw na halaga.',
      table: {
        loanAmount: 'Halaga ng utang',
        interest: 'Tubo (20%)',
        totalPayable: 'Kabuuang babayaran',
        dailyFor40: 'Araw-araw sa 40 araw',
      },
      footnote:
        'Kung may balanseng natitira pagkatapos ng takdang petsa, may idadagdag na isang beses na 10% na singil sa natitirang balanse. Isang beses lang ito sisingilin, hindi na muli sa parehong utang.',
    },
    requirements: {
      pill: 'Mga Kailangan',
      heading: 'Dalhin ang mga ito at makakapagsimula na tayo.',
      body: 'Nagpapautang kami sa mga taong madali naming maabot at ma-verify. Kung may kulang sa listahang ito, kausapin pa rin kami. Malaking tulong ang referral mula sa kasalukuyang miyembro.',
      items: [
        'Anumang balidong government ID',
        'Aktibong miyembro ng TODA o asosasyon',
        'Patunay ng tirahan sa barangay',
        'Pangalan ng asawa o co-maker',
        'Kolateral (OR/CR o katumbas)',
        'Referral mula sa kasalukuyang miyembro',
      ],
    },
    contact: {
      heading: 'Bisitahin kami. Dalhin ang iyong mga tanong.',
      body: 'Bukas kami anim na araw kada linggo. Humingi ng computation bago ka magdesisyon. Ipapakita namin ang eksaktong araw-araw na halaga at ang kabuuang babayaran mo.',
      office: { label: 'Opisina', value: 'Brgy. Poblacion, Main St.' },
      open: { label: 'Bukas', value: 'Lun–Sab, 8:00am – 5:00pm' },
      loanRange: { label: 'Saklaw ng utang', value: '₱1,500 – ₱20,000' },
      collection: { label: 'Koleksyon', value: 'Araw-araw, sa iyong terminal' },
    },
    footer: {
      rights: 'Nakalaan ang lahat ng karapatan.',
      craftedBy: 'Ginawa ni',
    },
  },
};

/** Reveals its children with a fade-up the first time they scroll into view. */
function Reveal({ children, className = '', delay = 0, as: Tag = 'div' }) {
  const ref = useRef(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.15 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <Tag
      ref={ref}
      className={`reveal ${visible ? 'reveal-visible' : ''} ${className}`}
      style={{ transitionDelay: `${delay}ms` }}
    >
      {children}
    </Tag>
  );
}

/** Slow-drifting aurora blobs behind the hero, with a light cursor parallax. */
function HeroBlobs() {
  const wrapRef = useRef(null);

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return undefined;
    let raf = null;
    const onMove = (event) => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = null;
        const el = wrapRef.current;
        if (!el) return;
        const { innerWidth: w, innerHeight: h } = window;
        const dx = (event.clientX / w - 0.5) * 24;
        const dy = (event.clientY / h - 0.5) * 24;
        el.style.transform = `translate(${dx}px, ${dy}px)`;
      });
    };
    window.addEventListener('mousemove', onMove);
    return () => {
      window.removeEventListener('mousemove', onMove);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <div ref={wrapRef} className="lp-aurora pointer-events-none absolute inset-0">
      <span
        className="blob"
        style={{
          top: '-14%',
          left: '4%',
          width: 420,
          height: 420,
          background: 'radial-gradient(circle, rgb(0 115 234 / 0.5), transparent 70%)',
        }}
      />
      <span
        className="blob"
        style={{
          top: '-4%',
          right: '-4%',
          width: 380,
          height: 380,
          background: 'radial-gradient(circle, rgb(52 199 89 / 0.45), transparent 70%)',
          animationDelay: '-3s',
          animationDuration: '13s',
        }}
      />
      <span
        className="blob"
        style={{
          bottom: '-22%',
          left: '38%',
          width: 400,
          height: 400,
          background: 'radial-gradient(circle, rgb(255 159 10 / 0.4), transparent 70%)',
          animationDelay: '-6s',
          animationDuration: '15s',
        }}
      />
    </div>
  );
}

function Calculator({ t }) {
  const [amount, setAmount] = useState(5000);
  const [term, setTerm] = useState(DEFAULT_TERM);
  const cardRef = useRef(null);

  const figures = useMemo(() => {
    const interest = amount * INTEREST_RATE;
    const total = amount + interest;
    return { interest, total, daily: total / term };
  }, [amount, term]);

  const termFillPct = ((term - 20) / (60 - 20)) * 100;

  const handleTilt = (event) => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const card = cardRef.current;
    if (!card) return;
    const rect = card.getBoundingClientRect();
    const px = (event.clientX - rect.left) / rect.width - 0.5;
    const py = (event.clientY - rect.top) / rect.height - 0.5;
    card.style.transform = `perspective(900px) rotateX(${py * -6}deg) rotateY(${px * 8}deg) translateY(-2px)`;
  };

  const resetTilt = () => {
    const card = cardRef.current;
    if (card) card.style.transform = 'perspective(900px) rotateX(0deg) rotateY(0deg)';
  };

  return (
    <div
      ref={cardRef}
      className="lp-glass lp-tilt w-full p-6 sm:p-7"
      onMouseMove={handleTilt}
      onMouseLeave={resetTilt}
    >
      <div className="mb-5 flex items-center justify-between gap-3">
        <h2 className="text-base font-bold">{t.title}</h2>
        <span className="lp-pill lp-pill-tag">{t.pill}</span>
      </div>

      <label className="mb-2 block text-xs font-semibold text-muted" htmlFor="calc-amount">
        {t.amountLabel}
      </label>
      <div className="mb-4 flex items-baseline gap-2 border-b-2 border-line pb-2.5 transition-colors focus-within:border-brand">
        <span className="text-2xl font-extrabold text-brand">₱</span>
        <input
          id="calc-amount"
          type="number"
          min="500"
          max="50000"
          step="500"
          value={amount}
          onChange={(event) => setAmount(Math.max(0, Number(event.target.value) || 0))}
          className="tnum w-full border-0 bg-transparent text-3xl font-extrabold tracking-tight outline-none sm:text-[34px]"
        />
      </div>

      <div className="mb-6 flex flex-wrap gap-2">
        {AMOUNT_PRESETS.map((preset) => (
          <button
            key={preset}
            type="button"
            onClick={() => setAmount(preset)}
            className={`lp-preset ${amount === preset ? 'is-active' : ''}`}
          >
            {pesoWhole(preset)}
          </button>
        ))}
      </div>

      <label className="mb-2 block text-xs font-semibold text-muted" htmlFor="calc-term">
        {t.termLabel} <span className="font-bold text-ink">{term} {t.days}</span>
      </label>
      <input
        id="calc-term"
        type="range"
        min="20"
        max="60"
        step="10"
        value={term}
        onChange={(event) => setTerm(Number(event.target.value))}
        className="lp-range mb-6"
        style={{
          background: `linear-gradient(to right, var(--color-brand) 0%, var(--color-brand) ${termFillPct}%, rgb(0 0 0 / 0.08) ${termFillPct}%, rgb(0 0 0 / 0.08) 100%)`,
        }}
      />

      <dl className="grid gap-3 rounded-2xl bg-black/[0.03] p-4 sm:grid-cols-3">
        <div>
          <dt className="text-[10.5px] font-bold uppercase tracking-wide text-faint">{t.payDaily}</dt>
          <dd key={`daily-${figures.daily}`} className="tnum pop text-xl font-extrabold text-green">
            {peso(figures.daily)}
          </dd>
        </div>
        <div>
          <dt className="text-[10.5px] font-bold uppercase tracking-wide text-faint">{t.interest}</dt>
          <dd key={`interest-${figures.interest}`} className="tnum pop text-xl font-extrabold">
            {peso(figures.interest)}
          </dd>
        </div>
        <div>
          <dt className="text-[10.5px] font-bold uppercase tracking-wide text-faint">{t.totalPayable}</dt>
          <dd key={`total-${figures.total}`} className="tnum pop text-xl font-extrabold">
            {peso(figures.total)}
          </dd>
        </div>
      </dl>

      <p className="mt-3 text-xs leading-relaxed text-muted">{t.disclaimer}</p>
    </div>
  );
}

export default function Landing() {
  const [lang, setLang] = useState('en');
  const [scrolled, setScrolled] = useState(false);
  const t = CONTENT[lang];

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <div className="landing-page min-h-screen bg-surface">
      <header className={`lp-nav ${scrolled ? 'is-scrolled' : ''}`}>
        <div className="mx-auto flex max-w-[1180px] items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <a href="#top" className="flex items-center gap-2.5">
            <img src="/drl-logo.svg" alt="DRL Lending Cooperative" className="h-10 w-10 rounded-[11px]" />
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
            <a href="#how" className="nav-link transition-colors hover:text-ink">
              {t.nav.how}
            </a>
            <a href="#rates" className="nav-link transition-colors hover:text-ink">
              {t.nav.rates}
            </a>
            <a href="#requirements" className="nav-link transition-colors hover:text-ink">
              {t.nav.requirements}
            </a>
            <a href="#contact" className="nav-link transition-colors hover:text-ink">
              {t.nav.contact}
            </a>
          </nav>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setLang((current) => (current === 'en' ? 'fil' : 'en'))}
              className="lp-btn lp-btn-glass lp-btn-tiny font-bold"
              aria-label={lang === 'en' ? 'Switch to Filipino' : 'Switch to English'}
            >
              {lang === 'en' ? 'FIL' : 'EN'}
            </button>
            <Link to="/login" className="lp-btn lp-btn-primary lp-btn-sm">
              {t.adminLogin}
            </Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section id="top" className="relative overflow-hidden border-b border-line">
        <HeroBlobs />
        <div className="relative mx-auto grid max-w-[1180px] items-center gap-10 px-4 py-16 sm:px-6 sm:py-24 lg:grid-cols-[1.05fr_0.95fr] lg:gap-14">
          <div>
            <span className="hero-in lp-pill lp-pill-badge mb-5">
              <Icon name="check" size={13} />
              {t.hero.badge}
            </span>

            <h1
              className="hero-in text-[clamp(2.2rem,6vw,3.8rem)] font-bold leading-[1.04] tracking-[-0.035em]"
              style={{ animationDelay: '80ms' }}
            >
              {t.hero.titleLine1}
              <br />
              <span className="text-brand">{t.hero.titleLine2}</span>
            </h1>

            <p
              className="hero-in mt-5 text-base font-semibold italic text-brand"
              style={{ animationDelay: '160ms' }}
            >
              {HERO_TAGLINE}
            </p>

            <p
              className="hero-in mt-2 max-w-xl text-lg leading-relaxed text-muted"
              style={{ animationDelay: '220ms' }}
            >
              {t.hero.subhead}
            </p>

            <div className="hero-in mt-8 flex flex-wrap gap-3" style={{ animationDelay: '300ms' }}>
              <a href="#contact" className="lp-btn lp-btn-primary group">
                {t.hero.ctaPrimary}
                <Icon name="chevronRight" size={17} className="transition-transform group-hover:translate-x-1" />
              </a>
              <a href="#how" className="lp-btn lp-btn-glass">
                {t.hero.ctaSecondary}
              </a>
            </div>

            <dl
              className="hero-in mt-11 grid max-w-lg grid-cols-3 gap-4 border-t border-line/70 pt-6"
              style={{ animationDelay: '380ms' }}
            >
              {t.hero.stats.map((item) => (
                <div key={item.label}>
                  <dt className="tnum text-xl font-extrabold tracking-tight sm:text-2xl">
                    {item.value}
                  </dt>
                  <dd className="text-xs font-semibold text-faint sm:text-sm">{item.label}</dd>
                </div>
              ))}
            </dl>
          </div>

          <div className="hero-in" style={{ animationDelay: '200ms' }}>
            <Calculator t={t.calculator} />
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="how" className="mx-auto max-w-[1180px] px-4 py-16 sm:px-6 sm:py-24">
        <Reveal className="mb-10 max-w-2xl">
          <span className="lp-pill lp-pill-tag mb-3">{t.how.pill}</span>
          <h2 className="text-[clamp(1.7rem,4vw,2.6rem)] font-bold leading-tight tracking-[-0.03em]">
            {t.how.heading}
          </h2>
          <p className="mt-3 text-lg text-muted">{t.how.body}</p>
        </Reveal>

        <ol className="grid gap-5 md:grid-cols-3">
          {t.steps.map((step, index) => (
            <Reveal key={step.title} as="li" delay={index * 90} className="lp-glass lift p-7">
              <div className="mb-5 flex items-center justify-between">
                <span
                  className="grid h-11 w-11 place-items-center rounded-[15px]"
                  style={TONE_STYLE[STEP_META[index].tone]}
                >
                  <Icon name={STEP_META[index].icon} size={21} />
                </span>
                <span className="tnum text-3xl font-extrabold text-line">0{index + 1}</span>
              </div>
              <h3 className="text-lg font-bold">{step.title}</h3>
              <p className="mt-2 text-muted">{step.body}</p>
            </Reveal>
          ))}
        </ol>
      </section>

      {/* Rates */}
      <section id="rates" className="bg-surface">
        <div className="mx-auto max-w-[1180px] px-4 py-16 sm:px-6 sm:py-24">
          <Reveal className="mb-8 max-w-2xl">
            <span className="lp-pill lp-pill-tag mb-3">{t.rates.pill}</span>
            <h2 className="text-[clamp(1.7rem,4vw,2.6rem)] font-bold leading-tight tracking-[-0.03em]">
              {t.rates.heading}
            </h2>
            <p className="mt-3 text-lg text-muted">{t.rates.body}</p>
          </Reveal>

          <Reveal delay={100} className="lp-glass overflow-hidden">
            <div className="table-wrap">
              <table className="lp-table">
                <thead>
                  <tr>
                    <th>{t.rates.table.loanAmount}</th>
                    <th className="num">{t.rates.table.interest}</th>
                    <th className="num">{t.rates.table.totalPayable}</th>
                    <th className="num">{t.rates.table.dailyFor40}</th>
                  </tr>
                </thead>
                <tbody>
                  {RATE_TABLE_AMOUNTS.map((principal) => {
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
          </Reveal>

          <p className="mt-4 flex items-start gap-2 text-sm text-muted">
            <Icon name="risk" size={16} className="mt-0.5 shrink-0 text-amber" />
            {t.rates.footnote}
          </p>
        </div>
      </section>

      {/* Requirements */}
      <section id="requirements" className="mx-auto max-w-[1180px] px-4 py-16 sm:px-6 sm:py-24">
        <div className="grid gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
          <Reveal>
            <span className="lp-pill lp-pill-tag mb-3">{t.requirements.pill}</span>
            <h2 className="text-[clamp(1.7rem,4vw,2.6rem)] font-bold leading-tight tracking-[-0.03em]">
              {t.requirements.heading}
            </h2>
            <p className="mt-3 text-lg text-muted">{t.requirements.body}</p>
          </Reveal>

          <ul className="grid gap-3 sm:grid-cols-2">
            {t.requirements.items.map((item, index) => (
              <Reveal key={item} as="li" delay={index * 60} className="lp-glass lift flex items-center gap-3 p-4">
                <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-green-soft text-green">
                  <Icon name="check" size={15} strokeWidth={2.6} />
                </span>
                <span className="font-semibold">{item}</span>
              </Reveal>
            ))}
          </ul>
        </div>
      </section>

      {/* Contact */}
      <section id="contact" className="border-t border-line bg-navy text-white">
        <div className="mx-auto grid max-w-[1180px] gap-8 px-4 py-16 sm:px-6 sm:py-24 lg:grid-cols-2 lg:items-center">
          <Reveal>
            <h2 className="text-[clamp(1.8rem,4vw,2.7rem)] font-bold leading-tight tracking-[-0.03em] text-white">
              {t.contact.heading}
            </h2>
            <p className="mt-4 max-w-lg text-lg text-white/70">{t.contact.body}</p>
          </Reveal>

          <div className="grid gap-3 sm:grid-cols-2">
            {CONTACT_META.map((meta, index) => {
              const item = t.contact[meta.key];
              return (
                <Reveal key={meta.key} delay={index * 70} className="lp-glass-dark p-5">
                  <span className="mb-3 grid h-9 w-9 place-items-center rounded-[11px] bg-white/10 text-white">
                    <Icon name={meta.icon} size={18} />
                  </span>
                  <p className="text-[11px] font-bold uppercase tracking-wider text-white/48">
                    {item.label}
                  </p>
                  <p className="font-semibold text-white">{item.value}</p>
                </Reveal>
              );
            })}
          </div>
        </div>
      </section>

      <footer className="bg-navy text-white/60">
        <div className="mx-auto flex max-w-[1180px] flex-col gap-4 border-t border-white/10 px-4 py-7 text-sm sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <p>
            © {new Date().getFullYear()} DRL Lending Cooperative. {t.footer.rights}
          </p>
          <p>
            {t.footer.craftedBy}{' '}
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
