-- ============================================================================
-- 0003 — Correcting and removing loans
--
-- A loan released against the wrong member, or with a fat-fingered principal,
-- previously had no way back: only payments could be corrected. This adds the
-- two missing operations, with the same safety posture as the rest of the book.
--
--   update_loan  re-states the agreed terms and replays the payment history
--                against them, so no split is left over from the old figures.
--   delete_loan  refuses once any collection exists. A loan with payments is
--                history: write it off rather than erase it. Same rule that
--                stops a member with loans from being deleted.
--
-- Both leave a trail in loan_audit, which mirrors payment_audit.
-- ============================================================================

-- loan_id is deliberately not a foreign key: the trail must outlive deletes.
create table if not exists loan_audit (
  id bigserial primary key,
  loan_id uuid not null,
  action text not null check (action in ('updated', 'deleted')),
  old_values jsonb,
  new_values jsonb,
  changed_at timestamptz not null default now(),
  changed_by uuid default auth.uid()
);

create index if not exists loan_audit_loan_idx on loan_audit (loan_id, changed_at desc);

-- ---------------------------------------------------------------------------
-- Correct a loan's terms, or the member it was released to.
--
-- Interest and maturity are recomputed from the corrected figures, then every
-- payment is replayed against them so the principal/interest splits match the
-- loan the member actually has.
--
-- Money and identity fields fall back to their current value when omitted;
-- `note` is replaced outright, so clearing it is possible.
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- Remove a loan that should never have existed. Refuses once money has been
-- collected against it.
-- ---------------------------------------------------------------------------
create or replace function public.delete_loan(p_loan_id uuid, p_reason text default null)
returns void
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_old loans;
  v_payments integer;
begin
  select * into v_old from loans where id = p_loan_id for update;
  if not found then
    raise exception 'Loan not found';
  end if;

  select count(*) into v_payments from payments where loan_id = p_loan_id;
  if v_payments > 0 then
    raise exception
      'This loan has % payment(s) on record, so it cannot be deleted. That history has to stay.',
      v_payments;
  end if;

  insert into loan_audit (loan_id, action, old_values, new_values)
  values (p_loan_id, 'deleted',
          json_build_object('member_id', v_old.member_id,
                            'member_name', (select name from members where id = v_old.member_id),
                            'principal', v_old.principal,
                            'interest_rate', v_old.interest_rate, 'term_days', v_old.term_days,
                            'start_date', v_old.start_date, 'status', v_old.status,
                            'note', v_old.note),
          json_build_object('reason', p_reason));

  -- write_offs cascades with the loan; there are no payments left to worry about
  delete from loans where id = p_loan_id;
end;
$$;

-- ============================================================================
-- Row level security and grants, matching every other table and function
-- ============================================================================
alter table loan_audit enable row level security;

drop policy if exists loan_audit_admin_all on loan_audit;
create policy loan_audit_admin_all on loan_audit
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

revoke all on loan_audit from anon;
grant select, insert, update, delete on loan_audit to authenticated;
grant usage, select on all sequences in schema public to authenticated;

revoke all on function public.update_loan(uuid, uuid, numeric, integer, date, numeric, text)
  from public, anon;
revoke all on function public.delete_loan(uuid, text) from public, anon;

grant execute on function public.update_loan(uuid, uuid, numeric, integer, date, numeric, text)
  to authenticated;
grant execute on function public.delete_loan(uuid, text) to authenticated;
