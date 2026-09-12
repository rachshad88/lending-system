import { Icon } from './ui';

const TONES = {
  brand: { bg: 'bg-brand-soft', fg: 'text-brand' },
  green: { bg: 'bg-green-soft', fg: 'text-green' },
  red: { bg: 'bg-red-soft', fg: 'text-red' },
  amber: { bg: 'bg-amber-soft', fg: 'text-amber' },
  teal: { bg: 'bg-teal-soft', fg: 'text-teal' },
};

/**
 * Headline figure card. `emphasis` makes the number bigger for the three
 * all-time KPIs so they read as the top of the hierarchy.
 */
export default function StatCard({
  label,
  value,
  hint,
  icon = 'peso',
  tone = 'brand',
  emphasis = false,
  loading = false,
  footer,
}) {
  const t = TONES[tone] ?? TONES.brand;

  return (
    <article className="card flex flex-col gap-3 p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-semibold text-muted">{label}</p>
        <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-[10px] ${t.bg} ${t.fg}`}>
          <Icon name={icon} size={18} />
        </span>
      </div>

      {loading ? (
        <div className={`skeleton ${emphasis ? 'h-9' : 'h-7'} w-3/4`} />
      ) : (
        <p
          className={`tnum font-extrabold leading-none tracking-tight ${
            emphasis ? 'text-[1.75rem] sm:text-[2rem]' : 'text-2xl'
          }`}
        >
          {value}
        </p>
      )}

      {hint && !loading && <p className="text-sm text-muted">{hint}</p>}
      {footer}
    </article>
  );
}
