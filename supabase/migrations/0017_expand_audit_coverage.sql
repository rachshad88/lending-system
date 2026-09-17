-- ============================================================================
-- 0017 — audit coverage for members, loan creation, sign-in and sign-out
--
-- The activity log only ever showed loan edits/deletes and payment changes.
-- Four gaps closed here:
--
--   1. loan_audit only allowed 'updated'/'deleted' — releasing a loan left no
--      trail at all. create_loan() now logs 'created' too.
--   2. Members had no audit trail whatsoever. member_audit + a trigger cover
--      create/update/delete the same way loans already do.
--   3. Sign-ins were already tracked in login_attempts (built for the lockout
--      feature) but never surfaced outside Settings -> Sign-in security.
--   4. Sign-outs were not tracked anywhere. logout_events + log_logout()
--      add that, called from the client right before supabase.auth.signOut().
--
-- list_recent_audit() is rebuilt (dropped first: the return shape changes) to
-- merge all five sources into one feed. It also fixes a real bug found while
-- doing this: the old version inner-joined loan_audit/payment_audit to loans,
-- so a *deleted* loan's own audit trail silently vanished from the feed the
-- moment the loan row was gone. Left joins with a fallback to the snapshotted
-- member name fix that.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Loan creation joins the trail
-- ---------------------------------------------------------------------------
alter table loan_audit drop constraint loan_audit_action_check;
alter table loan_audit add constraint loan_audit_action_check
  check (action in ('created', 'updated', 'deleted'));

create or replace function public.create_loan(
  p_member_id uuid,
  p_principal numeric,
  p_term_days integer default null,
  p_start_date date default null,
  p_interest_rate numeric default null,
  p_note text default null
)
returns uuid
language plpgsql
set search_path = public, pg_temp
as $$
declare
  cfg settings;
  v_term integer;
  v_rate numeric(6, 3);
  v_start date;
  v_interest numeric(14, 2);
  v_loan_id uuid;
begin
  select * into cfg from settings where id = 1;

  v_term := coalesce(p_term_days, cfg.default_term_days);
  v_rate := coalesce(p_interest_rate, cfg.interest_rate);
  v_start := coalesce(p_start_date, public.biz_today());

  if p_principal is null or p_principal <= 0 then
    raise exception 'Principal must be greater than zero';
  end if;
  if v_term <= 0 then
    raise exception 'Term must be at least one day';
  end if;

  v_interest := round(p_principal * v_rate / 100.0, 2);

  insert into loans (member_id, principal, interest_rate, interest_amount, term_days,
                     start_date, maturity_date, penalty_rate, note)
  values (p_member_id, p_principal, v_rate, v_interest, v_term,
          v_start, v_start + v_term, cfg.penalty_rate, p_note)
  returning id into v_loan_id;

  insert into loan_audit (loan_id, action, new_values)
  values (v_loan_id, 'created',
          json_build_object('member_id', p_member_id,
                            'member_name', (select name from members where id = p_member_id),
                            'principal', p_principal,
                            'interest_rate', v_rate, 'term_days', v_term,
                            'start_date', v_start, 'note', p_note));

  return v_loan_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. Members get the same audit trail loans and payments already have
-- ---------------------------------------------------------------------------
create table if not exists member_audit (
  id bigserial primary key,
  member_id uuid not null,
  action text not null check (action in ('created', 'updated', 'deleted')),
  old_values jsonb,
  new_values jsonb,
  changed_at timestamptz not null default now(),
  changed_by uuid default auth.uid()
);

create index if not exists member_audit_member_idx on member_audit (member_id, changed_at desc);

-- Members go through plain table writes (no create/update/delete RPC to hang
-- this off of, unlike loans and payments), so a trigger is the only choke
-- point that sees every write. security definer so it can insert regardless
-- of the grants on member_audit itself, which stays locked to admin reads.
create or replace function public.log_member_audit()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'INSERT' then
    insert into member_audit (member_id, action, new_values) values (new.id, 'created', to_jsonb(new));
    return new;
  elsif tg_op = 'UPDATE' then
    insert into member_audit (member_id, action, old_values, new_values)
    values (new.id, 'updated', to_jsonb(old), to_jsonb(new));
    return new;
  else
    insert into member_audit (member_id, action, old_values) values (old.id, 'deleted', to_jsonb(old));
    return old;
  end if;
