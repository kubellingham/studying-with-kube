-- v1.4: accounts, per-account caps and share links.
--
-- What's stored: who the user is (from Google), their plan, one row per
-- generation (mode, status, page count, cost) and the generated sets behind
-- share links. Never slide text.
--
-- The app talks to this database only as the signed-in user (or anonymously
-- for share links and the keep-alive), never with a secret key. Everything a
-- user may not do directly (take a generation slot, read a share link) goes
-- through the security-definer functions below, which check auth.uid().

-- Profiles ------------------------------------------------------------------

-- One row per Google account, created on first sign-in. Prince marks an
-- account paid by setting plan = 'paid' (and optionally paid_until) in the
-- Supabase table editor.
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  name text,
  plan text not null default 'free' check (plan in ('free', 'paid')),
  paid_until timestamptz,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
create policy "Users read their own profile" on public.profiles
  for select to authenticated using (id = (select auth.uid()));

create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, email, name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;
revoke execute on function public.handle_new_user() from public, anon, authenticated;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Generations ---------------------------------------------------------------

-- One row per upload. 'reserved' while the model runs, then 'done' or
-- 'failed'. Done rows count toward the caps; failed ones don't; a reservation
-- left behind by a crash stops counting after 15 minutes.
create table public.generations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  mode text not null check (mode in ('middle', 'panic', 'comprehensive')),
  status text not null default 'reserved' check (status in ('reserved', 'done', 'failed')),
  pages integer,
  cost_usd numeric(10, 5),
  created_at timestamptz not null default now(),
  finished_at timestamptz
);
create index generations_user_mode_created on public.generations (user_id, mode, created_at desc);
create index generations_created on public.generations (created_at desc);

alter table public.generations enable row level security;
create policy "Users read their own generations" on public.generations
  for select to authenticated using (user_id = (select auth.uid()));

-- Caps ----------------------------------------------------------------------

