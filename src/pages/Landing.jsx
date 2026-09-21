import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AnimatePresence,
  domMax,
  LazyMotion,
  m,
  MotionConfig,
  useReducedMotion,
} from 'motion/react';
import { peso, pesoWhole } from '../lib/format';
import { AnimatedNumber, EASE, Rise, SPRING } from './landingMotion';
import { barMap, lensMap, supportsRefraction } from './glassLens';
import './landing.css';

// Swap these two for your own name and site: this is the credit line in the footer.
const CRAFTED_BY = 'Dave Shadrach';
const CRAFTED_BY_URL = 'https://github.com/rachshad88';

const INTEREST_RATE = 0.2;
const DEFAULT_TERM = 40;

const AMOUNT_PRESETS = [2000, 3000, 5000, 8000, 10000];
const TERM_OPTIONS = [20, 30, 40, 50, 60];
const RATE_TABLE_AMOUNTS = [2000, 3000, 5000, 8000, 10000];

const CONTACT_KEYS = ['office', 'open', 'loanRange', 'collection'];

const TAGLINE = 'Serbisyong mabilis, patas, at malinaw.';

const CONTENT = {
  en: {
    nav: {
      how: 'How it works',
      rates: 'Rates',
      requirements: 'Requirements',
      contact: 'Contact',
    },
    adminLogin: 'Admin login',
    hero: {
      eyebrow: 'Serving drivers and small earners since 2024',
      titleLine1: 'Small loans,',
      titleLine2: 'released the same day.',
      subhead:
        'Borrow what you need today and pay one fixed amount every day. No hidden charges, no surprises at the end.',
      ctaPrimary: 'Talk to us today',
      ctaSecondary: 'See how it works',
    },
    calculator: {
      title: 'Estimate your daily payment',
      amountLabel: 'How much do you need?',
      termLabel: 'Term',
      days: 'days',
      payDaily: 'You pay every day',
      interest: 'Interest (20%)',
      totalPayable: 'Total payable',
      gridNote: (term, daily) =>
        `${term} boxes, one for each daily payment of ${daily}. The filled box is your last.`,
      disclaimer:
        'Estimate only. A one-time 10% charge applies to any balance left unpaid after the due date. Final terms are confirmed at the office.',
      barLabel: 'Daily',
    },
    how: {
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
      open: { label: 'Open', value: 'Mon-Sat, 8:00am-5:00pm' },
      loanRange: { label: 'Loan range', value: '₱1,500-₱20,000' },
      collection: { label: 'Collection', value: 'Daily, at your terminal' },
    },
    footer: { rights: 'All rights reserved.', craftedBy: 'Crafted by' },
  },
  fil: {
    nav: {
      how: 'Paano Ito Gumagana',
      rates: 'Mga Rate',
      requirements: 'Mga Kailangan',
      contact: 'Makipag-ugnayan',
    },
    adminLogin: 'Admin login',
    hero: {
      eyebrow: 'Naglilingkod sa mga drivers at maliliit na kumikita mula 2024',
      titleLine1: 'Maliit na utang,',
      titleLine2: 'inilalabas sa parehong araw.',
      subhead:
        'Manghiram ng kailangan mo ngayon at magbayad ng iisang tiyak na halaga araw-araw. Walang tagong bayad, walang gulat sa huli.',
      ctaPrimary: 'Makipag-usap sa amin',
      ctaSecondary: 'Paano ito gumagana',
    },
    calculator: {
      title: 'Tantyahin ang araw-araw mong babayaran',
      amountLabel: 'Magkano ang kailangan mo?',
      termLabel: 'Termino',
      days: 'araw',
      payDaily: 'Babayaran mo araw-araw',
      interest: 'Tubo (20%)',
      totalPayable: 'Kabuuang babayaran',
      gridNote: (term, daily) =>
        `${term} kahon, isa para sa bawat araw-araw na bayad na ${daily}. Ang may kulay ang huling bayad.`,
      disclaimer:
        'Pagtantya lamang. May isang beses na 10% na singil sa anumang balanseng hindi nabayaran pagkatapos ng takdang petsa. Ang huling tuntunin ay kinukumpirma sa opisina.',
      barLabel: 'Araw-araw',
    },
    how: {
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
      open: { label: 'Bukas', value: 'Lun-Sab, 8:00am-5:00pm' },
      loanRange: { label: 'Saklaw ng utang', value: '₱1,500-₱20,000' },
      collection: { label: 'Koleksyon', value: 'Araw-araw, sa iyong terminal' },
    },
    footer: {
      rights: 'Nakalaan ang lahat ng karapatan.',
      craftedBy: 'Ginawa ni',
    },
  },
};

