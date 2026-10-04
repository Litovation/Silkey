-- Razorpay subscriptions. Only the payment functions (service role) write these
-- columns; signed-in users can still only read their own row.
alter table public.profiles
  add column razorpay_subscription_id text unique,
  add column subscription_status text,
  add column paid_until timestamptz,
  add column cancel_at_period_end boolean not null default false;

-- Razorpay repeats a notification until it gets an answer, and may send them
-- out of order. Remembering each one lets the webhook ignore repeats.
create table public.razorpay_events (
  id text primary key,
  event text not null,
  subscription_id text,
  received_at timestamptz not null default now()
);

alter table public.razorpay_events enable row level security;
revoke all on public.razorpay_events from anon, authenticated;

-- A paid plan counts only while the paid period, plus 3 days of grace for a
-- failed renewal, is still running. After that the account falls back to
-- whatever trial time is left, or to expired.
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
        when p.plan = 'paid' and p.paid_until + interval '3 days' > now() then 'paid'
        when p.trial_ends_at > now() then 'trial'
        else 'expired'
      end,
    'allowed',
      (not p.banned)
      and (
        p.plan = 'free_forever'
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
