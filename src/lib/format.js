// The shop runs on Philippine time. The database agrees (see biz_today() in the
// migration) — both sides must, or "collected today" drifts by eight hours.
export const TZ = 'Asia/Manila';

const pesoFmt = new Intl.NumberFormat('en-PH', {
  style: 'currency',
  currency: 'PHP',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const pesoWholeFmt = new Intl.NumberFormat('en-PH', {
  style: 'currency',
  currency: 'PHP',
  maximumFractionDigits: 0,
});

const countFmt = new Intl.NumberFormat('en-PH');

// PDF exports use jsPDF's built-in Helvetica, which has no ₱ glyph — amounts
// there are printed bare with "PHP" in the column header instead.
const plainFmt = new Intl.NumberFormat('en-PH', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export const peso = (value) => pesoFmt.format(Number(value ?? 0));
export const pesoWhole = (value) => pesoWholeFmt.format(Number(value ?? 0));
export const count = (value) => countFmt.format(Number(value ?? 0));
export const plainAmount = (value) => plainFmt.format(Number(value ?? 0));

// Building an Intl.DateTimeFormat is far more expensive than using one, and the
// tables here format a date per row (a payment strip, one per day of the term).
const dateFormatters = new Map();
function dateFormatter(locale, options) {
  const key = locale + JSON.stringify(options);
  let formatter = dateFormatters.get(key);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat(locale, options);
    dateFormatters.set(key, formatter);
  }
  return formatter;
}

/** Today's date in Manila, as YYYY-MM-DD. */
export function todayISO() {
  return dateFormatter('en-CA', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

/** Shift a YYYY-MM-DD string by a number of days, staying calendar-safe. */
export function addDays(iso, days) {
  const [y, m, d] = String(iso).slice(0, 10).split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

/** First day of the month for a YYYY-MM-DD string. */
export function startOfMonth(iso) {
  return `${String(iso).slice(0, 7)}-01`;
}

/** Shift by whole months, landing on the first of the target month. */
export function addMonths(iso, months) {
  const [y, m] = String(iso).slice(0, 10).split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1 + months, 1));
  return dt.toISOString().slice(0, 10);
}

export function endOfMonth(iso) {
  const [y, m] = String(iso).slice(0, 10).split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
}

/** Parse a date-only string without letting the timezone move the day. */
function parseDateOnly(iso) {
  const [y, m, d] = String(iso).slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** True for full timestamps ("2026-09-12T14:30:00Z") rather than plain dates. */
function isTimestamp(value) {
  return /[T ]\d{2}:/.test(String(value));
}

export function formatDate(iso, opts = {}) {
  if (!iso) return '—';
  const base = { month: 'short', day: 'numeric', year: 'numeric', ...opts };
  // Timestamps get converted to Manila time; date-only strings must not be
  // shifted by any timezone at all.
  return isTimestamp(iso)
    ? dateFormatter('en-PH', { timeZone: TZ, ...base }).format(new Date(iso))
    : dateFormatter('en-PH', base).format(parseDateOnly(iso));
}

export function formatDateShort(iso) {
  if (!iso) return '—';
  return dateFormatter('en-PH', { month: 'short', day: 'numeric' }).format(parseDateOnly(iso));
}

export function formatMonth(iso) {
  if (!iso) return '—';
  return dateFormatter('en-PH', { month: 'short', year: 'numeric' }).format(parseDateOnly(iso));
}

/** Format a timestamptz from the database in Manila time. */
export function formatDateTime(ts) {
  if (!ts) return '—';
  return dateFormatter('en-PH', {
    timeZone: TZ,
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(ts));
}

export function relativeDays(iso) {
  if (!iso) return null;
  const today = parseDateOnly(todayISO());
  const then = parseDateOnly(iso);
  return Math.round((today - then) / 86400000);
}

/** Keep user text out of PostgREST filter syntax. */
export function sanitizeSearch(term) {
  return String(term ?? '')
    .replace(/[^\p{L}\p{N}\s.\-_@]/gu, ' ')
    .trim()
    .slice(0, 60);
}

export function initials(name) {
  return String(name ?? '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}
