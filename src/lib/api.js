import { supabase } from './supabase';
import { addDays, sanitizeSearch, todayISO } from './format';

function unwrap({ data, error }) {
  if (error) throw new Error(error.message);
  return data;
}

/* ------------------------------------------------------------------ stats */

export async function getKpis() {
  return unwrap(await supabase.rpc('dashboard_kpis'));
}

export async function getPeriodStats(from, to) {
  return unwrap(await supabase.rpc('period_stats', { p_from: from, p_to: to }));
}

export async function getIncomeSeries(from, to, granularity = 'day') {
  return unwrap(
    await supabase.rpc('income_series', {
      p_from: from,
      p_to: to,
      p_granularity: granularity,
    })
  );
}

/** Scheduled vs. collected, bucketed by day, week or month. */
export async function getAmortizationSeries(from, to, granularity = 'day') {
  return unwrap(
    await supabase.rpc('amortization_series', {
      p_from: from,
      p_to: to,
      p_granularity: granularity,
    })
  );
}

/** Applies overdue penalties and flags write-off candidates. Safe to re-run. */
export async function runMaintenance() {
  return unwrap(await supabase.rpc('run_maintenance'));
}

// Pages kick this off on load. One pass per browser session is enough, so
// revisiting the dashboard or clicking through the risk tabs no longer pays for
// a fresh write round trip each time.
let maintenancePass = null;
export function ensureMaintenance() {
  maintenancePass ??= runMaintenance().catch(() => null);
  return maintenancePass;
}

/* --------------------------------------------------------------- sign-in */

export async function getLoginActivity(limit = 20) {
  return unwrap(
    await supabase
      .from('login_attempts')
      .select('id, email, outcome, ip, attempted_at')
      .order('attempted_at', { ascending: false })
      .limit(limit)
  );
}

/** Accounts currently paused or partway to a pause. */
export async function getLoginThrottle() {
  return unwrap(
    await supabase
      .from('login_throttle')
      .select('email, fail_count, lock_level, locked_until, last_failed_at')
      .or(`locked_until.gt.${new Date().toISOString()},fail_count.gt.0`)
      .order('last_failed_at', { ascending: false, nullsFirst: false })
      .limit(10)
  );
}

/* ------------------------------------------------------------------- risk */

/** Share of money on the street that has gone quiet, by value. */
export async function getPortfolioAtRisk() {
  const rows = unwrap(await supabase.rpc('portfolio_at_risk'));
  return Array.isArray(rows) ? (rows[0] ?? null) : rows;
}

/** A member's track record across every loan they have ever taken. */
export async function getMemberReliability(memberId) {
  const rows = unwrap(await supabase.rpc('member_reliability', { p_member_id: memberId }));
  return Array.isArray(rows) ? (rows[0] ?? null) : rows;
}

/**
 * The same grading facts as `getMemberReliability`, for many members in one
 * round trip — used to badge a page of the Members list. A member with no
 * loans yet is simply absent from the result.
 */
export async function getMemberReliabilityBulk(memberIds) {
  if (!memberIds.length) return new Map();
  const rows = unwrap(
    await supabase.rpc('member_reliability_bulk', { p_member_ids: memberIds })
  );
  return new Map(rows.map((row) => [row.member_id, row]));
}

/**
 * Live loans with nothing collected for `minDays`, quietest first. Ordering by
 * last_payment_date ascending is the same ranking as days-since-payment
 * descending, so the view needs no extra column. A loan that has never paid
 * sorts first, measured from its release date instead.
 */
export async function listGoneQuiet({ minDays = 3, limit = 8 } = {}) {
  const cutoff = addDays(todayISO(), -minDays);
  return unwrap(
    await supabase
      .from('loan_balances')
      .select(
        'loan_id, member_id, member_name, contact_number, toda, balance, daily_due, arrears, ' +
          'last_payment_date, start_date, maturity_date, is_overdue'
      )
      .eq('status', 'active')
      .gt('balance', 0)
      .or(`last_payment_date.lte.${cutoff},and(last_payment_date.is.null,start_date.lte.${cutoff})`)
      .order('last_payment_date', { ascending: true, nullsFirst: true })
      .limit(limit)
  );
}

