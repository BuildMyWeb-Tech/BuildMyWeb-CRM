-- User preferences table for cross-device persistence (My Pages tabs, sidebar state, etc.)
create table if not exists public.user_preferences (
  user_id uuid not null references auth.users(id) on delete cascade,
  key text not null,
  value jsonb not null default '{}',
  updated_at timestamptz not null default now(),
  primary key (user_id, key)
);

alter table public.user_preferences enable row level security;

drop policy if exists "Users can read their own preferences" on public.user_preferences;
create policy "Users can read their own preferences"
  on public.user_preferences for select
  using (auth.uid() = user_id);

drop policy if exists "Users can upsert their own preferences" on public.user_preferences;
create policy "Users can upsert their own preferences"
  on public.user_preferences for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can update their own preferences" on public.user_preferences;
create policy "Users can update their own preferences"
  on public.user_preferences for update
  using (auth.uid() = user_id);

drop policy if exists "Users can delete their own preferences" on public.user_preferences;
create policy "Users can delete their own preferences"
  on public.user_preferences for delete
  using (auth.uid() = user_id);