// The strip along the top of the viewport that the bar occupies, as a
// percentage of viewport height. IntersectionObserver rootMargin cannot mix
// px and % in one calc, so the band is expressed the same way it is used.
const NAV_BAND_PCT = 8;

/**
 * Drives the two behaviours the glass bar needs, both from IntersectionObserver
 * rather than a scroll listener: whether anything has passed beneath the bar
 * yet, and whether what sits under it right now is the dark hero or the light
 * page. The second is how the system picks light or dark labels for a bar, and
 * it also decides when the phone action bar slides in.
 */
function useGlassBar(pageTopRef, heroRef) {
  const [floating, setFloating] = useState(false);
  const [onHero, setOnHero] = useState(true);

  useEffect(() => {
    const observers = [];

    if (pageTopRef.current) {
      const io = new IntersectionObserver(([entry]) => setFloating(!entry.isIntersecting));
      io.observe(pageTopRef.current);
      observers.push(io);
    }

    if (heroRef.current) {
      // Shrinking the root to a thin strip along the top of the viewport turns
      // this into exactly the question the bar needs answered: is the dark hero
      // the thing currently underneath me? Observing the whole hero rather than
      // a 1px sentinel matters, because a sentinel can pass from below the
      // viewport to above it without ever intersecting, which fires no callback
      // at all on an anchor jump or an End keypress.
      const io = new IntersectionObserver(([entry]) => setOnHero(entry.isIntersecting), {
        rootMargin: `0px 0px -${100 - NAV_BAND_PCT}% 0px`,
      });
      io.observe(heroRef.current);
      observers.push(io);
    }

    return () => observers.forEach((io) => io.disconnect());
  }, [pageTopRef, heroRef]);

  return { floating, onHero };
}

const LENS_FILTER_ID = 'lp-nav-lens-filter';
// Must match `inset: -6px -18px` on .lp-nav-lens in the stylesheet: the lens is
// that much larger than the word's link on each side.
const LENS_INSET = { x: 18, y: 6 };

/**
 * The nav words, with a glass lens that magnifies whichever one you are on.
 *
 * Hovering (or tabbing to) a word slides one shared lens over it. Where the
 * browser can do real refraction (Chromium) that lens is genuinely optical: it
 * sits in front of the word and bends the picture behind it, so the letters are
 * magnified. Everywhere else it is the
 * plain glass-and-rim lens sitting behind a word that scales up instead.
 * Neighbouring words ease up a little either way, the way Apple's dock does.
 *
 * Mouse and pen only: touch has no hover, and these links are not shown below
 * the lg breakpoint anyway. Reduce Motion (MotionConfig on the page root) drops
 * the scaling and the glide, and the lens still appears so the hover has an
 * answer.
 */
