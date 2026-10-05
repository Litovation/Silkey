-- Beta invites: a fixed number of hand-picked people get Silktone free for the
-- whole beta. The owner creates personal codes, sends each person a link, and
-- the app redeems the code after that person signs in. When the beta ends
-- (the owner sets beta_program.ends_at), those accounts fall back to trial
-- time left, or to expired, like everyone else.

alter table public.profiles drop constraint profiles_plan_check;
alter table public.profiles add constraint profiles_plan_check
  check (plan in ('trial', 'paid', 'free_forever', 'beta'));

-- One row. max_seats caps how many codes can ever be redeemed; ends_at, once
-- set and reached, ends free beta access for everyone on the beta plan.
create table public.beta_program (
  id boolean primary key default true check (id),
  max_seats integer not null default 20 check (max_seats >= 0),
  ends_at timestamptz
);
insert into public.beta_program default values;

alter table public.beta_program enable row level security;
revoke all on public.beta_program from anon, authenticated;

-- label: who the code was sent to, filled in by the owner in the dashboard.
create table public.beta_codes (
  code text primary key,
  label text,
  created_at timestamptz not null default now(),
  redeemed_by uuid unique references public.profiles (id) on delete set null,
  redeemed_at timestamptz
);

alter table public.beta_codes enable row level security;
revoke all on public.beta_codes from anon, authenticated;

-- Owner only (SQL editor): select * from public.silktone_create_beta_codes(20);
-- Codes look like SILK-7KQ2-M9XD, from an alphabet without 0/O, 1/I/L.
create function public.silktone_create_beta_codes(how_many integer default 20)
returns table (code text, link text)
language plpgsql
volatile
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  alphabet constant text := '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
  bytes bytea;
  chars text;
  new_code text;
  i integer;
  j integer;
begin
  for i in 1..how_many loop
    loop
      bytes := extensions.gen_random_bytes(8);
      chars := '';
      for j in 0..7 loop
        chars := chars || substr(alphabet, get_byte(bytes, j) % length(alphabet) + 1, 1);
      end loop;
      new_code := 'SILK-' || substr(chars, 1, 4) || '-' || substr(chars, 5, 4);
      insert into public.beta_codes (code) values (new_code) on conflict do nothing;
      exit when found;
    end loop;
    code := new_code;
    link := 'https://silktone.litovation.in/beta.html?code=' || new_code;
    return next;
  end loop;
end;
$$;

revoke all on function public.silktone_create_beta_codes(integer) from public, anon, authenticated;

-- Whether beta accounts still get free access. A helper because signed-in
-- users cannot read beta_program directly.
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

-- The app calls this with the code from the link. Answers {"ok": true} or
-- {"ok": false, "error": "invalid" | "used" | "full" | "beta_over" |
-- "not_needed" | "banned" | "not_signed_in"}.
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

  -- Locking the program row serialises redemptions, so the seat count
  -- cannot overshoot when two people redeem at the same moment.
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
  if (select count(*) from public.beta_codes where redeemed_at is not null) >= program.max_seats then
    return json_build_object('ok', false, 'error', 'full');
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

-- Same as before, plus the beta plan: allowed while the beta is open, then the
-- account falls back to trial time left, or to expired.
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
        when p.trial_ends_at > now() then 'trial'
        else 'expired'
      end,
    'allowed',
      (not p.banned)
      and (
        p.plan = 'free_forever'
        or (p.plan = 'beta' and public.silktone_beta_is_open())
        or (p.plan = 'paid' and p.paid_until + interval '3 days' > now())
        or p.trial_ends_at > now()
      ),
    'trial_ends_at', p.trial_ends_at,
    'paid_until', p.paid_until,
    'cancel_at_period_end', p.cancel_at_period_end,
    'server_time', now()
  )
  from public.profiles p
  where p.id = (select auth.uid());
$$;
