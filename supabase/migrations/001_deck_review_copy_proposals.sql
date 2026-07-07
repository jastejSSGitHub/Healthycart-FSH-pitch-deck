-- Deck Delta · Copy proposals review (Phase 1)
-- Applied to FSH Creative Hub Supabase project

create table if not exists public.deck_review_items (
  id text primary key,
  tool text not null,
  project_slug text not null default 'healthy-cart',
  title text not null,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.deck_review_decisions (
  id uuid primary key default gen_random_uuid(),
  item_id text not null references public.deck_review_items(id) on delete cascade,
  reviewer_id text not null,
  reviewer_name text not null,
  status text not null check (status in ('approved', 'rejected')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (item_id, reviewer_id)
);

create table if not exists public.deck_review_comments (
  id uuid primary key default gen_random_uuid(),
  item_id text not null references public.deck_review_items(id) on delete cascade,
  reviewer_id text not null,
  reviewer_name text not null,
  body text not null check (char_length(trim(body)) > 0),
  created_at timestamptz not null default now()
);
