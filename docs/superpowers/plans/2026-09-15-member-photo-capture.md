# Member Photo/ID Capture Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an admin attach a photo of the member and a photo of their ID to a member's profile — at creation, or added/replaced later — stored privately in Supabase Storage.

**Architecture:** One private Storage bucket (`member-photos`) with admin-only RLS, two new nullable path columns on `members`, a dumb file-input-plus-resize capture control reused in two contexts (immediate upload on an existing member's page, deferred upload right after a new member is created), and a display component that turns a stored path into a short-lived signed URL.

**Tech Stack:** React + Vite, Supabase (Postgres + Storage), Tailwind CSS v4. No automated test framework exists in this repo — every other feature so far has been verified by running the dev server and checking it in the browser, plus `npm run build` as a compile-time safety net. This plan follows that same convention instead of introducing a test runner as an unrelated side effect.

**Spec:** `docs/superpowers/specs/2026-09-15-member-photo-capture-design.md`

## Global Constraints

- Bucket is **private** — no public URLs anywhere, ever. RLS on `storage.objects` uses the same `is_admin()` check already used on every table (see `members_admin_all` policy).
- Object paths are **deterministic**: `members/{member_id}/photo.jpg` and `members/{member_id}/id.jpg`. Replace = upload to the same path with `upsert: true`. Never generate a random filename.
- Every image is **resized client-side before upload**: max 1600px on the long edge, JPEG quality 0.8, via `<canvas>`. Never upload the raw camera file.
- New-member creation is **never blocked** by a photo upload failure — the member row saves regardless, with an inline note if a photo didn't attach.
- The Members **list** page is explicitly out of scope for photos (would mean a signed-url fetch per row). Only the member detail page and the new-member form touch this feature.
- Migration file is `supabase/migrations/0014_member_photos.sql` (0013 already went to an unrelated audit-log migration built earlier the same day).

---

### Task 1: Storage bucket, RLS, and `members` columns

**Files:**
- Create: `supabase/migrations/0014_member_photos.sql`

**Interfaces:**
- Produces: bucket `member-photos` (private); `members.photo_path text`, `members.id_photo_path text` (both nullable) — later tasks read/write these.

- [ ] **Step 1: Write the migration**

```sql
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
```

- [ ] **Step 2: Apply the migration**

Use the Supabase MCP `apply_migration` tool with `name: "member_photos"` and the SQL above (or, outside this environment, paste it into the Supabase SQL Editor per this repo's usual migration process).

- [ ] **Step 3: Verify**

Run:
```sql
select id, public from storage.buckets where id = 'member-photos';
select column_name from information_schema.columns
where table_name = 'members' and column_name in ('photo_path', 'id_photo_path');
select policyname, cmd, qual from pg_policies where tablename = 'objects' and policyname = 'member_photos_admin_all';
```
Expected: one bucket row with `public = false`; both columns present; one policy row with `qual` containing `is_admin()`.

- [ ] **Step 4: Copy the applied SQL into the migration file and commit**

Save the exact SQL from Step 1 to `supabase/migrations/0014_member_photos.sql`, then:

```bash
git add supabase/migrations/0014_member_photos.sql
git commit -m "Add member-photos storage bucket, RLS, and members columns"
```

---

### Task 2: Image resize utility and photo API functions

**Files:**
- Create: `src/lib/imageResize.js`
- Modify: `src/lib/api.js` — add after the `updateMember` function

**Interfaces:**
- Consumes: `supabase` client from `./supabase`; `unwrap()` helper already defined at the top of `api.js`.
- Produces: `resizeImageToBlob(file, options?) => Promise<Blob>` (JPEG blob); `uploadMemberPhoto(memberId, kind, blob) => Promise<{id}>` where `kind` is `'photo'` or `'id'`; `getMemberPhotoSignedUrl(path) => Promise<string|null>`. Task 3 and Task 4 call these directly by name.

- [ ] **Step 1: Create the resize utility**

```js
// src/lib/imageResize.js

/**
 * Downscales an image file to at most `maxDim` on its long edge and
 * re-encodes it as JPEG, so a multi-MB phone camera photo never gets
 * uploaded as-is. Returns a Blob ready to hand to Supabase Storage.
 */
export function resizeImageToBlob(file, { maxDim = 1600, quality = 0.8 } = {}) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
      const width = Math.round(img.width * scale);
      const height = Math.round(img.height * scale);

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, width, height);

      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error('Could not process that image.'))),
        'image/jpeg',
        quality
      );
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('Could not read that image file.'));
    };
    img.src = objectUrl;
  });
}
```

- [ ] **Step 2: Add the photo API functions to `api.js`**

Insert immediately after the `updateMember` function (the one that does `supabase.from('members').update(values)...`):

```js
const MEMBER_PHOTO_BUCKET = 'member-photos';

function memberPhotoPath(memberId, kind) {
  return `members/${memberId}/${kind === 'id' ? 'id' : 'photo'}.jpg`;
}

/** Uploads a resized photo (see imageResize.js) and points the member row at it. `kind` is 'photo' or 'id'. */
export async function uploadMemberPhoto(memberId, kind, blob) {
  const path = memberPhotoPath(memberId, kind);
  const { error: uploadError } = await supabase.storage
    .from(MEMBER_PHOTO_BUCKET)
    .upload(path, blob, { upsert: true, contentType: 'image/jpeg' });
  if (uploadError) throw new Error(uploadError.message);

  const column = kind === 'id' ? 'id_photo_path' : 'photo_path';
  return unwrap(
    await supabase.from('members').update({ [column]: path }).eq('id', memberId).select('id').single()
  );
}

/** The bucket is private, so every display of a photo needs a fresh short-lived signed URL. */
export async function getMemberPhotoSignedUrl(path) {
  if (!path) return null;
  const { data, error } = await supabase.storage.from(MEMBER_PHOTO_BUCKET).createSignedUrl(path, 300);
  if (error) throw new Error(error.message);
  return data.signedUrl;
}
```

- [ ] **Step 3: Build check**

Run: `npm run build`
Expected: succeeds with no errors (there's no UI wired to these functions yet, so this only confirms the code compiles — Task 3 exercises it for real).

- [ ] **Step 4: Commit**

```bash
git add src/lib/imageResize.js src/lib/api.js
git commit -m "Add image resize utility and member photo upload/signed-url functions"
```

---

### Task 3: Capture control, display component, and MemberDetail wiring

This is the first checkpoint you can actually click through in the browser — by the end of this task, an existing member's page can add, replace, and view both photos.

**Files:**
- Create: `src/components/PhotoUpload.jsx`
- Create: `src/components/MemberPhoto.jsx`
- Modify: `src/pages/MemberDetail.jsx:1-26` (imports) and `src/pages/MemberDetail.jsx:226` (insert a new section before the existing "Profile" `SectionCard`)

**Interfaces:**
- Consumes: `resizeImageToBlob`, `uploadMemberPhoto`, `getMemberPhotoSignedUrl` from Task 2; `useAsync` from `../lib/useAsync`; `Icon`, `Spinner` from `./ui` (the `camera` icon already exists in `src/components/ui.jsx`'s `ICONS` map).
- Produces: `<PhotoUpload label onSelect(blob) disabled />` (fires `onSelect` with a resized Blob, uploads nothing itself); `<MemberPhoto memberId path kind label onUploaded />` (`kind` is `'photo'` or `'id'`) — Task 4 reuses `PhotoUpload` directly.

- [ ] **Step 1: Create the capture control**

```jsx
// src/components/PhotoUpload.jsx
import { useRef, useState } from 'react';
import { Icon } from './ui';
import { resizeImageToBlob } from '../lib/imageResize';

/**
 * A file input with a camera-capture hint on mobile, resizing the picked
 * image client-side before handing it back. Upload mechanics live with the
 * caller (immediate on an existing member's page, deferred until a new
 * member has an id) — this component only ever produces a Blob.
 */
export default function PhotoUpload({ label, onSelect, disabled }) {
  const inputRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const handleChange = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setError(null);
    setBusy(true);
    try {
      const blob = await resizeImageToBlob(file);
      onSelect(blob);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <button
        type="button"
        className="btn btn-outline"
        onClick={() => inputRef.current?.click()}
        disabled={disabled || busy}
      >
        <Icon name="camera" size={16} />
        {busy ? 'Processing…' : label}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={handleChange}
      />
      {error && <p className="mt-1.5 text-xs text-red">{error}</p>}
    </div>
  );
}
```

- [ ] **Step 2: Create the display + immediate-upload wrapper**

```jsx
// src/components/MemberPhoto.jsx
import { useState } from 'react';
import PhotoUpload from './PhotoUpload';
import { Icon, Spinner } from './ui';
import { useAsync } from '../lib/useAsync';
import { getMemberPhotoSignedUrl, uploadMemberPhoto } from '../lib/api';

/**
 * Shows a member's stored photo (fetched as a fresh signed URL, since the
 * bucket is private) or a placeholder, plus an add/replace control. Used
 * only on the member detail page — not the Members list, where a signed-url
 * fetch per row would be wasted work for photos nobody's looking at yet.
 */
export default function MemberPhoto({ memberId, path, kind, label, onUploaded }) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState(null);
  const signedUrl = useAsync(() => getMemberPhotoSignedUrl(path), [path]);

  const handleSelect = async (blob) => {
    setError(null);
    setUploading(true);
    try {
      await uploadMemberPhoto(memberId, kind, blob);
      onUploaded();
    } catch (err) {
      setError(err.message);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div>
      <p className="mb-2 text-xs font-bold uppercase tracking-wide text-faint">{label}</p>
      <div className="mb-2 flex h-40 w-full max-w-[220px] items-center justify-center overflow-hidden rounded-xl border border-line bg-canvas">
        {path && signedUrl.data ? (
          <img src={signedUrl.data} alt={label} className="h-full w-full object-cover" />
        ) : path && signedUrl.loading ? (
          <Spinner size={20} />
        ) : (
          <Icon name="camera" size={28} className="text-faint" />
        )}
      </div>
      <PhotoUpload
        label={path ? `Replace ${label.toLowerCase()}` : `Add ${label.toLowerCase()}`}
        onSelect={handleSelect}
        disabled={uploading}
      />
      {uploading && <p className="mt-1.5 text-xs text-muted">Uploading…</p>}
      {error && <p className="mt-1.5 text-xs text-red">{error}</p>}
    </div>
  );
}
```

Note: `path` changing (once the parent reloads the member after a successful upload) is exactly what re-triggers `useAsync`'s fetch — there's no manual reload call needed here.

- [ ] **Step 3: Wire two `MemberPhoto` instances into MemberDetail**

In `src/pages/MemberDetail.jsx`, add the import alongside the existing component imports (after the `ReliabilityPanel` import on line 6):

```js
import MemberPhoto from '../components/MemberPhoto';
```

Then, immediately before the existing `<SectionCard title="Profile" ...>` block (currently at line 226), insert:

```jsx
          <SectionCard title="Photos" bodyClass="p-4 sm:p-5">
            <div className="grid grid-cols-2 gap-4">
              <MemberPhoto
                memberId={id}
                path={m.photo_path}
                kind="photo"
                label="Member photo"
                onUploaded={member.reload}
              />
              <MemberPhoto
                memberId={id}
                path={m.id_photo_path}
                kind="id"
                label="ID photo"
                onUploaded={member.reload}
              />
            </div>
          </SectionCard>

```

(`id` here is the route param already in scope from `useParams()`; `member` is the existing `useAsync(() => getMember(id), [id])` result at the top of the component, and `m` is `member.data`.)

- [ ] **Step 4: Manual verification**

1. Start the dev server (`npm run dev`, or the existing `lending-dev`/`lending-dev-host` preview config) and sign in.
2. Open any existing member's page. Confirm a new "Photos" card shows two placeholders, each with an "Add photo" / "Add ID photo" button.
3. Click one, pick an image file. Confirm it uploads (brief "Uploading…"), then the thumbnail appears and the button now reads "Replace …".
4. Refresh the page. Confirm the photo still shows (proves the path was actually saved and the signed URL round-trip works after a fresh load, not just from local state).
5. Click "Replace …" on the same field with a different image. Confirm the thumbnail updates to the new image (proves `upsert: true` actually overwrote the same object).
6. In the Supabase dashboard, open Storage → `member-photos` and confirm the file size is small (well under 1MB) even if the source photo was a large phone camera file — proves the client-side resize actually ran.

- [ ] **Step 5: Commit**

```bash
git add src/components/PhotoUpload.jsx src/components/MemberPhoto.jsx src/pages/MemberDetail.jsx
git commit -m "Add photo capture and display to the member detail page"
```

---

### Task 4: Optional photos on the New Member form

**Files:**
- Modify: `src/components/MemberForm.jsx` (entire file — see full replacement below)
- Modify: `src/pages/Members.jsx` — the `onSubmit` prop passed to `<MemberForm>` (currently around line 232)

**Interfaces:**
- Consumes: `PhotoUpload` from Task 3; `uploadMemberPhoto` from Task 2; `createMember` from `../lib/api` (already imported in `Members.jsx`).
- Produces: nothing new consumed elsewhere — this is the last task.

- [ ] **Step 1: Replace `src/components/MemberForm.jsx`**

The only behavioral changes from the current file: (a) when NOT editing (`!initial`, i.e. the "New member" form, not "Edit member"), two optional photo capture controls appear; (b) after a successful create, if any selected photo failed to upload, the modal stays open showing a warning instead of closing, with its Cancel button relabeled "Close" so there's no way to accidentally resubmit and create a duplicate member.

```jsx
import { useState } from 'react';
import Modal from './Modal';
import PhotoUpload from './PhotoUpload';
import { Spinner } from './ui';
import { uploadMemberPhoto } from '../lib/api';

const FIELDS = [
  { name: 'name', label: 'Full name', required: true, placeholder: 'Juan Santos', span: 2 },
  { name: 'contact_number', label: 'Contact number', placeholder: '09XX XXX XXXX' },
  { name: 'vehicle_number', label: 'Vehicle / body number', placeholder: 'TRC-0123' },
  { name: 'toda', label: 'TODA / place of work', placeholder: 'Bagumbayan TODA' },
  { name: 'collateral', label: 'Collateral', placeholder: 'Tricycle OR/CR' },
  { name: 'spouse_name', label: "Spouse's name", placeholder: 'Maria Santos' },
  { name: 'referred_by', label: 'Referred by', placeholder: 'Who introduced them' },
  { name: 'address', label: 'Address', placeholder: 'Purok 1, Brgy. San Roque', span: 2 },
];

const EMPTY = FIELDS.reduce((acc, field) => ({ ...acc, [field.name]: '' }), { notes: '' });

export default function MemberForm({ open, onClose, onSubmit, initial, title }) {
  const [values, setValues] = useState(() => ({ ...EMPTY, ...stripNulls(initial) }));
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [photoBlob, setPhotoBlob] = useState(null);
  const [idPhotoBlob, setIdPhotoBlob] = useState(null);
  const [photoWarning, setPhotoWarning] = useState(null);
  const [savedId, setSavedId] = useState(null);

  const setField = (name) => (event) =>
    setValues((prev) => ({ ...prev, [name]: event.target.value }));

  const submit = async (event) => {
    event.preventDefault();
    if (savedId) {
      onClose();
      return;
    }
    if (!values.name.trim()) {
      setError('A name is required.');
      return;
    }
    setError(null);
    setBusy(true);
    try {
      const payload = Object.fromEntries(
        Object.entries(values).map(([key, value]) => [
          key,
          typeof value === 'string' ? value.trim() || null : value,
        ])
      );
      const result = await onSubmit(payload);

      if (!initial && (photoBlob || idPhotoBlob) && result?.id) {
        const failures = [];
        if (photoBlob) {
          try {
            await uploadMemberPhoto(result.id, 'photo', photoBlob);
          } catch {
            failures.push('photo');
          }
        }
        if (idPhotoBlob) {
          try {
            await uploadMemberPhoto(result.id, 'id', idPhotoBlob);
          } catch {
            failures.push('ID photo');
          }
        }
        if (failures.length) {
          setSavedId(result.id);
          setPhotoWarning(
            `${values.name.trim()} was saved, but the ${failures.join(' and ')} didn't upload. Add it from their page.`
          );
          return;
        }
      }

      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title ?? 'New member'}
      subtitle="Only the name is required. The rest helps you find and follow up on them later."
      size="lg"
      footer={
        <>
          {!savedId && (
            <button type="button" className="btn btn-outline" onClick={onClose} disabled={busy}>
              Cancel
            </button>
          )}
          <button type="submit" form="member-form" className="btn btn-primary" disabled={busy}>
            {busy ? <Spinner size={18} label="Saving" /> : savedId ? 'Close' : 'Save member'}
          </button>
        </>
      }
    >
      <form id="member-form" onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
        <fieldset disabled={Boolean(savedId)} className="contents">
          {FIELDS.map((field) => (
            <div key={field.name} className={field.span === 2 ? 'sm:col-span-2' : undefined}>
              <label className="label" htmlFor={`mf-${field.name}`}>
                {field.label}
                {field.required && <span className="text-red"> *</span>}
              </label>
              <input
                id={`mf-${field.name}`}
                className="input"
                value={values[field.name] ?? ''}
                onChange={setField(field.name)}
                placeholder={field.placeholder}
                required={field.required}
              />
            </div>
          ))}

          <div className="sm:col-span-2">
            <label className="label" htmlFor="mf-notes">
              Notes
            </label>
            <textarea
              id="mf-notes"
              className="textarea"
              value={values.notes ?? ''}
              onChange={setField('notes')}
              placeholder="Anything worth remembering about this member"
            />
          </div>

          {!initial && (
            <div className="grid gap-4 sm:col-span-2 sm:grid-cols-2">
              <div>
                <p className="label">Member photo</p>
                <PhotoUpload
                  label={photoBlob ? 'Photo selected' : 'Add photo'}
                  onSelect={setPhotoBlob}
                  disabled={Boolean(savedId)}
                />
              </div>
              <div>
                <p className="label">ID photo</p>
                <PhotoUpload
                  label={idPhotoBlob ? 'ID photo selected' : 'Add ID photo'}
                  onSelect={setIdPhotoBlob}
                  disabled={Boolean(savedId)}
                />
              </div>
            </div>
          )}
        </fieldset>

        {error && (
          <p role="alert" className="rounded-xl bg-red-soft px-4 py-3 text-sm sm:col-span-2">
            {error}
          </p>
        )}
        {photoWarning && (
          <p className="rounded-xl bg-amber-soft px-4 py-3 text-sm sm:col-span-2">{photoWarning}</p>
        )}
      </form>
    </Modal>
  );
}