function NavLinks({ items }) {
  const [active, setActive] = useState(null);
  const refractive = useMemo(() => supportsRefraction(), []);
  const svgRef = useRef(null);
  const linkRefs = useRef([]);

  const leave = () => setActive(null);

  // Points the filter at a displacement map cut to the word the lens is about to
  // sit on. Written straight to the SVG rather than through React state, and
  // before paint, so the lens never flashes up carrying the previous word's map.
  useLayoutEffect(() => {
    const link = linkRefs.current[active];
    const svg = svgRef.current;
    if (!refractive || active === null || !link || !svg) return;
    const { width, height } = link.getBoundingClientRect();
    const map = lensMap(width + LENS_INSET.x * 2, height + LENS_INSET.y * 2);
    const { url, scale } = map;
    // Region and map are sized in real pixels: a percentage would resolve against
    // this svg's own 0x0 viewport and leave the filter with no map at all.
    const region = svg.querySelector('filter');
    const image = svg.querySelector('feImage');
    [region, image].forEach((node) => {
      node.setAttribute('x', '0');
      node.setAttribute('y', '0');
      node.setAttribute('width', String(map.width));
      node.setAttribute('height', String(map.height));
    });
    image.setAttribute('href', url);
    svg.querySelector('feDisplacementMap').setAttribute('scale', String(scale));
  }, [active, refractive]);

  // With a real lens doing most of the magnifying, the word itself only needs a nudge.
  const [zoomActive, zoomNear] = [1.2, 1.06];

  return (
    <>
      {refractive && (
        <svg
          ref={svgRef}
          aria-hidden="true"
          focusable="false"
          className="pointer-events-none absolute h-0 w-0"
        >
          <defs>
            {/* sRGB matters: the default linearRGB would reinterpret the map's
                channel values and displace by the wrong amounts. */}
            <filter
              id={LENS_FILTER_ID}
              filterUnits="userSpaceOnUse"
              x="0"
              y="0"
              width="1"
              height="1"
              colorInterpolationFilters="sRGB"
            >
              <feImage x="0" y="0" width="1" height="1" preserveAspectRatio="none" result="map" />
              <feDisplacementMap
                in="SourceGraphic"
                in2="map"
                scale="0"
                xChannelSelector="R"
                yChannelSelector="G"
                result="pulled"
              />
              {/* The map only bends the rim, so the word in the middle is not resampled
                  and stays crisp. */}
            </filter>
          </defs>
        </svg>
      )}
      <nav
        className="hidden items-center gap-5 lg:flex"
        aria-label="Sections"
        onPointerLeave={leave}
        onBlur={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget)) leave();
        }}
      >
        {items.map(([href, label], index) => {
          const distance = active === null ? null : Math.abs(index - active);
          const scale = distance === 0 ? zoomActive : distance === 1 ? zoomNear : 1;
          return (
            <a
              key={href}
              href={href}
              ref={(node) => {
                linkRefs.current[index] = node;
              }}
              className="lp-nav-link"
              onPointerEnter={(event) => {
                if (event.pointerType !== 'touch') setActive(index);
              }}
              onFocus={() => setActive(index)}
            >
              {active === index && (
                <m.span
                  layoutId="nav-lens"
                  className={`lp-nav-lens ${refractive ? 'is-refractive' : ''}`}
                  transition={SPRING}
                />
              )}
              <m.span className="lp-nav-label" animate={{ scale }} transition={SPRING}>
                {label}
              </m.span>
            </a>
          );
        })}
      </nav>
    </>
  );
}

const GRID_COLS = 10;
const GRID_GAP = 5;

/**
 * A selection chip. The highlight is a single shared element (layoutId) that
 * travels from the old choice to the new one, so a change of selection is seen
 * as movement rather than as one box switching off and another switching on.
 */
function Chip({ selected, onClick, layoutId, children }) {
  return (
    <button type="button" aria-pressed={selected} onClick={onClick} className="lp-chip lp-num">
      {selected && <m.span layoutId={layoutId} className="lp-chip-fill" transition={SPRING} />}
      <span className="lp-chip-label">{children}</span>
    </button>
  );
}

/**
 * One box per daily payment. Only the boxes that change animate: lengthening the
 * term draws the new ones in, shortening it lets the extras fall away, and the
 * card grows or shrinks with them instead of jumping. Replaying all forty on
 * every tap would make the page feel busy rather than responsive.
 */
function PaymentGrid({ term }) {
  const reduce = useReducedMotion();
  const wrapRef = useRef(null);
  const previousTerm = useRef(0);
  const [cell, setCell] = useState(0);

  // The grid's height is rows x cell size, and cell size follows the card's
  // width, so it is measured rather than guessed. Measured before paint so the
  // first frame is already correct.
  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return undefined;
    const measure = () => setCell((el.clientWidth - GRID_GAP * (GRID_COLS - 1)) / GRID_COLS);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const rows = Math.ceil(term / GRID_COLS);
  const height = cell ? Math.ceil(rows * cell + (rows - 1) * GRID_GAP) + 1 : 'auto';
  // Boxes past this index are new this render and get the stagger.
  const firstNew = previousTerm.current;

  useEffect(() => {
    previousTerm.current = term;
  }, [term]);

  return (
    <m.div
      ref={wrapRef}
      className="lp-grid-wrap mt-5"
      initial={false}
      animate={{ height }}
      transition={reduce ? { duration: 0 } : SPRING}
    >
      <ol className="lp-grid" aria-hidden="true">
        <AnimatePresence initial>
          {Array.from({ length: term }, (_, index) => (
            <m.li
              key={index}
              className={index === term - 1 ? 'is-last' : undefined}
              initial={{ opacity: 0, scale: 0.4 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.5, transition: { duration: 0.14 } }}
              transition={{
                duration: 0.42,
                ease: EASE,
                delay: Math.max(0, index - firstNew) * 0.011,
              }}
            >
              {index + 1}
            </m.li>
          ))}
        </AnimatePresence>
      </ol>
    </m.div>
  );
}

