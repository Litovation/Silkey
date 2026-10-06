-- Personal referral codes for people who join the Telegram channel.
--
-- The channel is set to "Approve new members". Each join request reaches the
-- telegram-webhook Edge Function, which hands it to
-- silktone_handle_telegram_update(): the bot sends that person their own code
-- in a private message and approves the request. One code per Telegram
-- account (rejoining sends the same code again); a code still works only
-- once, for one Silktone account. No wait, no expiry.
--
-- This replaces the one-at-a-time public drops, which are switched off.
--
-- Owner controls (Supabase SQL editor):
--   update public.beta_program set join_codes_open = false;  -- pause codes
--   update public.beta_program set join_codes_open = true;   -- resume
--   update public.beta_program set ends_at = now();          -- end the beta
-- While paused, and after the beta ends, joiners are still approved into the
-- channel (it carries updates) but get no code.
--
-- Bot setup, once: select public.silktone_telegram_connect();

-- Telegram codes are stored as source 'manual'; telegram_user_id marks them.
alter table public.beta_codes add column if not exists telegram_user_id bigint unique;

alter table public.beta_program
  add column if not exists join_codes_open boolean not null default true;

-- The public drops are retired: drops_open stays off (its default), so their
-- posting job, still scheduled, has nothing to post.

-- Shared secret Telegram sends with every update, so only Telegram can call
-- the webhook. Random, kept in Vault.
select vault.create_secret(
  encode(extensions.gen_random_bytes(32), 'hex'),
  'telegram_webhook_secret'
);

-- Any Bot API method, with the token from Vault. False when the bot is not
-- set up yet.
create function public.silktone_telegram_call(method text, payload jsonb)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  token text;
begin
  select decrypted_secret into token from vault.decrypted_secrets where name = 'telegram_bot_token';
  if token is null then
    return false;
  end if;
  perform net.http_post(
    url := 'https://api.telegram.org/bot' || trim(token) || '/' || method,
    body := payload,
    headers := '{"Content-Type": "application/json"}'::jsonb
  );
  return true;
end;
$$;

revoke all on function public.silktone_telegram_call(text, jsonb) from public, anon, authenticated;

-- The code for one Telegram account: the same one every time, made on first
-- request. Null while codes are paused or after the beta has ended.
create function public.silktone_telegram_join_code(tg_user_id bigint)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  program public.beta_program%rowtype;
  existing text;
  new_code text;
begin
  select * into program from public.beta_program;
  if not program.join_codes_open
     or (program.ends_at is not null and program.ends_at <= now()) then
    return null;
  end if;

  select code into existing from public.beta_codes where telegram_user_id = tg_user_id;
  if existing is not null then
    return existing;
  end if;

  new_code := public.silktone_make_beta_code('manual');
  update public.beta_codes set telegram_user_id = tg_user_id where code = new_code;
  return new_code;
end;
$$;

revoke all on function public.silktone_telegram_join_code(bigint) from public, anon, authenticated;

-- Called by the telegram-webhook Edge Function (service role) with every
-- update Telegram sends. Only join requests to our channel are acted on.
create function public.silktone_handle_telegram_update(secret text, payload jsonb)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  expected text;
  channel text;
  join_request jsonb := payload -> 'chat_join_request';
  tg_user_id bigint;
  personal_code text;
begin
  select decrypted_secret into expected from vault.decrypted_secrets where name = 'telegram_webhook_secret';
  if expected is null or secret is distinct from expected then
    return;
  end if;
  if join_request is null then
    return;
  end if;

  select ltrim(trim(decrypted_secret), '@') into channel
  from vault.decrypted_secrets where name = 'telegram_chat_id';
  if lower(coalesce(join_request -> 'chat' ->> 'username', '')) <> lower(coalesce(channel, ''))
     and coalesce(join_request -> 'chat' ->> 'id', '') <> coalesce(channel, '') then
    return;
  end if;

  tg_user_id := (join_request -> 'from' ->> 'id')::bigint;
  personal_code := public.silktone_telegram_join_code(tg_user_id);

  -- The private message must go out while the request is pending, so it is
  -- sent before the approval.
  if personal_code is not null then
    perform public.silktone_telegram_call('sendMessage', jsonb_build_object(
      'chat_id', join_request ->> 'user_chat_id',
      'parse_mode', 'HTML',
      'disable_web_page_preview', true,
      'text',
        '👋 Welcome to Silktone beta! Your personal code: <code>' || personal_code || '</code>'
        || chr(10) || chr(10)
        || 'Open Silktone → Settings → Account → Referral code → paste → Submit. It works only once.'
        || chr(10) || chr(10)
        || 'Don''t have Silktone yet? Download it: https://github.com/Litovation/Silkey/releases/latest'
    ));
  end if;

  perform public.silktone_telegram_call('approveChatJoinRequest', jsonb_build_object(
    'chat_id', join_request -> 'chat' -> 'id',
    'user_id', tg_user_id
  ));
end;
$$;

revoke all on function public.silktone_handle_telegram_update(text, jsonb) from public, anon, authenticated;
grant execute on function public.silktone_handle_telegram_update(text, jsonb) to service_role;

-- Owner, once: point the bot at the webhook (join requests only).
create function public.silktone_telegram_connect()
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  secret text;
begin
  select decrypted_secret into secret from vault.decrypted_secrets where name = 'telegram_webhook_secret';
  return public.silktone_telegram_call('setWebhook', jsonb_build_object(
    'url', 'https://ihslofjgydhpnaadbhnv.supabase.co/functions/v1/telegram-webhook',
    'secret_token', secret,
    'allowed_updates', jsonb_build_array('chat_join_request'),
    'drop_pending_updates', true
  ));
end;
$$;

revoke all on function public.silktone_telegram_connect() from public, anon, authenticated;
