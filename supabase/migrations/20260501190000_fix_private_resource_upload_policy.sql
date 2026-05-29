-- Private resource upload policy for the internal preview.
-- Run this after the resources table exists. It does not create chunks or Pinecone data.

insert into storage.buckets (id, name, public)
values ('resource-files', 'resource-files', false)
on conflict (id) do nothing;

drop policy if exists "resource_files_private_select_own" on storage.objects;
create policy "resource_files_private_select_own"
    on storage.objects
    for select
    to authenticated
    using (
        bucket_id = 'resource-files'
        and name like ('private/' || auth.uid()::text || '/%')
    );

drop policy if exists "resource_files_private_insert_own" on storage.objects;
create policy "resource_files_private_insert_own"
    on storage.objects
    for insert
    to authenticated
    with check (
        bucket_id = 'resource-files'
        and name like ('private/' || auth.uid()::text || '/%')
    );

drop policy if exists "resource_files_private_update_own" on storage.objects;
create policy "resource_files_private_update_own"
    on storage.objects
    for update
    to authenticated
    using (
        bucket_id = 'resource-files'
        and name like ('private/' || auth.uid()::text || '/%')
    )
    with check (
        bucket_id = 'resource-files'
        and name like ('private/' || auth.uid()::text || '/%')
    );

do $$
begin
    if to_regclass('public.resources') is not null then
        execute 'alter table public.resources enable row level security';

        execute 'drop policy if exists "resources_select_public_or_own_private" on public.resources';
        execute $policy$
            create policy "resources_select_public_or_own_private"
                on public.resources
                for select
                to authenticated
                using (
                    scope = 'public'
                    or (scope = 'private' and owner_user_id = auth.uid())
                )
        $policy$;

        execute 'drop policy if exists "resources_insert_own_private" on public.resources';
        execute $policy$
            create policy "resources_insert_own_private"
                on public.resources
                for insert
                to authenticated
                with check (
                    scope = 'private'
                    and owner_user_id = auth.uid()
                    and type = 'file'
                )
        $policy$;

        execute 'drop policy if exists "resources_update_own_private" on public.resources';
        execute $policy$
            create policy "resources_update_own_private"
                on public.resources
                for update
                to authenticated
                using (
                    scope = 'private'
                    and owner_user_id = auth.uid()
                )
                with check (
                    scope = 'private'
                    and owner_user_id = auth.uid()
                )
        $policy$;
    end if;
end $$;