/**
 * The hero visual is the artifact the office hands you: a printed computation,
 * with one box per daily payment underneath it. Changing the term redraws the
 * grid, so the size of the commitment is something you see rather than read.
 */
function Receipt({ t, amount, setAmount, term, setTerm, figures }) {
  const cardRef = useRef(null);
  const frame = useRef(0);

  // Liquid Glass answers a pointer with a moving highlight. A mouse only:
  // touch has no hover, and Reduce Motion gets the resting highlight instead.
  // The position is written straight to CSS variables rather than React state,
  // so a moving mouse never re-renders the calculator.
  const onPointerMove = (event) => {
    if (event.pointerType !== 'mouse') return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const { clientX, clientY } = event;
    cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => {
      const el = cardRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      el.style.setProperty('--mx', `${clientX - rect.left}px`);
      el.style.setProperty('--my', `${clientY - rect.top}px`);
    });
  };

  const onPointerLeave = () => {
    cancelAnimationFrame(frame.current);
    cardRef.current?.style.removeProperty('--mx');
    cardRef.current?.style.removeProperty('--my');
  };

  useEffect(() => () => cancelAnimationFrame(frame.current), []);

  return (
    <div className="lp-stage">
      <div
        ref={cardRef}
        className="lp-receipt p-5 sm:p-6"
        onPointerMove={onPointerMove}
        onPointerLeave={onPointerLeave}
      >
        <h2 className="text-xl font-semibold">{t.title}</h2>

        <label className="lp-muted mb-2 mt-5 block text-[15px]" htmlFor="calc-amount">
          {t.amountLabel}
        </label>
        <div className="lp-amount">
          <span className="lp-muted text-2xl font-semibold" aria-hidden="true">
            ₱
          </span>
          <input
            id="calc-amount"
            className="lp-num"
            type="text"
            inputMode="numeric"
            autoComplete="off"
            maxLength={6}
            placeholder="0"
            value={amount === 0 ? '' : String(amount)}
            onChange={(event) => setAmount(Number(event.target.value.replace(/\D/g, '')) || 0)}
          />
        </div>

        <div className="mt-2.5 grid grid-cols-3 gap-2 sm:grid-cols-5">
          {AMOUNT_PRESETS.map((preset) => (
            <Chip
              key={preset}
              layoutId="chip-amount"
              selected={amount === preset}
              onClick={() => setAmount(preset)}
            >
              {pesoWhole(preset)}
            </Chip>
          ))}
        </div>

        <p id="calc-term-label" className="lp-muted mb-2 mt-5 text-[15px]">
          {t.termLabel}:{' '}
          <strong className="font-semibold text-[color:var(--lp-ink)]">
            {term} {t.days}
          </strong>
        </p>
        <div role="group" aria-labelledby="calc-term-label" className="grid grid-cols-5 gap-2">
          {TERM_OPTIONS.map((option) => (
            <Chip
              key={option}
              layoutId="chip-term"
              selected={term === option}
              onClick={() => setTerm(option)}
            >
              {option}
            </Chip>
          ))}
        </div>

        <div className="lp-rule-top mt-6 pt-5">
          <p className="lp-muted text-[15px]">{t.payDaily}</p>
          <p className="lp-num text-[44px] font-semibold leading-none tracking-[-0.03em] text-[color:var(--lp-accent)] sm:text-5xl">
            <span aria-hidden="true">
              <AnimatedNumber value={figures.daily} format={peso} />
            </span>
            <span className="sr-only" aria-live="polite">
              {peso(figures.daily)}
            </span>
          </p>
          <dl className="mt-4 grid gap-2 text-[15px]">
            <div className="lp-receipt-row">
              <dt className="lp-muted">{t.interest}</dt>
              <dd className="lp-num font-medium">
                <AnimatedNumber value={figures.interest} format={peso} />
              </dd>
            </div>
            <div className="lp-receipt-row">
              <dt className="lp-muted">{t.totalPayable}</dt>
              <dd className="lp-num font-medium">
                <AnimatedNumber value={figures.total} format={peso} />
              </dd>
            </div>
          </dl>
        </div>

        <PaymentGrid term={term} />
        <p className="lp-muted mt-3 text-sm">{t.gridNote(term, peso(figures.daily))}</p>
      </div>
    </div>
  );
}

