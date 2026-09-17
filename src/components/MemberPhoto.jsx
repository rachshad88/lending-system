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
