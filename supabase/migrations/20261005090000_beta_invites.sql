-- Beta invite codes ("referral codes" in the app).
--
-- While the beta is invite-only, a signed-in account can open Silktone but
-- cannot dictate until it redeems a code; a redeemed code gives full access
-- for the whole beta and is dead after that one use.
--
-- Codes are "dropped" one at a time: when the live code is used, the next one
-- is made and becomes usable after drop_delay. A job posts each new code, and
-- each claim, to the owner's Telegram channel. Drops continue until the owner
-- stops them. The owner can also make extra codes by hand (e.g. to post on X).
--
-- Owner controls (Supabase SQL editor):
--   select * from public.silktone_start_beta_drops();  -- first/next live code
--   select * from public.silktone_live_beta_code();     -- what is live now
--   select public.silktone_stop_beta_drops();           -- no more codes
--   select * from public.silktone_create_beta_codes(5); -- extra codes by hand
--   update public.beta_program set invite_only = true;  -- lock code-less accounts
--   update public.beta_program set drop_delay = interval '30 minutes';
--   update public.beta_program set ends_at = now();     -- end the beta
-- Telegram (once, see HANDOFF.md):
--   select vault.create_secret('<bot token>', 'telegram_bot_token');
--   select vault.create_secret('@channelname', 'telegram_chat_id');

create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron;

alter table public.profiles drop constraint profiles_plan_check;
alter table public.profiles add constraint profiles_plan_check
  check (plan in ('trial', 'paid', 'free_forever', 'beta'));

-- One row of switches. Everything starts off, so applying this migration
-- changes nothing for current users until the owner turns it on.
create table public.beta_program (
  id boolean primary key default true check (id),
  -- Accounts without a code (or a paid/free plan) cannot dictate.
  invite_only boolean not null default false,
  -- When the live code is used, make the next one.
  drops_open boolean not null default false,
  -- Wait between a code being used and the next one going live.
  drop_delay interval not null default interval '1 hour'
    check (drop_delay >= interval '0'),
  -- Once reached, beta accounts lose free access and invite_only stops.
  ends_at timestamptz
);
insert into public.beta_program default values;

alter table public.beta_program enable row level security;
revoke all on public.beta_program from anon, authenticated;

create table public.beta_codes (
  code text primary key,
  -- 'drop': part of the one-at-a-time public chain; 'manual': made by hand.
  source text not null default 'manual' check (source in ('drop', 'manual')),
  -- Who a manual code was given to; filled in by the owner, optional.
  label text,
  created_at timestamptz not null default now(),
  -- A code cannot be redeemed, or posted, before this time.
  available_at timestamptz not null default now(),
  announced_at timestamptz,
  redeemed_by uuid unique references public.profiles (id) on delete set null,
  redeemed_at timestamptz,
  claim_announced_at timestamptz
);

-- At most one drop code waiting to be used, so codes really go one at a time.
create unique index beta_codes_one_live_drop
  on public.beta_codes (source)
  where source = 'drop' and redeemed_at is null;

alter table public.beta_codes enable row level security;
revoke all on public.beta_codes from anon, authenticated;

-- A new, unique code like SILK-7KQ2-M9XD (no 0/O, 1/I/L).
create function public.silktone_make_beta_code(
  code_source text,
  usable_from timestamptz default now()
)
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
    insert into public.beta_codes (code, source, available_at)
    values (new_code, code_source, usable_from)
    on conflict (code) do nothing;
    exit when found;
  end loop;
  return new_code;
end;
$$;

revoke all on function public.silktone_make_beta_code(text, timestamptz) from public, anon, authenticated;

-- Owner only: extra codes by hand, usable at once and outside the drop chain.
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
    code := public.silktone_make_beta_code('manual');
    return next;
  end loop;
end;
$$;

revoke all on function public.silktone_create_beta_codes(integer) from public, anon, authenticated;

-- Owner only: open the drops and make sure one drop code is live.
create function public.silktone_start_beta_drops()
returns table (code text, available_at timestamptz)
language plpgsql
volatile
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  update public.beta_program set drops_open = true;
  if not exists (
    select 1 from public.beta_codes c
    where c.source = 'drop' and c.redeemed_at is null
  ) then
    perform public.silktone_make_beta_code('drop', now());
  end if;
  return query
    select c.code, c.available_at from public.beta_codes c
    where c.source = 'drop' and c.redeemed_at is null;