-- The quota for one user and mode right now. Days and months are Indian
-- calendar days and months (Asia/Kolkata): daily caps reset at midnight IST,
-- the free Panic on the 1st.
--   free: Middle 5/day, Panic 1/month, Comprehensive none
--   paid: Middle 30/day, Panic 10/day, Comprehensive 10/day
-- Internal: called by reserve_generation and usage_summary only.
create function public.quota(p_user uuid, p_mode text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  prof public.profiles;
  paid boolean;
  lim integer;
  per text := 'day';
  local_now timestamp := now() at time zone 'Asia/Kolkata';
  window_start timestamptz;
  resets_at timestamptz;
  used integer;
begin
  select * into prof from public.profiles where id = p_user;
  paid := coalesce(prof.plan = 'paid' and (prof.paid_until is null or prof.paid_until > now()), false);

  if p_mode = 'middle' then
    lim := case when paid then 30 else 5 end;
  elsif p_mode = 'panic' then
    lim := case when paid then 10 else 1 end;
    per := case when paid then 'day' else 'month' end;
  elsif p_mode = 'comprehensive' then
    lim := case when paid then 10 else 0 end;
  else
    raise exception 'Unknown mode: %', p_mode;
  end if;

  if per = 'day' then
    window_start := date_trunc('day', local_now) at time zone 'Asia/Kolkata';
    resets_at := (date_trunc('day', local_now) + interval '1 day') at time zone 'Asia/Kolkata';
  else
    window_start := date_trunc('month', local_now) at time zone 'Asia/Kolkata';
    resets_at := (date_trunc('month', local_now) + interval '1 month') at time zone 'Asia/Kolkata';
  end if;

  select count(*) into used
  from public.generations g
  where g.user_id = p_user
    and g.mode = p_mode
    and g.created_at >= window_start
    and (g.status = 'done' or (g.status = 'reserved' and g.created_at > now() - interval '15 minutes'));

  return jsonb_build_object(
    'mode', p_mode,
    'plan', case when paid then 'paid' else 'free' end,
    'limit', lim,
    'used', used,
    'left', greatest(lim - used, 0),
    'per', per,
    'resets_at', resets_at
  );
end;
$$;
revoke execute on function public.quota(uuid, text) from public, anon, authenticated;

-- Takes one generation slot for the signed-in user, or says why it can't.
-- p_daily_cap is an optional brake on all users' generations per IST day
-- (set by the server from an env var). Returns the quota plus:
--   ok: true, id: <generation id>      when a slot was taken
--   ok: false, reason: 'limit' | 'busy' | 'site_limit'
create function public.reserve_generation(p_mode text, p_daily_cap integer default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  q jsonb;
  new_id uuid;
begin
  if uid is null then
    raise exception 'Not signed in' using errcode = '28000';
  end if;
  insert into public.profiles (id) values (uid) on conflict (id) do nothing;

  -- One reservation at a time per user, so two tabs can't both take the last slot.
  perform pg_advisory_xact_lock(hashtextextended(uid::text, 0));

  if exists (
    select 1 from public.generations
    where user_id = uid and status = 'reserved' and created_at > now() - interval '3 minutes'
  ) then
    return jsonb_build_object('ok', false, 'reason', 'busy');
  end if;

  q := public.quota(uid, p_mode);
  if (q ->> 'left')::integer <= 0 then
    return q || jsonb_build_object('ok', false, 'reason', 'limit');
  end if;

  if p_daily_cap is not null and (
    select count(*) from public.generations
    where created_at >= date_trunc('day', now() at time zone 'Asia/Kolkata') at time zone 'Asia/Kolkata'
      and status <> 'failed'
  ) >= p_daily_cap then
    return q || jsonb_build_object('ok', false, 'reason', 'site_limit');
  end if;

  insert into public.generations (user_id, mode) values (uid, p_mode) returning id into new_id;
  return public.quota(uid, p_mode) || jsonb_build_object('ok', true, 'id', new_id);
end;
$$;

-- Marks the user's generation done. Done always wins, so calling
-- fail_generation first can't turn a finished set into a free one.
create function public.complete_generation(p_id uuid, p_pages integer, p_cost_usd numeric) returns void
language sql security definer set search_path = '' as $$
  update public.generations
  set status = 'done', pages = p_pages, cost_usd = p_cost_usd, finished_at = now()
  where id = p_id and user_id = auth.uid();
$$;

-- Hands the slot back when generation failed or was cancelled.
create function public.fail_generation(p_id uuid) returns void
language sql security definer set search_path = '' as $$
  update public.generations
  set status = 'failed', finished_at = now()
  where id = p_id and user_id = auth.uid() and status = 'reserved';
$$;

-- Plan and what's left in each mode, for the signed-in user.
create function public.usage_summary() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'Not signed in' using errcode = '28000';
  end if;
  return jsonb_build_object(
    'middle', public.quota(uid, 'middle'),
    'panic', public.quota(uid, 'panic'),
    'comprehensive', public.quota(uid, 'comprehensive')
  );
end;
$$;

revoke execute on function public.reserve_generation(text, integer) from public, anon;
revoke execute on function public.complete_generation(uuid, integer, numeric) from public, anon;
revoke execute on function public.fail_generation(uuid) from public, anon;
revoke execute on function public.usage_summary() from public, anon;
grant execute on function public.reserve_generation(text, integer) to authenticated;
grant execute on function public.complete_generation(uuid, integer, numeric) to authenticated;
grant execute on function public.fail_generation(uuid) to authenticated;
grant execute on function public.usage_summary() to authenticated;

-- Share links ---------------------------------------------------------------

-- A generated study set behind a /s/<id> link (moved here from Vercel Blob).
-- Anyone with the link can open it, without signing in; the 20-character
-- random id is the only key. There is no select policy, so sets can't be
-- listed: reading goes through get_shared_set(id).
create table public.shared_sets (
  id text primary key check (id ~ '^[A-Za-z0-9_-]{20}$'),
  created_by uuid references public.profiles (id) on delete set null,
  study_set jsonb not null,
  created_at timestamptz not null default now()
);

alter table public.shared_sets enable row level security;
create policy "Users share their own sets" on public.shared_sets
  for insert to authenticated with check (created_by = (select auth.uid()));

create function public.get_shared_set(p_id text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select study_set from public.shared_sets where id = p_id;
$$;
revoke execute on function public.get_shared_set(text) from public;
grant execute on function public.get_shared_set(text) to anon, authenticated;

-- Keep-alive ----------------------------------------------------------------

-- Called once a day by a Vercel cron so the free project never pauses.
create function public.keepalive() returns timestamptz
language sql stable set search_path = '' as $$
  select now();
$$;
revoke execute on function public.keepalive() from public;
grant execute on function public.keepalive() to anon, authenticated;