end;
$$;

drop trigger if exists members_audit on members;
create trigger members_audit
  after insert or update or delete on members
  for each row execute function public.log_member_audit();

alter table member_audit enable row level security;

drop policy if exists member_audit_admin_read on member_audit;
create policy member_audit_admin_read on member_audit
  for select to authenticated using (public.is_admin());

revoke all on member_audit from anon;
grant select on member_audit to authenticated;
revoke all on function public.log_member_audit() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3 & 4. Sign-out gets the same treatment sign-in already has
-- ---------------------------------------------------------------------------
create table if not exists logout_events (
  id bigserial primary key,
  user_id uuid,
  email text,
  logged_out_at timestamptz not null default now()
);

-- security definer, like verify_admin_login: the table stays closed to
-- authenticated so nobody can backdate or forge a sign-out for someone else.
create or replace function public.log_logout()
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into logout_events (user_id, email) values (auth.uid(), auth.jwt() ->> 'email');
end;
$$;

alter table logout_events enable row level security;

drop policy if exists logout_events_admin_read on logout_events;
create policy logout_events_admin_read on logout_events
  for select to authenticated using (public.is_admin());

revoke all on logout_events from anon, authenticated;
grant select on logout_events to authenticated;
revoke all on function public.log_logout() from public, anon;
grant execute on function public.log_logout() to authenticated;

-- ---------------------------------------------------------------------------
-- One feed: loans, payments, members, sign-ins and sign-outs
-- ---------------------------------------------------------------------------
drop function if exists public.list_recent_audit(integer);

create function public.list_recent_audit(p_limit integer default 200)
returns table (
  id bigint,
  source text,
  action text,
  loan_id uuid,
  member_id uuid,
  label text,
  old_values jsonb,
  new_values jsonb,
  changed_at timestamptz
)
language sql
stable
set search_path = public, pg_temp
as $$
  select id, source, action, loan_id, member_id, label, old_values, new_values, changed_at
  from (
    select la.id, 'loan'::text as source, la.action, la.loan_id,
           coalesce(l.member_id, nullif(la.old_values ->> 'member_id', '')::uuid,
                     nullif(la.new_values ->> 'member_id', '')::uuid) as member_id,
           coalesce(m.name, la.old_values ->> 'member_name', la.new_values ->> 'member_name') as label,
           la.old_values, la.new_values, la.changed_at
    from loan_audit la
    left join loans l on l.id = la.loan_id
    left join members m on m.id = l.member_id

    union all

    select pa.id, 'payment'::text as source, pa.action, pa.loan_id, l.member_id,
           coalesce(m.name, 'Deleted loan') as label,
           pa.old_values, pa.new_values, pa.changed_at
    from payment_audit pa
    left join loans l on l.id = pa.loan_id
    left join members m on m.id = l.member_id

    union all

    select ma.id, 'member'::text as source, ma.action, null::uuid as loan_id, ma.member_id,
           coalesce(ma.new_values ->> 'name', ma.old_values ->> 'name') as label,
           ma.old_values, ma.new_values, ma.changed_at
    from member_audit ma

    union all

    select att.id, 'login'::text as source, att.outcome as action, null::uuid, null::uuid,
           att.email as label,
           null::jsonb as old_values,
           jsonb_build_object('ip', att.ip, 'user_agent', att.user_agent) as new_values,
           att.attempted_at as changed_at
    from login_attempts att

    union all

    select lo.id, 'logout'::text as source, 'signed_out'::text as action, null::uuid, null::uuid,
           lo.email as label,
           null::jsonb, null::jsonb,
           lo.logged_out_at as changed_at
    from logout_events lo
  ) combined
  order by changed_at desc
  limit p_limit;
$$;

revoke all on function public.list_recent_audit(integer) from public, anon;
grant execute on function public.list_recent_audit(integer) to authenticated;
