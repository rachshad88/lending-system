-- ============================================================================
-- 0014 — reject future-dated payments
--
-- record_payment/update_payment took any payment_date the caller sent, with no
-- check against today. A typo'd year (2027 instead of 2026) was silently
-- accepted and then read back as a 271-day silent stretch, wrongly flagging a
-- brand-new borrower as high risk. Both functions now reject a payment date
-- after biz_today(). No other logic changes: bodies are otherwise identical
-- to the versions in 0002.
-- ============================================================================

create or replace function public.record_payment(
  p_loan_id uuid,
  p_amount numeric,
  p_payment_date date default null,
  p_note text default null
)
returns json
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_loan loans;
  v_paid numeric(14, 2);
  v_balance numeric(14, 2);
  v_date date := coalesce(p_payment_date, public.biz_today());
  alloc record;
  v_payment_id uuid;
  v_result json;
begin
  select * into v_loan from loans where id = p_loan_id for update;
  if not found then
    raise exception 'Loan not found';
  end if;
  if v_loan.status = 'written_off' then
    raise exception 'This loan is written off. Reopen it before recording payments.';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'Payment amount must be greater than zero';
  end if;
  if v_date > public.biz_today() then
    raise exception 'Payment date cannot be in the future';
  end if;

  select coalesce(sum(amount), 0) into v_paid from payments where loan_id = p_loan_id;
  v_balance := v_loan.principal + v_loan.interest_amount + v_loan.penalty_amount - v_paid;

  if v_balance <= 0 then
    raise exception 'This loan is already fully paid';
  end if;
  if p_amount > v_balance then
    raise exception 'Amount exceeds the remaining balance. Full payoff is %',
      to_char(v_balance, 'FM999999990.00');
  end if;

  select * into alloc from public.split_payment(p_loan_id, p_amount);

  insert into payments (loan_id, member_id, amount, principal_portion, interest_portion,
                        penalty_portion, payment_date, note)
  values (p_loan_id, v_loan.member_id, p_amount, alloc.principal_part, alloc.interest_part,
          alloc.penalty_part, v_date, p_note)
  returning id into v_payment_id;

  perform public.sync_loan_status(p_loan_id);

  select json_build_object(
           'id', p.id, 'amount', p.amount, 'principal_portion', p.principal_portion,
           'interest_portion', p.interest_portion, 'penalty_portion', p.penalty_portion,
           'payment_date', p.payment_date, 'balance_after', v_balance - p.amount
         )
  into v_result
  from payments p where p.id = v_payment_id;

  insert into payment_audit (payment_id, loan_id, action, new_values)
  values (v_payment_id, p_loan_id, 'created', v_result);

  return v_result;
end;
$$;

create or replace function public.update_payment(
  p_payment_id uuid,
  p_amount numeric,
  p_payment_date date default null,
  p_note text default null
)
returns json
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_old payments;
  v_loan loans;
  v_obligation numeric(14, 2);
  v_other_payments numeric(14, 2);
  v_date date;
  v_new json;
begin
  select * into v_old from payments where id = p_payment_id for update;
  if not found then
    raise exception 'Payment not found';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'Payment amount must be greater than zero';
  end if;

  v_date := coalesce(p_payment_date, v_old.payment_date);
  if v_date > public.biz_today() then
    raise exception 'Payment date cannot be in the future';
  end if;

  select * into v_loan from loans where id = v_old.loan_id;
  v_obligation := v_loan.principal + v_loan.interest_amount + v_loan.penalty_amount;

  select coalesce(sum(amount), 0) into v_other_payments
  from payments where loan_id = v_old.loan_id and id <> p_payment_id;

  if v_other_payments + p_amount > v_obligation then
    raise exception 'That amount would overpay the loan. Most it can be is %',
      to_char(v_obligation - v_other_payments, 'FM999999990.00');
  end if;

  update payments
  set amount = p_amount,
      payment_date = v_date,
      note = p_note
  where id = p_payment_id;

  perform public.replay_loan_payments(v_old.loan_id);
  perform public.sync_loan_status(v_old.loan_id);

  select json_build_object(
           'id', p.id, 'amount', p.amount, 'principal_portion', p.principal_portion,
           'interest_portion', p.interest_portion, 'penalty_portion', p.penalty_portion,
           'payment_date', p.payment_date, 'note', p.note
         )
  into v_new
  from payments p where p.id = p_payment_id;

  insert into payment_audit (payment_id, loan_id, action, old_values, new_values)
  values (p_payment_id, v_old.loan_id, 'updated',
          json_build_object('amount', v_old.amount, 'payment_date', v_old.payment_date,
                            'note', v_old.note,
                            'principal_portion', v_old.principal_portion,
                            'interest_portion', v_old.interest_portion,
                            'penalty_portion', v_old.penalty_portion),
          v_new);

  return v_new;
end;
$$;
