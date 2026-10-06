-- Invite-only beta and referral codes.
--
-- While the beta is invite-only, a signed-in account can open Silktone but
-- cannot dictate until it is let in: by requesting access in the app (see
-- 20261006180000_beta_access_requests.sql) or by redeeming a referral code
-- the owner gave them. Either gives the beta plan: full access until the beta
-- ends. A code works once, for one account.
--
-- Owner controls (Supabase SQL editor):
--   update public.beta_program set invite_only = true where id;  -- lock accounts without access
--   select * from public.silktone_create_beta_codes(5);          -- referral codes to hand out
--   update public.beta_program set ends_at = now() where id;     -- end the beta

alter table public.profiles drop constraint profiles_plan_check;
alter table public.profiles add constraint profiles_plan_check
  check (plan in ('trial', 'paid', 'free_forever', 'beta'));

-- One row of switches. Everything starts off, so applying this migration
-- changes nothing for current users until the owner turns it on.
create table public.beta_program (
  id boolean primary key default true check (id),
  -- Accounts without beta, paid or free access cannot dictate.
  invite_only boolean not null default false,
  -- Once reached, beta accounts lose free access and invite_only stops.
  ends_at timestamptz
);
insert into public.beta_program default values;

alter table public.beta_program enable row level security;
revoke all on public.beta_program from anon, authenticated;

create table public.beta_codes (
  code text primary key,
  -- Who the code was given to; filled in by the owner, optional.
  label text,
  created_at timestamptz not null default now(),
  redeemed_by uuid unique references public.profiles (id) on delete set null,
  redeemed_at timestamptz
);

alter table public.beta_codes enable row level security;
revoke all on public.beta_codes from anon, authenticated;

-- A new, unique code like SILK-7KQ2-M9XD (no 0/O, 1/I/L).
create function public.silktone_make_beta_code()
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  alphabet constant text := '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
  bytes bytea;
  chars text;
  new_code text;
  j integer;
begin
  loop
    bytes := extensions.gen_random_bytes(8);
    chars := '';
    for j in 0..7 loop
      chars := chars || substr(alphabet, get_byte(bytes, j) % length(alphabet) + 1, 1);
    end loop;
    new_code := 'SILK-' || substr(chars, 1, 4) || '-' || substr(chars, 5, 4);
    insert into public.beta_codes (code) values (new_code)
    on conflict (code) do nothing;
    exit when found;
  end loop;
  return new_code;
end;
$$;

revoke all on function public.silktone_make_beta_code() from public, anon, authenticated;

-- Owner only: referral codes to hand out.
create function public.silktone_create_beta_codes(how_many integer default 1)
returns table (code text)
language plpgsql
volatile
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  i integer;
begin
  for i in 1..how_many loop
    code := public.silktone_make_beta_code();
    return next;
  end loop;
end;
$$;

revoke all on function public.silktone_create_beta_codes(integer) from public, anon, authenticated;

create function public.silktone_beta_is_open()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select ends_at is null or ends_at > now() from public.beta_program), false);
$$;

revoke all on function public.silktone_beta_is_open() from public, anon;
grant execute on function public.silktone_beta_is_open() to authenticated;

-- Accounts without access are locked while the beta is open and invite-only.
create function public.silktone_beta_invite_only()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select invite_only and (ends_at is null or ends_at > now()) from public.beta_program),
    false
  );
$$;

revoke all on function public.silktone_beta_invite_only() from public, anon;
grant execute on function public.silktone_beta_invite_only() to authenticated;

-- The app calls this with a typed or copied code. Answers {"ok": true} or
-- {"ok": false, "error": "invalid" | "used" | "beta_over" | "not_needed" |
-- "banned" | "not_signed_in"}.
create function public.silktone_redeem_beta_code(invite_code text)
returns json
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  -- Compare without dashes, spaces or case, however the code was typed.
  wanted text := upper(regexp_replace(coalesce(invite_code, ''), '[^A-Za-z0-9]', '', 'g'));
  program public.beta_program%rowtype;
  invite public.beta_codes%rowtype;
  profile public.profiles%rowtype;
begin
  if me is null then
    return json_build_object('ok', false, 'error', 'not_signed_in');
  end if;

  -- Locking the program row serialises redemptions, so two people pressing
  -- Submit at the same moment cannot both use one code.
  select * into program from public.beta_program for update;
  if program.ends_at is not null and program.ends_at <= now() then
    return json_build_object('ok', false, 'error', 'beta_over');
  end if;

  select * into profile from public.profiles where id = me;
  if not found then
    return json_build_object('ok', false, 'error', 'not_signed_in');
  end if;
  if profile.banned then
    return json_build_object('ok', false, 'error', 'banned');
  end if;
  if profile.plan = 'beta' then
    return json_build_object('ok', true);
  end if;
  if profile.plan in ('paid', 'free_forever') then
    return json_build_object('ok', false, 'error', 'not_needed');
  end if;

  select * into invite from public.beta_codes
  where replace(code, '-', '') = wanted
  for update;
  if not found then
    return json_build_object('ok', false, 'error', 'invalid');
  end if;
  if invite.redeemed_at is not null then
    return json_build_object('ok', false, 'error', 'used');
  end if;

  update public.beta_codes
  set redeemed_by = me, redeemed_at = now()
  where code = invite.code;
  update public.profiles set plan = 'beta' where id = me;
  return json_build_object('ok', true);
end;
$$;

revoke all on function public.silktone_redeem_beta_code(text) from public, anon;
grant execute on function public.silktone_redeem_beta_code(text) to authenticated;

-- The app's access answer, now with the beta plan and the invite-only lock.
create or replace function public.silktone_get_access()
returns json
language sql
stable
security invoker
set search_path = ''
as $$
  select json_build_object(
    'status',
      case
        when p.banned then 'banned'
        when p.plan = 'free_forever' then 'free_forever'
        when p.plan = 'beta' and public.silktone_beta_is_open() then 'beta'
        when p.plan = 'paid' and p.paid_until + interval '3 days' > now() then 'paid'
        when public.silktone_beta_invite_only() then 'locked'
        when p.trial_ends_at > now() then 'trial'
        else 'expired'
      end,
    'allowed',
      (not p.banned)
      and (
        p.plan = 'free_forever'
        or (p.plan = 'beta' and public.silktone_beta_is_open())
        or (p.plan = 'paid' and p.paid_until + interval '3 days' > now())
        or (not public.silktone_beta_invite_only() and p.trial_ends_at > now())
      ),
    'trial_ends_at', p.trial_ends_at,
    'paid_until', p.paid_until,
    'cancel_at_period_end', p.cancel_at_period_end,
    'server_time', now()
  )
  from public.profiles p
  where p.id = (select auth.uid());
$$;
