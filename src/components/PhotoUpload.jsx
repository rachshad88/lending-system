import { useRef, useState } from 'react';
import { Icon } from './ui';
import { resizeImageToBlob } from '../lib/imageResize';

/**
 * A plain file input (no `capture` attribute, so it opens the normal OS
 * picker — gallery, files, or camera, whichever the device offers, not a
 * forced camera flow), resizing the picked image client-side before handing
 * it back. Upload mechanics live with the caller (immediate on an existing
 * member's page, deferred until a new member has an id) — this component
 * only ever produces a Blob.
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
        className="hidden"
        onChange={handleChange}
      />
      {error && <p className="mt-1.5 text-xs text-red">{error}</p>}
    </div>
  );
}
