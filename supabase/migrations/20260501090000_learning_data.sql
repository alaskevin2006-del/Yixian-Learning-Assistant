create extension if not exists pgcrypto with schema extensions;

create table if not exists public.learning_tasks (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
    client_id text,
    title text not null,
    subject text,
    task_type text not null default 'normal',
    status text not null default 'todo',
    priority text,
    difficulty text,
    mastery text,
    planned_date date,
    slot text,
    est_minutes integer,
    source text,
    done boolean not null default false,
    blocked boolean not null default false,
    review_count integer not null default 0,
    client_created_at text,
    client_updated_at text,
    metadata jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint learning_tasks_user_client_unique unique (user_id, client_id)
);

create table if not exists public.study_sessions (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
    client_id text,
    task_id uuid references public.learning_tasks(id) on delete set null,
    task_client_id text,
    subject text,
    minutes integer not null default 0,
    started_at timestamptz,
    ended_at timestamptz,
    study_date date,
    note text,
    mastery text,
    client_created_at text,
    client_updated_at text,
    metadata jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint study_sessions_user_client_unique unique (user_id, client_id)
);

create table if not exists public.learning_blockages (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
    client_id text,
    task_id uuid references public.learning_tasks(id) on delete set null,
    task_client_id text,
    subject text,
    title text not null,
    description text,
    status text not null default 'open',
    severity text,
    resolved_at timestamptz,
    client_created_at text,
    client_updated_at text,
    metadata jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint learning_blockages_user_client_unique unique (user_id, client_id)
);

create table if not exists public.learning_reviews (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
    client_id text,
    task_id uuid references public.learning_tasks(id) on delete set null,
    task_client_id text,
    subject text,
    title text not null,
    review_type text not null default 'daily',
    planned_date date,
    completed_at timestamptz,
    note text,
    score integer,
    client_created_at text,
    client_updated_at text,
    metadata jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint learning_reviews_user_client_unique unique (user_id, client_id)
);

create index if not exists learning_tasks_user_planned_date_idx
    on public.learning_tasks (user_id, planned_date, status);
create index if not exists study_sessions_user_study_date_idx
    on public.study_sessions (user_id, study_date desc);
create index if not exists learning_blockages_user_status_idx
    on public.learning_blockages (user_id, status, updated_at desc);
create index if not exists learning_reviews_user_planned_date_idx
    on public.learning_reviews (user_id, planned_date, review_type);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
    new.updated_at = now();
    return new;
end;
$$;

drop trigger if exists set_learning_tasks_updated_at on public.learning_tasks;
create trigger set_learning_tasks_updated_at
    before update on public.learning_tasks
    for each row execute function public.set_updated_at();

drop trigger if exists set_study_sessions_updated_at on public.study_sessions;
create trigger set_study_sessions_updated_at
    before update on public.study_sessions
    for each row execute function public.set_updated_at();

drop trigger if exists set_learning_blockages_updated_at on public.learning_blockages;
create trigger set_learning_blockages_updated_at
    before update on public.learning_blockages
    for each row execute function public.set_updated_at();

drop trigger if exists set_learning_reviews_updated_at on public.learning_reviews;
create trigger set_learning_reviews_updated_at
    before update on public.learning_reviews
    for each row execute function public.set_updated_at();

alter table public.learning_tasks enable row level security;
alter table public.study_sessions enable row level security;
alter table public.learning_blockages enable row level security;
alter table public.learning_reviews enable row level security;

create policy "learning_tasks_select_own"
    on public.learning_tasks
    for select
    to authenticated
    using (auth.uid() = user_id);

create policy "learning_tasks_insert_own"
    on public.learning_tasks
    for insert
    to authenticated
    with check (auth.uid() = user_id);

create policy "learning_tasks_update_own"
    on public.learning_tasks
    for update
    to authenticated
    using (auth.uid() = user_id)
    with check (auth.uid() = user_id);

create policy "study_sessions_select_own"
    on public.study_sessions
    for select
    to authenticated
    using (auth.uid() = user_id);

create policy "study_sessions_insert_own"
    on public.study_sessions
    for insert
    to authenticated
    with check (auth.uid() = user_id);

create policy "study_sessions_update_own"
    on public.study_sessions
    for update
    to authenticated
    using (auth.uid() = user_id)
    with check (auth.uid() = user_id);

create policy "learning_blockages_select_own"
    on public.learning_blockages
    for select
    to authenticated
    using (auth.uid() = user_id);

create policy "learning_blockages_insert_own"
    on public.learning_blockages
    for insert
    to authenticated
    with check (auth.uid() = user_id);

create policy "learning_blockages_update_own"
    on public.learning_blockages
    for update
    to authenticated
    using (auth.uid() = user_id)
    with check (auth.uid() = user_id);

create policy "learning_reviews_select_own"
    on public.learning_reviews
    for select
    to authenticated
    using (auth.uid() = user_id);

create policy "learning_reviews_insert_own"
    on public.learning_reviews
    for insert
    to authenticated
    with check (auth.uid() = user_id);

create policy "learning_reviews_update_own"
    on public.learning_reviews
    for update
    to authenticated
    using (auth.uid() = user_id)
    with check (auth.uid() = user_id);
