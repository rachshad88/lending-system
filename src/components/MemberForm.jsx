import { useState } from 'react';
import Modal from './Modal';
import { Spinner } from './ui';

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

  const setField = (name) => (event) =>
    setValues((prev) => ({ ...prev, [name]: event.target.value }));

  const submit = async (event) => {
    event.preventDefault();
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
      await onSubmit(payload);
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
      subtitle="Only the name is required — the rest helps you find and follow up on them later."
      size="lg"
      footer={
        <>
          <button type="button" className="btn btn-outline" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button type="submit" form="member-form" className="btn btn-primary" disabled={busy}>
            {busy ? <Spinner size={18} label="Saving" /> : 'Save member'}
          </button>
        </>
      }
    >
      <form id="member-form" onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
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

        {error && (
          <p role="alert" className="rounded-xl bg-red-soft px-4 py-3 text-sm sm:col-span-2">
            {error}
          </p>
        )}
      </form>
    </Modal>
  );
}

function stripNulls(source) {
  if (!source) return {};
  return Object.fromEntries(Object.entries(source).map(([key, value]) => [key, value ?? '']));
}
