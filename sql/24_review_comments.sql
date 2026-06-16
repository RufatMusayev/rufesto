-- 24_review_comments.sql — Twitter-style replies to reviews.
-- reviews = feed posts (shown in main feed). review_comments = replies (never shown in feed).
-- Separate table keeps reviews' UNIQUE(dish_id,user_id) + "must have ordered" trigger untouched.
create table if not exists public.review_comments (
  id uuid primary key default gen_random_uuid(),
  review_id uuid not null references public.reviews(id) on delete cascade,
  user_id  uuid not null references public.users(id)   on delete cascade,
  body  text,
  photo text,
  is_flagged boolean not null default false,
  created_at timestamptz not null default now(),
  constraint review_comments_has_content check (body is not null or photo is not null)
);
create index if not exists idx_review_comments_review on public.review_comments(review_id, created_at);
alter table public.review_comments enable row level security;
drop policy if exists review_comments_select on public.review_comments;
create policy review_comments_select on public.review_comments for select using (is_flagged = false);
drop policy if exists review_comments_insert on public.review_comments;
create policy review_comments_insert on public.review_comments for insert with check (auth.uid() = user_id);
drop policy if exists review_comments_delete on public.review_comments;
create policy review_comments_delete on public.review_comments for delete using (auth.uid() = user_id);
-- LESSON (see 20_grants_fix.sql): every new table needs explicit GRANT + RLS, or PostgREST 403s.
grant select on public.review_comments to anon, authenticated;
grant insert, delete on public.review_comments to authenticated;
