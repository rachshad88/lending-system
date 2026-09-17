-- ============================================================================
-- 0014 — Member photo & ID capture
--
-- One private Storage bucket for both images a member can have on file (their
-- own photo, and a photo/scan of a government ID). Private end-to-end: no
-- public URL is ever generated, only short-lived signed URLs, and access to
-- even generate one is gated by the same is_admin() check every other table
-- in this app already uses.
-- ============================================================================

insert into storage.buckets (id, name, public)
values ('member-photos', 'member-photos', false)
on conflict (id) do nothing;

create policy "member_photos_admin_all"
on storage.objects
for all
using (bucket_id = 'member-photos' and is_admin())
with check (bucket_id = 'member-photos' and is_admin());

alter table members
  add column if not exists photo_path text,
  add column if not exists id_photo_path text;
