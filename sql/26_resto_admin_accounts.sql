-- 26_resto_admin_accounts.sql
-- Reproduces DB-only migration `resto_admin_accounts` (version 20260615144003),
-- which until now existed only in supabase_migrations.schema_migrations on the
-- preview project (qqwvtuckljwvwrvyrjbn) and was never tracked in this repo.
--
-- WHY: DATABASE.md and ARCHITECTURE.md flag this as a "migration that exists
-- only in the DB" -- prod was cloned from preview's schema via
-- sql/_prod_baseline*.sql, so anything not tracked in sql/ can silently drift
-- or be impossible to reproduce on a fresh environment. This file restores
-- reproducibility for the STRUCTURE of the migration (one admin `staff` row
-- per seed restaurant, auth.users + auth.identities rows for each).
--
-- SECURITY NOTE -- READ BEFORE RUNNING:
-- The original migration embedded three PLAINTEXT passwords directly in SQL
-- (admin@bella-roma.rufesto.com / admin@seda-ocagi.rufesto.com /
-- admin@sakura-house.rufesto.com). Those values are NOT reproduced here on
-- purpose -- do not put plaintext credentials in a git-tracked file.
-- The placeholders below (<SET-BEFORE-RUNNING>) MUST be replaced with fresh,
-- strong passwords in a local, untracked copy before this is ever executed
-- again (e.g. to stand up a new environment). The live preview/prod databases
-- already have these accounts from the original DB-only migration; you do NOT
-- need to re-run this file against them. If the three admin accounts' current
-- passwords were ever committed to git history anywhere, rotate them.
--
-- This file is idempotent (skips any email that already has an auth user) so
-- it is safe to keep in the migration history even though it should normally
-- be a no-op against preview/prod.

BEGIN;

do $$
declare
  r record;
  uid uuid;
begin
  for r in
    select * from (values
      ('admin@bella-roma.rufesto.com',   '<SET-BEFORE-RUNNING>', '10000000-0000-0000-0000-000000000001'::uuid, 'Bella Roma Admin'),
      ('admin@seda-ocagi.rufesto.com',   '<SET-BEFORE-RUNNING>', '10000000-0000-0000-0000-000000000002'::uuid, 'Seda Ocagi Admin'),
      ('admin@sakura-house.rufesto.com', '<SET-BEFORE-RUNNING>', '10000000-0000-0000-0000-000000000003'::uuid, 'Sakura House Admin')
    ) as t(email, pw, restaurant_id, fullname)
  loop
    -- Refuse to run with the placeholder still in place -- forces whoever
    -- re-runs this to supply real passwords out-of-band instead of committing them.
    if r.pw = '<SET-BEFORE-RUNNING>' then
      raise exception 'sql/26_resto_admin_accounts.sql: replace the <SET-BEFORE-RUNNING> placeholder with a real password in a local, untracked copy before running';
    end if;

    -- skip if this email already has an auth user
    if exists (select 1 from auth.users where email = r.email) then
      continue;
    end if;

    uid := gen_random_uuid();

    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, created_at, updated_at,
      raw_app_meta_data, raw_user_meta_data,
      confirmation_token, recovery_token, email_change_token_new, email_change,
      email_change_token_current, phone_change, phone_change_token, reauthentication_token
    ) values (
      '00000000-0000-0000-0000-000000000000', uid, 'authenticated', 'authenticated',
      r.email, crypt(r.pw, gen_salt('bf')),
      now(), now(), now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      jsonb_build_object('name', r.fullname),
      '', '', '', '', '', '', '', ''
    );

    insert into auth.identities (
      id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at
    ) values (
      gen_random_uuid(), uid, uid::text,
      jsonb_build_object('sub', uid::text, 'email', r.email, 'email_verified', true, 'phone_verified', false),
      'email', now(), now(), now()
    );

    -- public.users row is auto-created by the on_auth_user_created trigger.
    insert into public.staff (restaurant_id, user_id, role, is_active)
    values (r.restaurant_id, uid, 'admin', true)
    on conflict (restaurant_id, user_id) do nothing;
  end loop;
end $$;

COMMIT;
