-- "Request beta access" from inside the app: no links or outside services
-- for users to reach.
--
-- A locked (invite-only) account taps "Request beta access". With
-- auto_approve on, the server approves it at once (within the optional daily
-- limit) and the account gets the beta plan; the app unlocks on its next
-- access check. With auto_approve off, or when today's limit is reached, the
-- request waits as 'pending' until the owner approves it.
--
-- Owner controls (Supabase SQL editor):
--   update public.beta_program set auto_approve = false where id;      -- approve by hand
--   update public.beta_program set daily_limit = 20 where id;          -- max approvals per day (IST)
--   update public.beta_program set daily_limit = null where id;        -- no limit
--   update public.beta_program set access_requests_open = false where id; -- stop requests
-- Approve someone by hand: Table Editor, beta_requests, set status to
-- 'approved' (or: select public.silktone_approve_beta_request('a@b.com');).
-- Codes keep working for people invited directly.

alter table public.beta_program
  add column if not exists access_requests_open boolean not null default true,
  add column if not exists auto_approve boolean not null default true,
  add column if not exists daily_limit integer check (daily_limit is null or daily_limit >= 0);

create table if not exists public.beta_requests (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  email text,
  status text not null default 'pending' check (status in ('pending', 'approved')),
  requested_at timestamptz not null default now(),
  approved_at timestamptz
);

alter table public.beta_requests enable row level security;
revoke all on public.beta_requests from anon, authenticated;

-- Approving a request (by the server or by the owner in the dashboard) gives
-- the account the beta plan, unless it already has paid or free access.
create function public.silktone_on_beta_request_approved()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'approved' then
    if new.approved_at is null then
      new.approved_at := now();
    end if;
    update public.profiles set plan = 'beta'
    where id = new.user_id and plan = 'trial';
  end if;
  return new;
end;
$$;

revoke all on function public.silktone_on_beta_request_approved() from public, anon, authenticated;

create trigger beta_request_approved
  before insert or update of status on public.beta_requests
  for each row execute function public.silktone_on_beta_request_approved();

-- Approvals so far today, counted on India time.
create function public.silktone_beta_approvals_today()
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::integer from public.beta_requests
  where status = 'approved'
    and approved_at >= (date_trunc('day', now() at time zone 'Asia/Kolkata') at time zone 'Asia/Kolkata');
$$;

revoke all on function public.silktone_beta_approvals_today() from public, anon, authenticated;

-- The app's "Request beta access" button. Answers {"ok": true, "status":
-- "approved" | "pending"} or {"ok": false, "error": "full_today" | "closed" |
-- "beta_over" | "not_needed" | "banned" | "not_signed_in"}. "full_today"
-- still records the request, so the owner can approve it later.
create function public.silktone_request_beta_access()
returns json
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  program public.beta_program%rowtype;
  profile public.profiles%rowtype;
  existing public.beta_requests%rowtype;
begin
  if me is null then
    return json_build_object('ok', false, 'error', 'not_signed_in');
  end if;

  -- Serialise requests so the daily limit cannot be overshot.
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
    return json_build_object('ok', true, 'status', 'approved');
  end if;
  if profile.plan in ('paid', 'free_forever') then
    return json_build_object('ok', false, 'error', 'not_needed');
  end if;

  select * into existing from public.beta_requests where user_id = me;
  if found and existing.status = 'approved' then
    return json_build_object('ok', true, 'status', 'approved');
  end if;
  if not program.access_requests_open then
    return json_build_object('ok', false, 'error', 'closed');
  end if;

  if not program.auto_approve then
    insert into public.beta_requests (user_id, email) values (me, profile.email)
    on conflict (user_id) do nothing;
    return json_build_object('ok', true, 'status', 'pending');
  end if;

  if program.daily_limit is not null
     and public.silktone_beta_approvals_today() >= program.daily_limit then
    insert into public.beta_requests (user_id, email) values (me, profile.email)
    on conflict (user_id) do nothing;
    return json_build_object('ok', false, 'error', 'full_today');
  end if;

  insert into public.beta_requests (user_id, email, status)
  values (me, profile.email, 'approved')
  on conflict (user_id) do update set status = 'approved';
  return json_build_object('ok', true, 'status', 'approved');
end;
$$;

revoke all on function public.silktone_request_beta_access() from public, anon;
grant execute on function public.silktone_request_beta_access() to authenticated;

-- Owner only: approve a waiting request by email.
create function public.silktone_approve_beta_request(account_email text)
returns boolean
language sql
volatile
security definer
set search_path = ''
as $$
  with done as (
    update public.beta_requests set status = 'approved'
    where lower(email) = lower(account_email) and status = 'pending'
    returning 1
  )
  select exists (select 1 from done);
$$;

revoke all on function public.silktone_approve_beta_request(text) from public, anon, authenticated;

-- This account's request status ('pending' / 'approved'), or null. A helper
-- because signed-in users cannot read beta_requests directly.
create function public.silktone_my_beta_request()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select status from public.beta_requests where user_id = (select auth.uid());
$$;

revoke all on function public.silktone_my_beta_request() from public, anon;
grant execute on function public.silktone_my_beta_request() to authenticated;

-- The access answer now also says whether a request is waiting, so the app
-- can show "Request sent".
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
    'beta_request', public.silktone_my_beta_request(),
    'server_time', now()
  )
  from public.profiles p
  where p.id = (select auth.uid());
$$;
