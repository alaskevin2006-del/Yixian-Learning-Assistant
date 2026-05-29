-- Fix private resource upload/list permissions for the preview build.
-- Safe to run after the resources table exists. This does not add private RAG.

insert into storage.buckets (id, name, public)
values ('resource-files', 'resource-files', false)
on conflict (id) do nothing;

drop policy if exists "resource_files_private_select_own_v2" on storage.objects;
create policy "resource_files_private_select_own_v2"
    on storage.objects
    for select
    to authenticated
    using (
        bucket_id = 'resource-files'
        and name like ('private/' || auth.uid()::text || '/%')
    );

drop policy if exists "resource_files_private_insert_own_v2" on storage.objects;
create policy "resource_files_private_insert_own_v2"
    on storage.objects
    for insert
    to authenticated
    with check (
        bucket_id = 'resource-files'
        and name like ('private/' || auth.uid()::text || '/%')
    );

do $$
declare
    enum_type text;
begin
    if to_regclass('public.resources') is null then
        return;
    end if;

    execute 'grant select on table public.resources to authenticated';
    execute 'grant insert on table public.resources to authenticated';
    execute 'grant update on table public.resources to authenticated';

    execute 'alter table public.resources enable row level security';

    execute 'drop policy if exists "resources_select_public_or_own_private_v2" on public.resources';
    execute $policy$
        create policy "resources_select_public_or_own_private_v2"
            on public.resources
            for select
            to authenticated
            using (
                scope = 'public'
                or (scope = 'private' and owner_user_id = auth.uid())
            )
    $policy$;

    execute 'drop policy if exists "resources_insert_own_private_v2" on public.resources';
    execute $policy$
        create policy "resources_insert_own_private_v2"
            on public.resources
            for insert
            to authenticated
            with check (
                scope = 'private'
                and owner_user_id = auth.uid()
                and type = 'file'
                and storage_path like ('private/' || auth.uid()::text || '/%')
            )
    $policy$;

    select c.udt_name
    into enum_type
    from information_schema.columns c
    where c.table_schema = 'public'
      and c.table_name = 'resources'
      and c.column_name = 'file_type'
      and c.data_type = 'USER-DEFINED'
    limit 1;

    if enum_type is not null then
        execute format('alter type public.%I add value if not exists %L', enum_type, 'ppt');
        execute format('alter type public.%I add value if not exists %L', enum_type, 'pptx');
    end if;
end $$;
