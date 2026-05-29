-- Allow authenticated users to manage their own temporary attachment files.
-- This only covers resource-files/temp/{auth.uid()}/... and does not affect private resources.

insert into storage.buckets (id, name, public)
values ('resource-files', 'resource-files', false)
on conflict (id) do nothing;

drop policy if exists "resource_files_temp_select_own" on storage.objects;
create policy "resource_files_temp_select_own"
    on storage.objects
    for select
    to authenticated
    using (
        bucket_id = 'resource-files'
        and name like ('temp/' || auth.uid()::text || '/%')
    );

drop policy if exists "resource_files_temp_insert_own" on storage.objects;
create policy "resource_files_temp_insert_own"
    on storage.objects
    for insert
    to authenticated
    with check (
        bucket_id = 'resource-files'
        and name like ('temp/' || auth.uid()::text || '/%')
    );

drop policy if exists "resource_files_temp_delete_own" on storage.objects;
create policy "resource_files_temp_delete_own"
    on storage.objects
    for delete
    to authenticated
    using (
        bucket_id = 'resource-files'
        and name like ('temp/' || auth.uid()::text || '/%')
    );