end;
$$;

revoke all on function public.silktone_start_beta_drops() from public, anon, authenticated;

-- Owner only: no new codes after the current one. The live code still works.
create function public.silktone_stop_beta_drops()
returns void
language sql
volatile
security definer
set search_path = ''
as $$
  update public.beta_program set drops_open = false;
$$;

revoke all on function public.silktone_stop_beta_drops() from public, anon, authenticated;

-- Owner only: the drop code waiting to be used, e.g. to post it on X too.
create function public.silktone_live_beta_code()
returns table (code text, available_at timestamptz, posted_to_telegram boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select c.code, c.available_at, c.announced_at is not null
  from public.beta_codes c
  where c.source = 'drop' and c.redeemed_at is null;
$$;

revoke all on function public.silktone_live_beta_code() from public, anon, authenticated;

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

-- Code-less accounts are locked while the beta is open and invite-only.
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
  -- Submit at the same moment cannot both win one code.
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

  -- A code that is not live yet is treated as unknown.
  select * into invite from public.beta_codes
  where replace(code, '-', '') = wanted and available_at <= now()
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

  if invite.source = 'drop' and program.drops_open then
    perform public.silktone_make_beta_code('drop', now() + program.drop_delay);
  end if;
  return json_build_object('ok', true);
end;
$$;

revoke all on function public.silktone_redeem_beta_code(text) from public, anon;
grant execute on function public.silktone_redeem_beta_code(text) to authenticated;

-- Post one message to the owner's Telegram channel. Does nothing until the
-- bot token and channel are stored in Vault.
create function public.silktone_telegram_post(message text)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  token text;
  chat text;
begin
  select decrypted_secret into token from vault.decrypted_secrets where name = 'telegram_bot_token';
  select decrypted_secret into chat from vault.decrypted_secrets where name = 'telegram_chat_id';
  if token is null or chat is null then
    return false;
  end if;
  perform net.http_post(
    url := 'https://api.telegram.org/bot' || trim(token) || '/sendMessage',
    body := jsonb_build_object(
      'chat_id', trim(chat),
      'text', message,
      'parse_mode', 'HTML',
      'disable_web_page_preview', true
    ),
    headers := '{"Content-Type": "application/json"}'::jsonb
  );
  return true;
end;
$$;

revoke all on function public.silktone_telegram_post(text) from public, anon, authenticated;

-- Runs every minute: posts claimed codes, then newly live drop codes.
create function public.silktone_announce_beta_drops()
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  program public.beta_program%rowtype;
  item record;
  minutes integer;
  next_line text;
begin
  select * into program from public.beta_program;

  for item in
    select * from public.beta_codes
    where source = 'drop' and redeemed_at is not null and claim_announced_at is null
    order by redeemed_at
  loop
    if program.drops_open then
      minutes := ceil(extract(epoch from program.drop_delay) / 60);
      next_line := case
        when minutes <= 1 then 'The next code drops in a moment.'
        else 'The next code drops in about ' || minutes || ' minutes.'
      end;
    else
      next_line := 'No more codes for now. Stay tuned!';
    end if;
    if not public.silktone_telegram_post(
      '✅ <code>' || item.code || '</code> has been claimed. ' || next_line
    ) then
      return;
    end if;
    update public.beta_codes set claim_announced_at = now() where code = item.code;
  end loop;

  for item in
    select * from public.beta_codes
    where source = 'drop' and redeemed_at is null
      and announced_at is null and available_at <= now()
  loop
    if not public.silktone_telegram_post(
      '🎟️ New Silktone beta code: <code>' || item.code || '</code>' || chr(10) || chr(10)
      || 'First person to use it gets full access for the whole beta. '
      || 'In Silktone open Settings → Account → Referral code, paste it and press Submit.'
    ) then
      return;
    end if;
    update public.beta_codes set announced_at = now() where code = item.code;
  end loop;
end;
$$;

revoke all on function public.silktone_announce_beta_drops() from public, anon, authenticated;

select cron.schedule(
  'silktone-beta-drops',
  '* * * * *',
  'select public.silktone_announce_beta_drops()'
);

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
