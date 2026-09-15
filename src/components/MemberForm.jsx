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
