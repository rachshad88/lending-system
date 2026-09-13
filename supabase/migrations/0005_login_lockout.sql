-- ============================================================================
-- 0005 — Sign-in lockout
--
-- The browser used to hand the password straight to Supabase Auth with the
-- public key, so anyone could script guesses against /auth/v1/token and nothing
-- would ever say stop. The Free plan has no password-verification hook, so the
-- check moves here instead:
--
--   admin_credentials   the real password hash, readable by nobody but the
--                       functions below. Supabase Auth's own copy is replaced
--                       with random bytes, so guessing against Auth directly
--                       can never succeed.
--   verify_admin_login  checks the lock, the password and the counter in one
--                       row-locked transaction. Five misses pause sign-in for
--                       15 minutes, then 1 hour, then 24 hours.
--   login_attempts      every try, kept 90 days, shown on the Settings page.
--
-- Only the admin-auth Edge Function (service role) may call these.
-- ============================================================================

create table if not exists admin_credentials (
  user_id uuid primary key references auth.users (id) on delete cascade,
  password_hash text not null,
  updated_at timestamptz not null default now()
);

create table if not exists login_throttle (
  email text primary key,
  fail_count integer not null default 0,
  lock_level integer not null default 0,
  locked_until timestamptz,
  last_failed_at timestamptz
);

create table if not exists login_attempts (
  id bigserial primary key,
  email text not null,
  user_id uuid,
  outcome text not null check (outcome in ('ok', 'bad_password', 'locked')),
  ip text,
  user_agent text,
  attempted_at timestamptz not null default now()
);

create index if not exists login_attempts_at_idx on login_attempts (attempted_at desc);