/* ---------------------------------------------------------------- members */

export async function listMembers({ search = '', page = 1, pageSize = 20 } = {}) {
  const from = (page - 1) * pageSize;
  let query = supabase
    .from('members')
    .select('id, name, contact_number, toda, vehicle_number, address, created_at', {
      count: 'exact',
    })
    .order('created_at', { ascending: false })
    .range(from, from + pageSize - 1);

  const term = sanitizeSearch(search);
  if (term) {
    query = query.or(
      `name.ilike.%${term}%,contact_number.ilike.%${term}%,vehicle_number.ilike.%${term}%,toda.ilike.%${term}%`
    );
  }

  const { data, error, count } = await query;
  if (error) throw new Error(error.message);
  return { rows: data ?? [], total: count ?? 0 };
}

/** Name-ordered id/name/toda only — for the member dropdown when releasing a loan. */
export async function listMemberOptions() {
  return unwrap(await supabase.from('members').select('id, name, toda').order('name'));
}

export async function getMember(id) {
  return unwrap(await supabase.from('members').select('*').eq('id', id).single());
}

export async function createMember(values) {
  return unwrap(await supabase.from('members').insert(values).select('id').single());
}

export async function updateMember(id, values) {
  return unwrap(await supabase.from('members').update(values).eq('id', id).select('id').single());
}

export async function deleteMember(id) {
  const { error } = await supabase.from('members').delete().eq('id', id);
  if (error) {
    // the loans foreign key is intentionally RESTRICT
    if (error.code === '23503') {
      throw new Error('This member still has loans on record, so they cannot be deleted.');
    }
    throw new Error(error.message);
  }
}

/* ------------------------------------------------------------------ loans */

const LOAN_FIELDS =
  'loan_id, member_id, member_name, contact_number, toda, principal, interest_rate, ' +
  'interest_amount, penalty_amount, penalty_applied, term_days, start_date, maturity_date, ' +
  'status, total_obligation, paid_total, paid_principal, paid_interest, paid_penalty, ' +
  'payments_count, last_payment_date, balance, principal_balance, daily_due, ' +
  'arrears, days_past_maturity, is_overdue, paid_today';

/** Loans still owing money — for the dashboard's "record a payment" picker. */
export async function listOpenLoanOptions() {
  return unwrap(
    await supabase
      .from('loan_balances')
      .select('loan_id, member_name, toda, balance, daily_due, arrears')
      .eq('status', 'active')
      .gt('balance', 0)
      .order('member_name')
  );
}

export async function listLoans({
  search = '',
  status = 'active',
  view = 'all',
  sort = 'default',
  page = 1,
  pageSize = 20,
} = {}) {
  const from = (page - 1) * pageSize;
  let query = supabase.from('loan_balances').select(LOAN_FIELDS, { count: 'exact' });

  if (status !== 'all') query = query.eq('status', status);
  if (view === 'overdue') query = query.eq('is_overdue', true);
  if (view === 'arrears') query = query.gt('arrears', 0);
  if (view === 'unpaid_today') {
    query = query.eq('paid_today', false).eq('status', 'active').gt('balance', 0);
  }
  if (view === 'paid_today') query = query.eq('paid_today', true);

  const term = sanitizeSearch(search);
  if (term) {
    query = query.or(`member_name.ilike.%${term}%,toda.ilike.%${term}%`);
  }

  // oldest last payment first is the same ranking as longest silence first,
  // and a loan that has never paid sorts above every loan that has
  if (sort === 'quiet') {
    query = query.order('last_payment_date', { ascending: true, nullsFirst: true });
  } else if (sort === 'arrears' || view === 'arrears' || view === 'overdue') {
    query = query.order('arrears', { ascending: false });
  } else {
    query = query.order('start_date', { ascending: false });
  }

  const { data, error, count } = await query.range(from, from + pageSize - 1);
  if (error) throw new Error(error.message);
  return { rows: data ?? [], total: count ?? 0 };
}

/**
 * The balances view carries no `note`, so it is read from the loans table and
 * merged in — the edit form prefills from it.
 */
