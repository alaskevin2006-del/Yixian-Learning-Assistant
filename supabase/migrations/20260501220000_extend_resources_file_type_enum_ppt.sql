-- Extend resources.file_type enum to support ppt/pptx for private uploads.
-- Safe to run multiple times. Does nothing if resources.file_type is not an enum.

do $$
declare
    enum_type text;
begin
    select c.udt_name
    into enum_type
    from information_schema.columns c
    where c.table_schema = 'public'
      and c.table_name = 'resources'
      and c.column_name = 'file_type'
      and c.data_type = 'USER-DEFINED'
    limit 1;

    if enum_type is null then
        return;
    end if;

    execute format('alter type public.%I add value if not exists %L', enum_type, 'ppt');
    execute format('alter type public.%I add value if not exists %L', enum_type, 'pptx');
end $$;
