-- Subject, conversation, planning draft, subject-resource, and review data.
-- This migration is additive and keeps existing learning tables/columns intact.

create extension if not exists pgcrypto;

create table if not exists public.subjects (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users(id) on delete cascade,
    name text not null,
    instruction text not null default '',
    archived_at timestamptz,
    metadata jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint subjects_user_name_unique unique (user_id, name)
);

create table if not exists public.conversations (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users(id) on delete cascade,
    subject_id uuid references public.subjects(id) on delete set null,
    type text not null default 'subject',
    title text not null default '新对话',
    status text not null default 'active',
    last_message_at timestamptz,
    metadata jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table if not exists public.conversation_messages (
    id uuid primary key default gen_random_uuid(),
    conversation_id uuid not null references public.conversations(id) on delete cascade,
    user_id uuid not null references auth.users(id) on delete cascade,
    role text not null,
    content text not null,
    citations jsonb not null default '[]'::jsonb,
    attachments jsonb not null default '[]'::jsonb,
    metadata jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now()
);

create table if not exists public.planning_drafts (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users(id) on delete cascade,
    planning_conversation_id uuid not null references public.conversations(id) on delete cascade,
    subject_id uuid references public.subjects(id) on delete set null,
    title text not null,
    description text not null default '',
    planned_start timestamptz,
    planned_end timestamptz,
    status text not null default 'draft',
    source_message_id uuid references public.conversation_messages(id) on delete set null,
    created_task_id uuid references public.learning_tasks(id) on delete set null,
    metadata jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table if not exists public.subject_resources (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users(id) on delete cascade,
    subject_id uuid not null references public.subjects(id) on delete cascade,
    resource_id text not null,
    resource_scope text not null default 'public',
    relation text not null default 'reference',
    metadata jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now(),
    constraint subject_resources_unique unique (user_id, subject_id, resource_id, resource_scope)
);

create table if not exists public.subject_review_items (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users(id) on delete cascade,
    subject_id uuid not null references public.subjects(id) on delete cascade,
    conversation_id uuid references public.conversations(id) on delete set null,
    source_message_id uuid references public.conversation_messages(id) on delete set null,
    original_text text not null default '',
    polished_text text not null default '',
    harvest_text text not null default '',
    status text not null default 'pending',
    metadata jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

alter table public.learning_tasks
    add column if not exists subject_id uuid references public.subjects(id) on delete set null,
    add column if not exists draft_id uuid references public.planning_drafts(id) on delete set null,
    add column if not exists conversation_id uuid references public.conversations(id) on delete set null;

alter table public.study_sessions
    add column if not exists subject_id uuid references public.subjects(id) on delete set null,
    add column if not exists conversation_id uuid references public.conversations(id) on delete set null;

create index if not exists subjects_user_idx on public.subjects (user_id, archived_at, updated_at desc);
create index if not exists conversations_user_type_idx on public.conversations (user_id, type, updated_at desc);
create index if not exists conversations_subject_idx on public.conversations (subject_id, updated_at desc);
create index if not exists conversation_messages_conversation_idx on public.conversation_messages (conversation_id, created_at);
create index if not exists planning_drafts_conversation_idx on public.planning_drafts (planning_conversation_id, status, updated_at desc);
create index if not exists subject_resources_subject_idx on public.subject_resources (subject_id, resource_scope);
create index if not exists subject_review_items_subject_idx on public.subject_review_items (subject_id, status, updated_at desc);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
    new.updated_at = now();
    return new;
end;
$$;

drop trigger if exists set_subjects_updated_at on public.subjects;
create trigger set_subjects_updated_at
    before update on public.subjects
    for each row execute function public.set_updated_at();

drop trigger if exists set_conversations_updated_at on public.conversations;
create trigger set_conversations_updated_at
    before update on public.conversations
    for each row execute function public.set_updated_at();

drop trigger if exists set_planning_drafts_updated_at on public.planning_drafts;
create trigger set_planning_drafts_updated_at
    before update on public.planning_drafts
    for each row execute function public.set_updated_at();

drop trigger if exists set_subject_review_items_updated_at on public.subject_review_items;
create trigger set_subject_review_items_updated_at
    before update on public.subject_review_items
    for each row execute function public.set_updated_at();

alter table public.subjects enable row level security;
alter table public.conversations enable row level security;
alter table public.conversation_messages enable row level security;
alter table public.planning_drafts enable row level security;
alter table public.subject_resources enable row level security;
alter table public.subject_review_items enable row level security;

drop policy if exists "subjects_own_all" on public.subjects;
create policy "subjects_own_all" on public.subjects
    for all to authenticated
    using (auth.uid() = user_id)
    with check (auth.uid() = user_id);

drop policy if exists "conversations_own_all" on public.conversations;
create policy "conversations_own_all" on public.conversations
    for all to authenticated
    using (auth.uid() = user_id)
    with check (auth.uid() = user_id);

drop policy if exists "conversation_messages_own_all" on public.conversation_messages;
create policy "conversation_messages_own_all" on public.conversation_messages
    for all to authenticated
    using (auth.uid() = user_id)
    with check (auth.uid() = user_id);

drop policy if exists "planning_drafts_own_all" on public.planning_drafts;
create policy "planning_drafts_own_all" on public.planning_drafts
    for all to authenticated
    using (auth.uid() = user_id)
    with check (auth.uid() = user_id);

drop policy if exists "subject_resources_own_all" on public.subject_resources;
create policy "subject_resources_own_all" on public.subject_resources
    for all to authenticated
    using (auth.uid() = user_id)
    with check (auth.uid() = user_id);

drop policy if exists "subject_review_items_own_all" on public.subject_review_items;
create policy "subject_review_items_own_all" on public.subject_review_items
    for all to authenticated
    using (auth.uid() = user_id)
    with check (auth.uid() = user_id);

grant select, insert, update, delete on public.subjects to authenticated;
grant select, insert, update, delete on public.conversations to authenticated;
grant select, insert, update, delete on public.conversation_messages to authenticated;
grant select, insert, update, delete on public.planning_drafts to authenticated;
grant select, insert, update, delete on public.subject_resources to authenticated;
grant select, insert, update, delete on public.subject_review_items to authenticated;
