-- 25_table_codes_and_realtime.sql
-- Dev-stage table access codes (QR replacement) + enable Supabase Realtime.
-- Idempotent: safe to re-run.

-- 1) Typed, human-enterable access code per table (replaces QR scan in dev/staging).
alter table public.tables add column if not exists access_code text;

create unique index if not exists tables_access_code_key
  on public.tables(access_code) where access_code is not null;

-- Populate codes as <RESTO_PREFIX>-<table_number>, only where missing.
update public.tables t
set access_code = upper(
  case t.restaurant_id
    when '10000000-0000-0000-0000-000000000001' then 'BELLA'
    when '10000000-0000-0000-0000-000000000002' then 'SEDA'
    when '10000000-0000-0000-0000-000000000003' then 'SAKURA'
    else 'TBL'
  end || '-' || t.table_number)
where t.access_code is null;

-- 2) Enable Realtime. The supabase_realtime publication was empty, so every
--    postgres_changes subscription (resto dashboard tables/orders, consumer
--    table session, KDS, notification badge) silently received nothing —
--    e.g. the dashboard kept showing tables as "free" after a guest sat down.
do $$
begin
  if not exists (select 1 from pg_publication_tables
                 where pubname='supabase_realtime' and schemaname='public' and tablename='tables') then
    alter publication supabase_realtime add table public.tables;
  end if;
  if not exists (select 1 from pg_publication_tables
                 where pubname='supabase_realtime' and schemaname='public' and tablename='orders') then
    alter publication supabase_realtime add table public.orders;
  end if;
  if not exists (select 1 from pg_publication_tables
                 where pubname='supabase_realtime' and schemaname='public' and tablename='kds_tickets') then
    alter publication supabase_realtime add table public.kds_tickets;
  end if;
  if not exists (select 1 from pg_publication_tables
                 where pubname='supabase_realtime' and schemaname='public' and tablename='notifications') then
    alter publication supabase_realtime add table public.notifications;
  end if;
end $$;

-- Full row image so filtered/DELETE realtime events carry old values reliably.
alter table public.tables replica identity full;
alter table public.orders replica identity full;