export async function getLoan(loanId) {
  const [loan, terms] = await Promise.all([
    supabase.from('loan_balances').select(LOAN_FIELDS).eq('loan_id', loanId).single(),
    supabase.from('loans').select('note').eq('id', loanId).single(),
  ]);
  return { ...unwrap(loan), note: unwrap(terms).note };
}

export async function getMemberLoans(memberId) {
  return unwrap(
    await supabase
      .from('loan_balances')
      .select(LOAN_FIELDS)
      .eq('member_id', memberId)
      .order('start_date', { ascending: false })
  );
}

export async function createLoan({ memberId, principal, termDays, startDate, note }) {
  return unwrap(
    await supabase.rpc('create_loan', {
      p_member_id: memberId,
      p_principal: principal,
      p_term_days: termDays,
      p_start_date: startDate,
      p_note: note || null,
    })
  );
}

/** Corrects the agreed terms, then replays the loan's payments against them. */
export async function updateLoan({ loanId, memberId, principal, termDays, startDate, note }) {
  return unwrap(
    await supabase.rpc('update_loan', {
      p_loan_id: loanId,
      p_member_id: memberId ?? null,
      p_principal: principal,
      p_term_days: termDays,
      p_start_date: startDate,
      p_note: note || null,
    })
  );
}

/** Only possible while no payment has been collected against the loan. */
export async function deleteLoan(loanId, reason) {
  return unwrap(await supabase.rpc('delete_loan', { p_loan_id: loanId, p_reason: reason || null }));
}

export async function getLoanAudit(loanId) {
  return unwrap(
    await supabase
      .from('loan_audit')
      .select('id, loan_id, action, old_values, new_values, changed_at')
      .eq('loan_id', loanId)
      .order('changed_at', { ascending: false })
  );
}

/* --------------------------------------------------------------- payments */

export async function getLoanPayments(loanId) {
  return unwrap(
    await supabase
      .from('payments')
      .select(
        'id, amount, principal_portion, interest_portion, penalty_portion, payment_date, note, created_at'
      )
      .eq('loan_id', loanId)
      .order('payment_date', { ascending: false })
      .order('created_at', { ascending: false })
  );
}

export async function recordPayment({ loanId, amount, paymentDate, note }) {
  return unwrap(
    await supabase.rpc('record_payment', {
      p_loan_id: loanId,
      p_amount: amount,
      p_payment_date: paymentDate,
      p_note: note || null,
    })
  );
}

export async function updatePayment({ paymentId, amount, paymentDate, note }) {
  return unwrap(
    await supabase.rpc('update_payment', {
      p_payment_id: paymentId,
      p_amount: amount,
      p_payment_date: paymentDate,
      p_note: note || null,
    })
  );
}

export async function deletePayment(paymentId, reason) {
  return unwrap(
    await supabase.rpc('delete_payment', { p_payment_id: paymentId, p_reason: reason || null })
  );
}

export async function getPaymentAudit(loanId) {
  return unwrap(
    await supabase
      .from('payment_audit')
      .select('id, payment_id, action, old_values, new_values, changed_at')
      .eq('loan_id', loanId)
      .order('changed_at', { ascending: false })
  );
}

/** Every loan/payment edit and deletion across the whole book, newest first. */
export async function getRecentAudit(limit = 200) {
  return unwrap(await supabase.rpc('list_recent_audit', { p_limit: limit }));
}

/* ------------------------------------------------------------- write-offs */

export async function listWriteOffs(status = 'flagged') {
  let query = supabase
    .from('write_offs')
    .select(
      'id, loan_id, flagged_at, days_overdue_at_flag, balance_at_flag, status, ' +
        'principal_loss, balance_loss, resolved_at, reason'
    )
    .order('flagged_at', { ascending: false });

  if (status !== 'all') query = query.eq('status', status);

  const rows = unwrap(await query);
  if (!rows.length) return [];

  // one extra round trip instead of one per row
  const loans = unwrap(
    await supabase
      .from('loan_balances')
      .select(LOAN_FIELDS)
      .in(
        'loan_id',
        rows.map((r) => r.loan_id)
      )
  );
  const byId = new Map(loans.map((l) => [l.loan_id, l]));
  return rows.map((row) => ({ ...row, loan: byId.get(row.loan_id) ?? null }));
}