function stripNulls(source) {
  if (!source) return {};
  return Object.fromEntries(Object.entries(source).map(([key, value]) => [key, value ?? '']));
}
```

- [ ] **Step 2: Make `Members.jsx` return the created member so the form knows its id**

In `src/pages/Members.jsx`, find:

```jsx
          onSubmit={async (values) => {
            await createMember(values);
            reload();
          }}
```

Replace with:

```jsx
          onSubmit={async (values) => {
            const created = await createMember(values);
            reload();
            return created;
          }}
```

(`createMember` already returns `{id}` — see its definition in `api.js`. `MemberDetail.jsx`'s own `<MemberForm>` usage for editing passes `initial={m}`, so the new photo-upload branch in `submit` is skipped there entirely — no change needed on that call site.)

- [ ] **Step 3: Manual verification**

1. From the Members list, click "Add member". Confirm the two photo controls appear (they didn't before this task) alongside the existing fields.
2. Fill in a name, attach both a member photo and an ID photo, save. Confirm the modal closes and the new member appears in the list.
3. Open that new member's page and confirm both photos are already there (proves the deferred upload-after-create path works).
4. Repeat, but create a member with **no** photos attached. Confirm it saves normally and the member's page shows two empty "Add photo" placeholders (proves photos stay fully optional).
5. Open the Edit member form (from an existing member's page) and confirm the two photo controls do **not** appear there — retrofitting/replacing photos only happens from the member's own page, not through this shared edit form.

- [ ] **Step 4: Full-project build check**

Run: `npm run build`
Expected: succeeds with no errors, no new warnings beyond what already existed before this plan.

- [ ] **Step 5: Commit**

```bash
git add src/components/MemberForm.jsx src/pages/Members.jsx
git commit -m "Add optional member/ID photos to the New Member form"
```

---

## Self-Review Notes

- **Spec coverage:** private bucket + RLS (Task 1); client-side downscale (Task 2, used by Task 3 & 4); deterministic paths / upsert-as-replace (Task 2); capture at creation (Task 4) and retrofit/replace on an existing member (Task 3); non-blocking creation with an inline note on partial failure (Task 4); display only on the member detail page, never the Members list (Task 3, and explicitly not touched anywhere in Task 4) — all covered.
- **Placeholder scan:** none — every step has real, complete code.
- **Type/name consistency:** `kind` is `'photo' | 'id'` everywhere it's threaded through (`uploadMemberPhoto`, `MemberPhoto`, `MemberForm`'s two `PhotoUpload` calls). `memberId`/`path`/`onUploaded`/`onSelect` prop names match between each component's definition (Task 3) and every call site (Task 3 and Task 4).
