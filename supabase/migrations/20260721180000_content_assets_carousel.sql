-- Multi-image (carousel) support for post creatives.
-- content_assets previously held one image per (run_id, post_index). Add an
-- asset_index slot so a post can carry an ordered set of images (an Instagram
-- carousel is 2–10 of them), and widen the uniqueness accordingly.

alter table public.content_assets
  add column if not exists asset_index int not null default 0;

-- Replace the old one-image-per-post uniqueness with one-per-slot. Existing rows
-- default to asset_index 0, so they remain unique under the new constraint.
alter table public.content_assets
  drop constraint if exists content_assets_run_id_post_index_kind_key;

alter table public.content_assets
  add constraint content_assets_run_post_slot_kind_key
  unique (run_id, post_index, asset_index, kind);
