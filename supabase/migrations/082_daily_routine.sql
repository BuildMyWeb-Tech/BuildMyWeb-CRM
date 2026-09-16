-- Daily Routine feature
-- Each user manages their own private routine items.
-- Completion is logged per-day; "day" resets at 04:30 local time.

create table if not exists daily_routines (
  id           uuid primary key default gen_random_uuid(),
  account_id   uuid not null references accounts(id) on delete cascade,
  user_id      uuid not null references auth.users(id) on delete cascade,
  title        text not null,
  notes        text,
  order_index  int  not null default 0,
  is_hidden    boolean not null default false,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create table if not exists daily_routine_completions (
  id          uuid primary key default gen_random_uuid(),
  routine_id  uuid not null references daily_routines(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  day_key     date not null,            -- UTC date of the "routine day" (reset at 04:30)
  completed_at timestamptz not null default now(),
  unique (routine_id, day_key)
);

-- RLS: users can only see/edit their own rows
alter table daily_routines enable row level security;
alter table daily_routine_completions enable row level security;

create policy "routine_owner" on daily_routines
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "completion_owner" on daily_routine_completions
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- updated_at trigger
create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;

create trigger daily_routines_updated_at
  before update on daily_routines
  for each row execute procedure set_updated_at();
