-- One row per user. Only the dashboard (service role) and, later, the payment
-- webhook may change it; signed-in users can read their own row and nothing else.
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  plan text not null default 'trial' check (plan in ('trial', 'paid', 'free_forever')),
  trial_ends_at timestamptz not null default (now() + interval '30 days'),
  banned boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "Users can read their own profile"
  on public.profiles for select
  to authenticated
  using ((select auth.uid()) = id);

revoke all on public.profiles from anon, authenticated;
grant select on public.profiles to authenticated;

-- Start the 30-day trial when an account is created.
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end;
$$;

revoke all on function public.handle_new_user() from public, anon, authenticated;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- The app's single question: "is this account allowed right now?".
-- Answered with the server clock so changing the PC date cannot extend a trial.
create function public.silktone_get_access()
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
        when p.plan in ('paid', 'free_forever') then p.plan
        when p.trial_ends_at > now() then 'trial'
        else 'expired'
      end,
    'allowed',
      (not p.banned)
      and (p.plan in ('paid', 'free_forever') or p.trial_ends_at > now()),
    'trial_ends_at', p.trial_ends_at,
    'server_time', now()
  )
  from public.profiles p
  where p.id = (select auth.uid());
$$;

revoke all on function public.silktone_get_access() from public, anon;
grant execute on function public.silktone_get_access() to authenticated;
