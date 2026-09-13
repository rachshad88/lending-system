import { relativeDays } from './format';

/**
 * Days since the last collection on a loan, counted from its release date when
 * nothing has ever been collected. This is the earliest reliable warning in a
 * daily-collection book: arrears can look identical for someone paying a little
 * short every day and for someone who has vanished, but this cannot.
 */
export function quietDays(loan) {
  if (!loan) return 0;
  const since = loan.last_payment_date ?? loan.start_date;
  return Math.max(0, relativeDays(since) ?? 0);
}

/** Colour for a quiet streak, measured against the configured alarm point. */
export function quietTone(days, threshold = 3) {
  if (days >= threshold * 4) return 'red';
  if (days >= threshold) return 'amber';
  return 'muted';
}

export const GRADE_LABELS = {
  green: 'Reliable',
  amber: 'Watch',
  red: 'High risk',
  new: 'New borrower',
};

export const GRADE_PILLS = {
  green: 'pill-green',
  amber: 'pill-amber',
  red: 'pill-red',
  new: 'pill-grey',
};

/**
 * Turns the raw track record into a grade plus the reasons behind it. The
 * reasons matter as much as the grade: a lender who knows their members needs
 * to see what the verdict is based on, not just a colour.
 */
export function reliabilityGrade(facts, { goneQuietDays = 3 } = {}) {
  if (!facts) return null;

  const completed = Number(facts.loans_completed) || 0;
  const writtenOff = Number(facts.loans_written_off) || 0;
  const penalties = Number(facts.penalties_incurred) || 0;
  const gap = Number(facts.longest_gap_days) || 0;
  const avgDays = Number(facts.avg_days_to_complete) || 0;
  const avgTerm = Number(facts.avg_term_days) || 0;

  if (writtenOff > 0) {
    return { grade: 'red', reasons: [`${writtenOff} loan(s) written off as bad debt`] };
  }
  if (gap >= goneQuietDays * 4) {
    return { grade: 'red', reasons: [`Went ${gap} days without paying at one point`] };
  }
  if (completed === 0) {
    return { grade: 'new', reasons: ['No finished loans yet — nothing to judge on'] };
  }

  const reasons = [];
  if (penalties > 0) reasons.push(`${penalties} late penalty charge(s)`);
  if (avgTerm > 0 && avgDays > avgTerm * 1.25) {
    reasons.push(`Takes ${avgDays} days on average for a ${avgTerm}-day loan`);
  }
  if (gap >= goneQuietDays * 2) reasons.push(`Longest silence was ${gap} days`);

  if (reasons.length) return { grade: 'amber', reasons };
  return {
    grade: 'green',
    reasons: [`${completed} loan(s) finished, never late enough to be penalised`],
  };
}

/**
 * What it looks safe to lend next, rounded to a figure you would actually hand
 * over. Proven payers step up, shaky ones hold, and anyone already near the
 * exposure ceiling is capped by whatever headroom is left.
 *
 * Returns null when there is no track record to reason from.
 */
export function suggestedCeiling(facts, grade, { maxExposure = null } = {}) {
  if (!facts || grade === 'new') return null;

  const largest = Number(facts.largest_completed_principal) || 0;
  const exposure = Number(facts.current_exposure) || 0;

  let base = 0;
  if (grade === 'green') base = largest * 1.5;
  else if (grade === 'amber') base = largest;

  let ceiling = Math.round(base / 500) * 500;
  if (maxExposure != null) {
    ceiling = Math.min(ceiling, Math.max(0, Number(maxExposure) - exposure));
  }
  return ceiling;
}