const BAR_FILTER_ID = 'lp-nav-bar-filter';

/**
 * Makes the floating nav a real magnifier for whatever scrolls beneath it.
 *
 * Keeps a displacement filter sized to the header (through a ResizeObserver, so
 * it follows window resizes) and returns the svg that holds it. Chromium only,
 * like the hover lens; elsewhere the bar just stays frosted.
 */
function useBarLens(headerRef) {
  const refractive = useMemo(() => supportsRefraction(), []);
  const svgRef = useRef(null);

  useLayoutEffect(() => {
    const header = headerRef.current;
    const svg = svgRef.current;
    if (!refractive || !header || !svg) return undefined;
    const apply = () => {
      const { width, height } = header.getBoundingClientRect();
      if (width < 2 || height < 2) return;
      const map = barMap(width, height);
      const region = svg.querySelector('filter');
      const image = svg.querySelector('feImage');
      [region, image].forEach((node) => {
        node.setAttribute('x', '0');
        node.setAttribute('y', '0');
        node.setAttribute('width', String(map.width));
        node.setAttribute('height', String(map.height));
      });
      image.setAttribute('href', map.url);
      svg.querySelector('feDisplacementMap').setAttribute('scale', String(map.scale));
    };
    apply();
    const observer = new ResizeObserver(apply);
    observer.observe(header);
    return () => observer.disconnect();
  }, [headerRef, refractive]);

  const svg = refractive ? (
    <svg
      ref={svgRef}
      aria-hidden="true"
      focusable="false"
      className="pointer-events-none absolute h-0 w-0"
    >
      <defs>
        <filter
          id={BAR_FILTER_ID}
          filterUnits="userSpaceOnUse"
          x="0"
          y="0"
          width="1"
          height="1"
          colorInterpolationFilters="sRGB"
        >
          <feImage x="0" y="0" width="1" height="1" preserveAspectRatio="none" result="map" />
          <feDisplacementMap
            in="SourceGraphic"
            in2="map"
            scale="0"
            xChannelSelector="R"
            yChannelSelector="G"
          />
        </filter>
      </defs>
    </svg>
  ) : null;
  return { svg, refractive };
}

