-- ============================================================================
-- 0015 — refuse a loan edit that would undercut what's already collected
--
-- update_loan only checked that principal/term were positive. Dropping the
-- principal below what has already been collected slipped through, and
-- replay_loan_payments then re-split every existing payment against the new
-- (smaller) totals with no floor — producing a negative balance and silently
-- reclassifying already-collected principal as "interest earned," which
-- inflates Gross/Net income on the dashboard. Now the new total (principal +
-- interest + whatever penalty still applies) must cover what's already paid.
-- No other logic changes: body is otherwise identical to 0003.
-- ============================================================================

create or replace function public.update_loan(
  p_loan_id uuid,
  p_member_id uuid default null,
  p_principal numeric default null,
  p_term_days integer default null,
  p_start_date date default null,
  p_interest_rate numeric default null,
  p_note text default null
)
returns void
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_old loans;
  v_member uuid;
  v_principal numeric(14, 2);
  v_term integer;
  v_start date;
  v_rate numeric(6, 3);
  v_interest numeric(14, 2);
  v_maturity date;
  v_penalty_applied boolean;
  v_penalty_amount numeric(14, 2);
  v_paid numeric(14, 2);
begin
  select * into v_old from loans where id = p_loan_id for update;
  if not found then
    raise exception 'Loan not found';
  end if;
  if v_old.status = 'written_off' then
    raise exception 'This loan is written off. Reopen it before changing its terms.';
  end if;

  v_member    := coalesce(p_member_id, v_old.member_id);
  v_principal := coalesce(p_principal, v_old.principal);
  v_term      := coalesce(p_term_days, v_old.term_days);
  v_start     := coalesce(p_start_date, v_old.start_date);
  v_rate      := coalesce(p_interest_rate, v_old.interest_rate);

  if v_principal <= 0 then
    raise exception 'Principal must be greater than zero';
  end if;
  if v_term <= 0 then
    raise exception 'Term must be at least one day';
  end if;

  v_interest := round(v_principal * v_rate / 100.0, 2);
  v_maturity := v_start + v_term;

  -- A penalty charged against the old maturity date is not owed if the
  -- corrected loan has not actually matured yet. Clearing the flag also lets
  -- apply_due_penalties() charge it properly once the new date passes.
  v_penalty_applied := v_old.penalty_applied;
  v_penalty_amount  := v_old.penalty_amount;
  if v_old.penalty_applied and v_maturity >= public.biz_today() then
    v_penalty_applied := false;
    v_penalty_amount  := 0;
  end if;

  select coalesce(sum(amount), 0) into v_paid from payments where loan_id = p_loan_id;
  if v_paid > v_principal + v_interest + v_penalty_amount then
    raise exception
      'This loan already has % collected against it. The new terms must total at least that much.',
      to_char(v_paid, 'FM999999990.00');
  end if;

  -- names are snapshotted, not just ids: the trail has to stay readable years
  -- later, even if the member is renamed
  insert into loan_audit (loan_id, action, old_values, new_values)
  values (p_loan_id, 'updated',
          json_build_object('member_id', v_old.member_id,
                            'member_name', (select name from members where id = v_old.member_id),
                            'principal', v_old.principal,
                            'interest_rate', v_old.interest_rate, 'term_days', v_old.term_days,
                            'start_date', v_old.start_date, 'note', v_old.note),
          json_build_object('member_id', v_member,
                            'member_name', (select name from members where id = v_member),
                            'principal', v_principal,
                            'interest_rate', v_rate, 'term_days', v_term,
                            'start_date', v_start, 'note', p_note));

  update loans
  set member_id       = v_member,
      principal       = v_principal,
      interest_rate   = v_rate,
      interest_amount = v_interest,
      term_days       = v_term,
      start_date      = v_start,
      maturity_date   = v_maturity,
      penalty_applied = v_penalty_applied,
      penalty_amount  = v_penalty_amount,
      note            = p_note
  where id = p_loan_id;

  -- payments carry their own member_id for reporting; keep them in step
  if v_member <> v_old.member_id then
    update payments set member_id = v_member where loan_id = p_loan_id;
  end if;

  perform public.replay_loan_payments(p_loan_id);
  perform public.sync_loan_status(p_loan_id);
end;
$$;
