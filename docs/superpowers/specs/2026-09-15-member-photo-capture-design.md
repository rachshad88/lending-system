# Member photo & ID capture — design

## Purpose

Members currently have no visual record attached to their profile. Admins want to
attach both a photo of the member and a photo/scan of a government ID — captured
when a member is first added, and retrofittable for the members already in the
system today. Either image can be replaced later.

## Decisions made during brainstorming

- Capture **both** a member photo and an ID photo (not just one).
- Available at **member creation**, and separately **addable/editable later** on
  a member who doesn't have one yet (most existing members).
- Images are **downscaled client-side before upload** (~1600px wide, ~80% JPEG
  quality) rather than storing the phone camera's raw file, to keep Supabase's
  free-tier storage budget under control across ~150+ members × 2 images each.

## Storage & data model

- New Supabase Storage bucket: `member-photos`. **Private** — no public access,
  RLS restricted to admins via the same `is_admin()` check used on every other
  table in this app. Nothing in this app is ever publicly reachable; this bucket
  follows that rule.
- Two new nullable columns on `members`: `photo_path text`, `id_photo_path text`.
  These hold the storage object path, not a URL (the bucket is private, so a URL
  alone wouldn't be viewable).
- Paths are **deterministic**: `members/{member_id}/photo.jpg` and
  `members/{member_id}/id.jpg`. This means "replace" is just an upload to the
  same path with `upsert: true` — no separate edit/delete-then-reupload logic.
- Migration `0013_member_photos.sql`:
  - `insert into storage.buckets (id, name, public) values ('member-photos', 'member-photos', false)`
  - RLS policies on `storage.objects` for that bucket: admins can `select`,
    `insert`, and `update` (no public policy at all).
  - `alter table members add column photo_path text, add column id_photo_path text;`

## Capture & upload flow

- A small reusable upload control: a file input (`accept="image/*"`, with a
  camera-capture hint on mobile so tapping it opens the phone's camera directly
  rather than requiring a custom in-app camera UI — simplest option that still
  gives a native "take a photo" experience on a phone).
- Used in three places:
  1. The New Member form — both fields optional.
  2. An existing member's page, for whichever field is still empty.
  3. An existing member's page, to replace either field that's already set.
- On file selection, the image is drawn to an off-screen `<canvas>`, resized to
  max 1600px on the long edge, and re-encoded as JPEG (~0.8 quality) before
  upload — producing a blob well under 500KB regardless of the source photo's
  size.
- Upload calls `supabase.storage.from('member-photos').upload(path, blob, { upsert: true })`,
  then writes the (unchanged, since deterministic) path into the member's row.
- Member creation is **not blocked** by a photo upload failing — the member
  record saves regardless, with a clear inline note if a photo didn't attach,
  so it can be retried from the member's own page afterward.

## Display

- A `MemberPhoto` component, used only on the member detail page (not added to
  the Members list). A private bucket means every displayed image needs a
  short-lived signed URL generated on the fly (`createSignedUrl`) — doing that
  for every row in a paginated list would mean a burst of extra requests just to
  paint thumbnails nobody asked to see yet, so it's scoped out.
- A member with no photo on a given field shows a plain "Add photo" placeholder
  instead of a broken image.

## Security

- Bucket is private end-to-end: no public URLs are ever generated or stored,
  only signed URLs with a short expiry, fetched fresh each time the member page
  loads. Access to generate a signed URL is itself gated by the same
  `is_admin()` RLS policy as every other read in this app.

## Testing

Manual, since this project has no automated test suite yet (consistent with how
every other feature in this codebase has been verified so far):

- Upload from a desktop file picker and from an actual phone camera.
- Confirm the uploaded file size reflects the client-side downscale.
- Confirm replacing a photo overwrites the existing one (same path, `upsert`).
- Confirm a member can be created with zero photos, and photos added later.
- Confirm an existing member with no photos gets a working retrofit path for
  both fields independently.
- `npm run build` as a final sanity check.
