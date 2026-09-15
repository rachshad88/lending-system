import { useEffect, useState } from 'react';
import { ErrorNote, Icon, PageLoader, SectionCard, Spinner } from '../components/ui';
import SignInSecurity from '../components/SignInSecurity';
import { useAuth } from '../context/AuthContext';
import { useAsync } from '../lib/useAsync';
import { getSettings, updateSettings } from '../lib/api';
import { formatDateTime } from '../lib/format';
import { useCapsLock } from '../lib/useCapsLock';

const FIELDS = [
  {
    name: 'interest_rate',
    label: 'Interest rate',
    suffix: '% flat on principal',
    min: 0,
    max: 100,
    step: 0.5,
    hint: 'Applied once to the principal when a loan is created. Existing loans keep the rate they were created with.',
  },
  {
    name: 'penalty_rate',
    label: 'Late penalty',
    suffix: '% of the remaining balance',
    min: 0,
    max: 100,
    step: 0.5,
    hint: 'Charged once when a loan passes its due date with a balance still open. Never charged twice on the same loan.',
  },
  {
    name: 'default_term_days',
    label: 'Default term',
    suffix: 'days',
    min: 1,
    max: 365,
    step: 1,
    hint: 'Pre-filled when releasing a loan. You can still change the term per loan.',
  },
  {
    name: 'writeoff_threshold_days',
    label: 'Flag for write-off after',
    suffix: 'days past the due date',
    min: 1,
    max: 3650,
    step: 1,
    hint: 'How long a loan can sit unpaid past its due date before it shows up in Risk review.',
  },
  {
    name: 'gone_quiet_days',
    label: 'Treat as gone quiet after',
    suffix: 'days with no collection',
    min: 1,
    max: 365,
    step: 1,
    hint: 'Drives the dashboard watchlist and the Slipping tab in Risk review. Lower catches problems sooner but lists more people.',
  },
  {
    name: 'max_exposure_per_member',
    label: 'Most one member may owe',
    suffix: '₱ across all their loans',
    min: 0,
    max: 10000000,
    step: 500,
    optional: true,
    hint: 'Caps the ceiling suggested on a member’s track record. Leave blank for no limit.',
  },
];

/** Toggleable password field, matching the one on the login form. */
function PasswordField({ id, label, value, onChange, autoComplete }) {
  const [show, setShow] = useState(false);
  const { capsLockOn, trackCapsLock } = useCapsLock();
  return (
    <div>
      <label className="label" htmlFor={id}>
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          className="input pr-11"
          type={show ? 'text' : 'password'}
          autoComplete={autoComplete}
          required
          value={value}
          onChange={onChange}
          onKeyUp={trackCapsLock}
          onKeyDown={trackCapsLock}
        />
        <button
          type="button"
          onClick={() => setShow((current) => !current)}
          className="absolute inset-y-0 right-0 grid w-11 place-items-center text-faint transition-colors hover:text-muted"
          aria-label={show ? 'Hide password' : 'Show password'}
        >
          <Icon name={show ? 'eyeOff' : 'eye'} size={18} />
        </button>
      </div>
      {capsLockOn && (
        <p className="mt-1.5 flex items-center gap-1.5 text-xs font-semibold text-amber">
          <Icon name="risk" size={13} />
          Caps Lock is on
        </p>
      )}
    </div>
  );
}