export default function Landing() {
  const [lang, setLang] = useState('en');
  const [amount, setAmount] = useState(5000);
  const [term, setTerm] = useState(DEFAULT_TERM);

  const heroRef = useRef(null);
  const pageTopRef = useRef(null);
  const headerRef = useRef(null);
  const barLens = useBarLens(headerRef);
  const { floating, onHero } = useGlassBar(pageTopRef, heroRef);

  const t = CONTENT[lang];
  const isFil = lang === 'fil';

  const figures = useMemo(() => {
    const interest = amount * INTEREST_RATE;
    const total = amount + interest;
    return { interest, total, daily: total / term };
  }, [amount, term]);

  return (
    <MotionConfig reducedMotion="user">
      <LazyMotion features={domMax} strict>
        <div className="landing-page min-h-dvh pb-20 md:pb-0" lang={lang}>
          <span ref={pageTopRef} aria-hidden="true" className="absolute top-0 h-px w-px" />

          {barLens.svg}
          <header
            ref={headerRef}
            className={`lp-nav ${floating ? 'is-floating' : ''} ${onHero ? 'is-over-dark' : ''} ${
              barLens.refractive ? 'is-magnifying' : ''
            }`}
          >
            <div className="lp-nav-inner mx-auto flex h-[60px] max-w-[1180px] items-center justify-between gap-3 px-4 sm:gap-4 sm:px-6">
              <a
                href="#top"
                className="flex shrink-0 items-center gap-2.5"
                aria-label="DRL Lending Cooperative"
              >
                <img src="/drl-logo.svg" alt="" width="32" height="32" className="h-8 w-8" />
                <span className="whitespace-nowrap text-[17px] font-semibold tracking-[-0.02em]">
                  DRL Lending
                </span>
              </a>

              <NavLinks
                items={[
                  ['#how', t.nav.how],
                  ['#rates', t.nav.rates],
                  ['#requirements', t.nav.requirements],
                  ['#contact', t.nav.contact],
                ]}
              />

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setLang(isFil ? 'en' : 'fil')}
                  className="lp-btn lp-btn-quiet lp-btn-sm"
                  aria-label={isFil ? 'Switch to English' : 'Switch to Filipino'}
                >
                  {isFil ? 'EN' : 'FIL'}
                </button>
                <Link to="/login" className="lp-btn lp-btn-quiet lp-btn-sm">
                  {t.adminLogin}
                </Link>
              </div>
            </div>
          </header>

          <main>
            {/* Hero. The navy field is what makes the bar above it legible as glass,
            and what that bar adapts its labels to. */}
            <section id="top" ref={heroRef} className="lp-hero">
              <div className="mx-auto grid max-w-[1180px] gap-12 px-4 pb-20 pt-14 sm:px-6 lg:grid-cols-[minmax(0,1fr)_450px] lg:items-center lg:gap-16 lg:pb-24 lg:pt-16">
                {/* Keyed on the language so the copy re-mounts and its own staggered rise
                plays on the new text. There is deliberately no exit animation:
                the new language must appear the moment it is chosen, not after
                the old one has finished leaving. */}
                <div key={lang}>
                  <Rise>
                    <p className="lp-hero-muted text-base">{t.hero.eyebrow}</p>
                  </Rise>
                  <Rise delay={70}>
                    <h1
                      className={`mt-4 text-balance ${
                        isFil
                          ? 'text-[clamp(2.1rem,3.8vw,2.9rem)]'
                          : 'text-[clamp(2.6rem,4.8vw,3.7rem)]'
                      }`}
                    >
                      <span className="block">{t.hero.titleLine1}</span>
                      <span className="block opacity-70">{t.hero.titleLine2}</span>
                    </h1>
                  </Rise>
                  <Rise delay={140}>
                    <p className="lp-hero-muted mt-6 max-w-[44ch] text-lg leading-relaxed">
                      {t.hero.subhead}
                    </p>
                  </Rise>
                  <Rise delay={210}>
                    <div className="mt-9 flex flex-wrap gap-3">
                      <a href="#contact" className="lp-btn lp-btn-primary">
                        {t.hero.ctaPrimary}
                      </a>
                      <a href="#how" className="lp-btn lp-btn-quiet">
                        {t.hero.ctaSecondary}
                      </a>
                    </div>
                  </Rise>
                </div>

                <Rise delay={120}>
                  <Receipt
                    t={t.calculator}
                    amount={amount}
                    setAmount={setAmount}
                    term={term}
                    setTerm={setTerm}
                    figures={figures}
                  />
                  <p className="lp-hero-muted mt-3 text-sm leading-relaxed">
                    {t.calculator.disclaimer}
                  </p>
                </Rise>
              </div>
            </section>

            {/* How it works */}
            <section id="how">
              <div className="mx-auto grid max-w-[1180px] gap-10 px-4 py-20 sm:px-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-20 lg:py-28">
                <Rise className="lg:sticky lg:top-28 lg:self-start">
                  <h2 className="text-balance text-[clamp(2rem,4vw,3rem)]">{t.how.heading}</h2>
                  <p className="lp-muted mt-4 max-w-[44ch] text-lg leading-relaxed">{t.how.body}</p>
                </Rise>

                <ol>
                  {t.steps.map((step, index) => (
                    <Rise
                      key={step.title}
                      as="li"
                      delay={index * 90}
                      className="lp-rule-top block py-8 last:border-b last:border-[color:var(--lp-line)] sm:py-10"
                    >
                      <h3 className="text-2xl sm:text-[28px]">{step.title}</h3>
                      <p className="lp-muted mt-3 max-w-[52ch] text-lg leading-relaxed">
                        {step.body}
                      </p>
                    </Rise>
                  ))}
                </ol>
              </div>
            </section>

            {/* Rates */}
            <section id="rates" className="lp-band">
              <div className="mx-auto max-w-[1180px] px-4 py-20 sm:px-6 lg:py-28">
                <Rise>
                  <h2 className="max-w-[24ch] text-balance text-[clamp(2rem,4vw,3rem)]">
                    {t.rates.heading}
                  </h2>
                  <p className="lp-muted mt-4 max-w-[60ch] text-lg leading-relaxed">
                    {t.rates.body}
                  </p>
                </Rise>

                <Rise delay={80}>
                  <table className="lp-table mt-10">
                    <caption className="sr-only">{t.rates.heading}</caption>
                    <thead>
                      <tr>
                        <th scope="col">{t.rates.table.loanAmount}</th>
                        <th scope="col">{t.rates.table.interest}</th>
                        <th scope="col">{t.rates.table.totalPayable}</th>
                        <th scope="col">{t.rates.table.dailyFor40}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {RATE_TABLE_AMOUNTS.map((principal) => {
                        const interest = principal * INTEREST_RATE;
                        const total = principal + interest;
                        return (
                          <tr key={principal}>
                            <td>{pesoWhole(principal)}</td>
                            <td data-label={t.rates.table.interest}>{pesoWhole(interest)}</td>
                            <td data-label={t.rates.table.totalPayable}>{pesoWhole(total)}</td>
                            <td data-label={t.rates.table.dailyFor40}>{peso(total / 40)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  <p className="lp-muted mt-6 max-w-[68ch] text-[15px] leading-relaxed">
                    {t.rates.footnote}
                  </p>
                </Rise>
              </div>
            </section>

            {/* Requirements */}
            <section id="requirements">
              <div className="mx-auto max-w-[1180px] px-4 py-20 sm:px-6 lg:py-28">
                <Rise>
                  <h2 className="max-w-[24ch] text-balance text-[clamp(2rem,4vw,3rem)]">
                    {t.requirements.heading}
                  </h2>
                  <p className="lp-muted mt-4 max-w-[60ch] text-lg leading-relaxed">
                    {t.requirements.body}
                  </p>
                </Rise>

                <ul className="mt-10 grid gap-x-16 gap-y-6 sm:grid-cols-2">
                  {t.requirements.items.map((item, index) => (
                    <Rise key={item} as="li" delay={index * 55} className="flex gap-4">
                      <span className="lp-check" aria-hidden="true" />
                      <span className="text-xl leading-snug">{item}</span>
                    </Rise>
                  ))}
                </ul>
              </div>
            </section>

            {/* Contact */}
            <section id="contact" className="lp-band">
              <div className="mx-auto max-w-[1180px] px-4 py-20 sm:px-6 lg:py-28">
                <Rise>
                  <h2 className="max-w-[22ch] text-balance text-[clamp(2.25rem,5vw,3.75rem)]">
                    {t.contact.heading}
                  </h2>
                  <p className="lp-muted mt-5 max-w-[56ch] text-lg leading-relaxed">
                    {t.contact.body}
                  </p>
                </Rise>

                <dl className="mt-12 grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
                  {CONTACT_KEYS.map((key, index) => (
                    <Rise key={key} delay={index * 70} className="lp-fact">
                      <dt className="lp-muted text-[15px]">{t.contact[key].label}</dt>
                      <dd className="mt-1 text-xl font-medium leading-snug">
                        {t.contact[key].value}
                      </dd>
                    </Rise>
                  ))}
                </dl>
              </div>
            </section>
          </main>

          <footer className="lp-band lp-rule-top">
            <div className="mx-auto flex max-w-[1180px] flex-col gap-3 px-4 py-8 text-[15px] sm:px-6 md:flex-row md:items-center md:justify-between">
              <p className="lp-muted">
                © {new Date().getFullYear()} DRL Lending Cooperative. {t.footer.rights}
              </p>
              <p>{TAGLINE}</p>
              <p className="lp-muted">
                {t.footer.craftedBy}{' '}
                <a
                  href={CRAFTED_BY_URL}
                  className="font-medium text-[color:var(--lp-ink)] underline underline-offset-4"
                >
                  {CRAFTED_BY}
                </a>
              </p>
            </div>
          </footer>

          {/* The one glass surface in the functional layer. It carries the live figure past the hero so
          the number stays with you while you read the rates. Off screen it is
          inert, so its link cannot be tabbed to while invisible. */}
          <m.div
            className="lp-actionbar"
            initial={false}
            animate={{ y: onHero ? '110%' : '0%' }}
            transition={SPRING}
            inert={onHero ? '' : undefined}
          >
            <p className="min-w-0">
              <span className="lp-muted block text-[13px]">{t.calculator.barLabel}</span>
              <span className="lp-num block text-xl font-semibold leading-tight">
                <AnimatedNumber value={figures.daily} format={peso} />
              </span>
            </p>
            <a href="#contact" className="lp-btn lp-btn-primary lp-btn-sm">
              {t.hero.ctaPrimary}
            </a>
          </m.div>
        </div>
      </LazyMotion>
    </MotionConfig>
  );
}