export async function confirmWriteOff(loanId, reason) {
  return unwrap(await supabase.rpc('confirm_write_off', { p_loan_id: loanId, p_reason: reason }));
}

export async function dismissWriteOff(loanId, reason) {
  return unwrap(
    await supabase.rpc('dismiss_write_off', { p_loan_id: loanId, p_reason: reason || null })
  );
}

export async function reopenLoan(loanId) {
  return unwrap(await supabase.rpc('reopen_loan', { p_loan_id: loanId }));
}

/* --------------------------------------------------------------- settings */

export async function getSettings() {
  return unwrap(await supabase.from('settings').select('*').eq('id', 1).single());
}

// One row that changes maybe monthly, read by five different screens. Cache it
// for the session rather than paying a round trip on every navigation.
let settingsPromise = null;

export function getSettingsCached() {
  // A failure must not be cached, or every screen keeps replaying it and the
  // "Try again" buttons have nothing to retry.
  settingsPromise ??= getSettings().catch((err) => {
    settingsPromise = null;
    throw err;
  });
  return settingsPromise;
}

/** Best-effort business name for a PDF/Excel letterhead — never throws. */
export async function getBusinessName() {
  const settings = await getSettingsCached().catch(() => null);
  return settings?.business_name;
}

export async function updateSettings(values) {
  const data = unwrap(
    await supabase
      .from('settings')
      .update({ ...values, updated_at: new Date().toISOString() })
      .eq('id', 1)
      .select('*')
      .single()
  );
  settingsPromise = Promise.resolve(data);
  return data;
}

/* --------------------------------------------------------------- cash count */

/** The saved close for a business day, or null if it hasn't been closed yet. */
export async function getCashReconciliation(businessDate) {
  const { data, error } = await supabase
    .from('cash_reconciliations')
    .select('business_date, expected_amount, counted_amount, difference, note, closed_at')
    .eq('business_date', businessDate)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

/** Closes (or re-closes) a business day against what `payments` says came in. */
export async function closeCashDay({ businessDate, countedAmount, note }) {
  return unwrap(
    await supabase.rpc('close_cash_day', {
      p_business_date: businessDate,
      p_counted_amount: countedAmount,
      p_note: note || null,
    })
  );
}

/** Past days with payments but no cash close, newest first. Today is excluded. */
export async function listUnclosedCashDays() {
  return unwrap(await supabase.rpc('unclosed_cash_days'));
}

export async function listCashReconciliations({ limit = 30 } = {}) {
  return unwrap(
    await supabase
      .from('cash_reconciliations')
      .select('business_date, expected_amount, counted_amount, difference, note, closed_at')
      .order('business_date', { ascending: false })
      .limit(limit)
  );
}

/* ---------------------------------------------------------------- reports */

/** Everyone the collector should visit: active loans still owing, grouped by TODA. */
export async function listRouteSheetLoans() {
  return unwrap(
    await supabase
      .from('loan_balances')
      .select('loan_id, member_name, contact_number, toda, daily_due, arrears, balance, is_overdue')
      .eq('status', 'active')
      .gt('balance', 0)
      .order('toda', { ascending: true, nullsFirst: false })
      .order('member_name')
  );
}

export async function reportMembers() {
  return unwrap(
    await supabase
      .from('members')
      .select(
        'name, contact_number, address, toda, vehicle_number, collateral, spouse_name, referred_by, created_at'
      )
      .order('name')
  );
}

export async function reportLoans({ from, to, status = 'all' } = {}) {
  let query = supabase.from('loan_balances').select(LOAN_FIELDS).order('start_date');
  if (from) query = query.gte('start_date', from);
  if (to) query = query.lte('start_date', to);
  if (status !== 'all') query = query.eq('status', status);
  return unwrap(await query);
}

export async function reportPayments({ from, to } = {}) {
  let query = supabase
    .from('payments')
    .select(
      'payment_date, amount, principal_portion, interest_portion, penalty_portion, note, ' +
        'members(name, toda), loan_id'
    )
    .order('payment_date');
  if (from) query = query.gte('payment_date', from);
  if (to) query = query.lte('payment_date', to);
  return unwrap(await query);
}