-- ---------------------------------------------------------------------------
-- One password check. Unknown emails are counted and locked exactly like the
-- real one, and still pay for a bcrypt round, so neither the response nor its
-- timing reveals which address is the admin's.
-- ---------------------------------------------------------------------------
create or replace function public.verify_admin_login(
  p_email text,
  p_password text,
  p_ip text default null,
  p_user_agent text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  c_max_failures constant integer := 5;
  v_email text := lower(trim(coalesce(p_email, '')));
  v_ip text := left(p_ip, 64);
  v_agent text := left(p_user_agent, 200);
  v_throttle login_throttle;
  v_user_id uuid;
  v_auth_email text;
  v_hash text;
  v_lock interval;
begin
  if v_email = '' or p_password is null then
    raise exception 'Email and password are required';
  end if;

  insert into login_throttle (email) values (v_email) on conflict (email) do nothing;
  -- the row lock serialises attempts per email, so parallel requests cannot
  -- sneak in extra guesses between the check and the counter update
  select * into v_throttle from login_throttle where email = v_email for update;

  -- a full quiet day after the last miss (or after the last lock ended)
  -- forgives the history
  if coalesce(v_throttle.locked_until, v_throttle.last_failed_at) < now() - interval '24 hours' then
    v_throttle.fail_count := 0;
    v_throttle.lock_level := 0;
  end if;

  if v_throttle.locked_until > now() then
    insert into login_attempts (email, outcome, ip, user_agent)
    values (v_email, 'locked', v_ip, v_agent);
    return jsonb_build_object(
      'status', 'locked',
      'retry_after_seconds', ceil(extract(epoch from v_throttle.locked_until - now()))::integer
    );
  end if;

  select u.id, u.email, c.password_hash
  into v_user_id, v_auth_email, v_hash
  from auth.users u
  join admin_users a on a.user_id = u.id
  join admin_credentials c on c.user_id = u.id
  where lower(u.email) = v_email
  limit 1;

  if v_hash is not null and extensions.crypt(p_password, v_hash) = v_hash then
    update login_throttle
    set fail_count = 0, lock_level = 0, locked_until = null
    where email = v_email;

    insert into login_attempts (email, user_id, outcome, ip, user_agent)
    values (v_email, v_user_id, 'ok', v_ip, v_agent);

    delete from login_attempts where attempted_at < now() - interval '90 days';
    delete from login_throttle
    where coalesce(locked_until, last_failed_at) < now() - interval '30 days';

    return jsonb_build_object('status', 'ok', 'user_id', v_user_id, 'email', v_auth_email);
  end if;

  if v_hash is null then
    perform extensions.crypt(p_password, extensions.gen_salt('bf', 10));
  end if;

  insert into login_attempts (email, user_id, outcome, ip, user_agent)
  values (v_email, v_user_id, 'bad_password', v_ip, v_agent);

  v_throttle.fail_count := v_throttle.fail_count + 1;

  if v_throttle.fail_count >= c_max_failures then
    v_throttle.lock_level := v_throttle.lock_level + 1;
    v_lock := case v_throttle.lock_level
                when 1 then interval '15 minutes'
                when 2 then interval '1 hour'
                else interval '24 hours'
              end;

    update login_throttle
    set fail_count = 0,
        lock_level = v_throttle.lock_level,
        locked_until = now() + v_lock,
        last_failed_at = now()
    where email = v_email;

    return jsonb_build_object(
      'status', 'locked',
      'retry_after_seconds', extract(epoch from v_lock)::integer
    );
  end if;

  update login_throttle
  set fail_count = v_throttle.fail_count,
      lock_level = v_throttle.lock_level,
      locked_until = null,
      last_failed_at = now()
  where email = v_email;

  return jsonb_build_object(
    'status', 'invalid',
    'attempts_left', c_max_failures - v_throttle.fail_count,
    'next_lock_seconds', case v_throttle.lock_level + 1
                           when 1 then 900
                           when 2 then 3600
                           else 86400
                         end
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Sets the admin's password. Called by admin-auth after it has re-checked the
-- current one, or by hand from the SQL Editor when the password is forgotten.
-- ---------------------------------------------------------------------------
create or replace function public.set_admin_password(p_user_id uuid, p_new_password text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if p_new_password is null or length(p_new_password) < 8 or length(p_new_password) > 128 then
    raise exception 'Password must be 8 to 128 characters';
  end if;
  if not exists (select 1 from admin_users where user_id = p_user_id) then
    raise exception 'Not an admin account';
  end if;

  insert into admin_credentials (user_id, password_hash, updated_at)
  values (p_user_id, extensions.crypt(p_new_password, extensions.gen_salt('bf', 10)), now())
  on conflict (user_id) do update
    set password_hash = excluded.password_hash, updated_at = now();
end;
$$;

-- ---------------------------------------------------------------------------
-- Whoever is added to admin_users gets the same protection automatically: the
-- password they were created with moves here, and Auth keeps random bytes.
-- Auth's copy is only replaced once ours exists, so an account can never be
-- left with no working password.
-- ---------------------------------------------------------------------------
create or replace function public.protect_admin_credentials()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into admin_credentials (user_id, password_hash)
  select u.id, u.encrypted_password
  from auth.users u
  where u.id = new.user_id and coalesce(u.encrypted_password, '') <> ''
  on conflict (user_id) do nothing;

  update auth.users
  set encrypted_password = extensions.crypt(
        encode(extensions.gen_random_bytes(32), 'hex'), extensions.gen_salt('bf'))
  where id = new.user_id
    and exists (select 1 from admin_credentials c where c.user_id = new.user_id);

  return new;
end;
$$;

drop trigger if exists admin_users_protect_credentials on admin_users;
create trigger admin_users_protect_credentials
  after insert on admin_users
  for each row execute function public.protect_admin_credentials();

-- the admin that already exists
insert into admin_credentials (user_id, password_hash)
select u.id, u.encrypted_password
from auth.users u
join admin_users a on a.user_id = u.id
where coalesce(u.encrypted_password, '') <> ''
on conflict (user_id) do nothing;

update auth.users u
set encrypted_password = extensions.crypt(
      encode(extensions.gen_random_bytes(32), 'hex'), extensions.gen_salt('bf'))
where exists (select 1 from admin_credentials c where c.user_id = u.id);

-- ============================================================================
-- Row level security and grants
-- ============================================================================
alter table admin_credentials enable row level security;
alter table login_throttle enable row level security;
alter table login_attempts enable row level security;

revoke all on admin_credentials, login_throttle, login_attempts from anon, authenticated;
grant select on login_throttle, login_attempts to authenticated;

drop policy if exists login_throttle_admin_read on login_throttle;
create policy login_throttle_admin_read on login_throttle
  for select to authenticated using (public.is_admin());

drop policy if exists login_attempts_admin_read on login_attempts;
create policy login_attempts_admin_read on login_attempts
  for select to authenticated using (public.is_admin());

revoke all on function public.verify_admin_login(text, text, text, text) from public, anon, authenticated;
revoke all on function public.set_admin_password(uuid, text) from public, anon, authenticated;
revoke all on function public.protect_admin_credentials() from public, anon, authenticated;

grant execute on function public.verify_admin_login(text, text, text, text) to service_role;
grant execute on function public.set_admin_password(uuid, text) to service_role;
