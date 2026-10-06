-- Removes the Telegram code delivery and the one-at-a-time public code drops,
-- which were live on Supabase from 2026-10-06 but never used: t.me links are
-- blocked for many users in India. Access now comes from "Request beta
-- access" in the app, or from referral codes the owner hands out.
--
-- Safe on a database that never had these pieces (everything is "if exists").
-- Also delete the telegram-webhook Edge Function in the Supabase dashboard
-- (Edge Functions, telegram-webhook, Delete).

do $$
declare
  token text;
begin
  -- Disconnect the bot from the webhook before its token is deleted.
  if to_regclass('vault.decrypted_secrets') is not null and to_regprocedure('net.http_post(text,jsonb,jsonb,jsonb,integer)') is not null then
    select decrypted_secret into token from vault.decrypted_secrets where name = 'telegram_bot_token';
    if token is not null then
      perform net.http_post(
        url := 'https://api.telegram.org/bot' || trim(token) || '/deleteWebhook',
        body := '{"drop_pending_updates": true}'::jsonb
      );
    end if;
  end if;

  if to_regclass('cron.job') is not null then
    perform cron.unschedule(jobid) from cron.job where jobname = 'silktone-beta-drops';
  end if;

  if to_regclass('vault.secrets') is not null then
    delete from vault.secrets
    where name in ('telegram_bot_token', 'telegram_chat_id', 'telegram_webhook_secret');
  end if;
end;
$$;

drop function if exists public.silktone_handle_telegram_update(text, jsonb);
drop function if exists public.silktone_telegram_connect();
drop function if exists public.silktone_telegram_join_code(bigint);
drop function if exists public.silktone_telegram_call(text, jsonb);
drop function if exists public.silktone_announce_beta_drops();
drop function if exists public.silktone_telegram_post(text);
drop function if exists public.silktone_start_beta_drops();
drop function if exists public.silktone_stop_beta_drops();
drop function if exists public.silktone_live_beta_code();

drop index if exists public.beta_codes_one_live_drop;
alter table public.beta_codes
  drop column if exists telegram_user_id,
  drop column if exists claim_announced_at,
  drop column if exists announced_at,
  drop column if exists available_at,
  drop column if exists source;
alter table public.beta_program
  drop column if exists join_codes_open,
  drop column if exists drop_delay,
  drop column if exists drops_open;

-- Code making and redeeming without the drop machinery (same as in
-- 20261005090000_beta_invites.sql).
drop function if exists public.silktone_make_beta_code(text, timestamptz);

create or replace function public.silktone_make_beta_code()
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

create or replace function public.silktone_create_beta_codes(how_many integer default 1)
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

create or replace function public.silktone_redeem_beta_code(invite_code text)
returns json
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  wanted text := upper(regexp_replace(coalesce(invite_code, ''), '[^A-Za-z0-9]', '', 'g'));
  program public.beta_program%rowtype;
  invite public.beta_codes%rowtype;
  profile public.profiles%rowtype;
begin
  if me is null then
    return json_build_object('ok', false, 'error', 'not_signed_in');
  end if;

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