function ChangePasswordForm() {
  const { changePassword } = useAuth();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [done, setDone] = useState(false);

  const submit = async (event) => {
    event.preventDefault();
    setError(null);
    setDone(false);

    if (next.length < 8) {
      setError('New password must be at least 8 characters.');
      return;
    }
    if (next !== confirm) {
      setError('New password and confirmation do not match.');
      return;
    }

    setBusy(true);
    try {
      await changePassword(current, next);
      setCurrent('');
      setNext('');
      setConfirm('');
      setDone(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} noValidate className="mt-4 space-y-3 border-t border-line pt-4">
      <p className="font-bold">Change password</p>
      <PasswordField
        id="pw-current"
        label="Current password"
        value={current}
        onChange={(event) => setCurrent(event.target.value)}
        autoComplete="current-password"
      />
      <div className="grid gap-3 sm:grid-cols-2">
        <PasswordField
          id="pw-new"
          label="New password"
          value={next}
          onChange={(event) => setNext(event.target.value)}
          autoComplete="new-password"
        />
        <PasswordField
          id="pw-confirm"
          label="Confirm new password"
          value={confirm}
          onChange={(event) => setConfirm(event.target.value)}
          autoComplete="new-password"
        />
      </div>

      {error && (
        <p role="alert" className="rounded-xl bg-red-soft px-4 py-3 text-sm">
          {error}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" className="btn btn-outline" disabled={busy}>
          {busy ? <Spinner size={18} label="Saving" /> : 'Update password'}
        </button>
        {done && (
          <span className="flex items-center gap-1.5 text-sm font-semibold text-green">
            <Icon name="check" size={16} strokeWidth={2.6} />
            Password updated
          </span>
        )}
      </div>
    </form>
  );
}

export default function Settings() {
  const { user, signOut } = useAuth();
  const { data, error, loading, reload } = useAsync(getSettings, []);
  const [values, setValues] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (data) setValues(data);
  }, [data]);

  if (loading || !values) return <PageLoader />;
  if (error) return <ErrorNote error={error} onRetry={reload} />;

  const setField = (name) => (event) => {
    setValues((prev) => ({ ...prev, [name]: event.target.value }));
    setSaved(false);
  };

  const save = async (event) => {
    event.preventDefault();
    setSaving(true);
    setSaveError(null);
    try {
      const patch = {
        business_name: values.business_name,
        interest_rate: Number(values.interest_rate),
        penalty_rate: Number(values.penalty_rate),
        default_term_days: Number(values.default_term_days),
        writeoff_threshold_days: Number(values.writeoff_threshold_days),
      };

      // the risk-signal columns only exist once 0004 has been run; writing them
      // before that would break saving the settings that do exist
      if ('gone_quiet_days' in values) {
        patch.gone_quiet_days = Number(values.gone_quiet_days) || 3;
      }
      if ('max_exposure_per_member' in values) {
        // blank means no ceiling at all, which is not the same as zero
        patch.max_exposure_per_member =
          String(values.max_exposure_per_member ?? '').trim() === ''
            ? null
            : Number(values.max_exposure_per_member);
      }
      const updated = await updateSettings(patch);
      setValues(updated);
      setSaved(true);
    } catch (err) {
      setSaveError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-extrabold tracking-tight sm:text-[1.75rem]">Settings</h1>
        <p className="text-muted">Business rules used when new loans are created.</p>
      </header>

      <form onSubmit={save} className="space-y-5">
        <SectionCard title="Business rules" bodyClass="divide-y divide-[#eef0f6]">
          {FIELDS.filter((field) => field.name in values).map((field) => (
            <div
              key={field.name}
              className="flex flex-col gap-2 px-4 py-4 sm:flex-row sm:items-start sm:justify-between sm:px-5"
            >
              <div className="sm:max-w-md">
                <p className="font-bold">{field.label}</p>
                <p className="text-sm text-muted">{field.hint}</p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <input
                  className="input tnum w-24 text-right"
                  type="number"
                  min={field.min}
                  max={field.max}
                  step={field.step}
                  value={values[field.name] ?? ''}
                  onChange={setField(field.name)}
                  aria-label={field.label}
                  placeholder={field.optional ? 'none' : undefined}
                  required={!field.optional}
                />
                <span className="text-sm text-muted">{field.suffix}</span>
              </div>
            </div>
          ))}

          <div className="flex flex-col gap-2 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
            <div>
              <p className="font-bold">Business name</p>
              <p className="text-sm text-muted">Shown on exported reports.</p>
            </div>
            <input
              className="input sm:w-72"
              value={values.business_name ?? ''}
              onChange={setField('business_name')}
              aria-label="Business name"
            />
          </div>
        </SectionCard>

        {saveError && <ErrorNote error={saveError} />}

        <div className="flex flex-wrap items-center gap-3">
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? <Spinner size={18} label="Saving" /> : 'Save changes'}
          </button>
          {saved && (
            <span className="flex items-center gap-1.5 text-sm font-semibold text-green">
              <Icon name="check" size={16} strokeWidth={2.6} />
              Saved
            </span>
          )}
          <p className="text-sm text-muted">
            Last updated {formatDateTime(values.updated_at)}
          </p>
        </div>
      </form>

      <SectionCard title="This account" bodyClass="p-4 sm:p-5">
        <dl className="space-y-2 text-sm">
          <div className="flex justify-between gap-4">
            <dt className="text-muted">Signed in as</dt>
            <dd className="font-semibold">{user?.email}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-muted">Idle timeout</dt>
            <dd className="font-semibold">1 hour</dd>
          </div>
        </dl>

        <ChangePasswordForm />

        <button type="button" className="btn btn-outline mt-4" onClick={signOut}>
          <Icon name="logout" size={16} />
          Sign out
        </button>
      </SectionCard>

      <SignInSecurity />
    </div>
  );
}
