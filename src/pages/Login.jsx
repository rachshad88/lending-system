import { useEffect, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Icon, Spinner } from '../components/ui';

function formatDuration(seconds) {
  if (seconds >= 3600 && seconds % 3600 === 0) {
    const hours = seconds / 3600;
    return `${hours} ${hours === 1 ? 'hour' : 'hours'}`;
  }
  const minutes = Math.max(1, Math.round(seconds / 60));
  return `${minutes} ${minutes === 1 ? 'minute' : 'minutes'}`;
}

function formatCountdown(ms) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const pad = (n) => String(n).padStart(2, '0');
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${minutes}:${pad(seconds)}`;
}

function SetupNotice() {
  return (
    <div className="card max-w-xl p-6">
      <span className="mb-4 grid h-11 w-11 place-items-center rounded-xl bg-amber-soft text-amber">
        <Icon name="settings" size={21} />
      </span>
      <h1 className="text-xl font-bold">Connect your database first</h1>
      <p className="mt-2 text-muted">
        The app cannot sign anyone in until it knows where the records live. Three steps, once:
      </p>
      <ol className="mt-4 space-y-3 text-sm">
        <li className="flex gap-3">
          <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-brand-soft text-xs font-bold text-brand">
            1
          </span>
          <span>
            Create a free project at <span className="font-semibold">supabase.com</span>, then open
            the SQL Editor and run{' '}
            <code className="rounded bg-canvas px-1.5 py-0.5 font-semibold">
              supabase/migrations/0001_init.sql
            </code>
            .
          </span>
        </li>
        <li className="flex gap-3">
          <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-brand-soft text-xs font-bold text-brand">
            2
          </span>
          <span>
            Copy <code className="rounded bg-canvas px-1.5 py-0.5 font-semibold">.env.example</code>{' '}
            to <code className="rounded bg-canvas px-1.5 py-0.5 font-semibold">.env.local</code> and
            paste in your project URL and anon key.
          </span>
        </li>
        <li className="flex gap-3">
          <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-brand-soft text-xs font-bold text-brand">
            3
          </span>
          <span>
            Create your admin user under Authentication → Users, then add that user id to the{' '}
            <code className="rounded bg-canvas px-1.5 py-0.5 font-semibold">admin_users</code>{' '}
            table.
          </span>
        </li>
      </ol>
      <p className="mt-5 text-sm text-muted">
        Restart <code className="rounded bg-canvas px-1.5 py-0.5 font-semibold">npm run dev</code>{' '}
        after editing the env file.
      </p>
      <Link to="/" className="btn btn-outline mt-5">
        <Icon name="arrowLeft" size={16} />
        Back to the site
      </Link>
    </div>
  );
}

export default function Login() {
  const { session, signIn, isConfigured, idleSignOut } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [lockedUntil, setLockedUntil] = useState(null);
  const [now, setNow] = useState(() => Date.now());
  const [capsLockOn, setCapsLockOn] = useState(false);
  const [errorShake, setErrorShake] = useState(0);

  useEffect(() => {
    if (!lockedUntil) return;
    const timer = setInterval(() => {
      const current = Date.now();
      setNow(current);
      if (current >= lockedUntil) setLockedUntil(null);
    }, 1000);
    return () => clearInterval(timer);
  }, [lockedUntil]);

  if (session) return <Navigate to="/app" replace />;

  // The countdown only keeps the button honest; the server refuses every
  // attempt during a lock no matter what this page does.
  const locked = lockedUntil !== null && now < lockedUntil;

  // A fresh key re-mounts the banner so the shake replays on every new error,
  // not just the first one.
  const fail = (message) => {
    setError(message);
    setErrorShake((n) => n + 1);
  };

  const onSubmit = async (event) => {
    event.preventDefault();
    if (locked) return;
    setError(null);
    if (!email.trim() || !password) {
      fail('Please enter your email and password.');
      return;
    }
    setBusy(true);
    try {
      await signIn(email.trim(), password);
    } catch (err) {
      if (err.code === 'locked') {
        const start = Date.now();
        setNow(start);
        setLockedUntil(start + (err.retryAfterSeconds ?? 900) * 1000);
        setPassword('');
      } else if (err.code === 'invalid_credentials') {
        const left = err.attemptsLeft;
        fail(
          `That email and password combination does not match an account.${
            left
              ? ` ${left} ${left === 1 ? 'attempt' : 'attempts'} left before sign-in is paused for ${formatDuration(
                  err.nextLockSeconds ?? 900
                )}.`
              : ''
          }`
        );
      } else if (err.code === 'bad_request') {
        fail('Please enter your email and password.');
      } else {
        fail(err.message);
      }
    } finally {
      setBusy(false);
    }
  };

  const trackCapsLock = (event) => {
    if (typeof event.getModifierState === 'function') {
      setCapsLockOn(event.getModifierState('CapsLock'));
    }
  };

  if (!isConfigured) {
    return (
      <div className="grid min-h-screen place-items-center bg-canvas px-4 py-10">
        <SetupNotice />
      </div>
    );
  }

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-2">
      {/* Brand panel */}
      <div
        className="relative hidden flex-col justify-between overflow-hidden p-10 lg:flex"
        style={{
          background:
            'radial-gradient(700px 400px at 20% 10%, #0073ea 0%, transparent 60%), #1f2b3e',
        }}
      >
        <div className="pointer-events-none absolute inset-0">
          <span
            className="blob"
            style={{
              top: '-10%',
              right: '-8%',
              width: 320,
              height: 320,
              background: 'rgb(0 151 173 / 0.35)',
            }}
          />
          <span
            className="blob"
            style={{
              bottom: '-14%',
              left: '-6%',
              width: 280,
              height: 280,
              background: 'rgb(0 115 234 / 0.3)',
              animationDelay: '-4s',
            }}
          />
        </div>

        <Link to="/" className="hero-in relative flex items-center gap-3 text-white">
          <img src="/drl-logo.svg" alt="DRL Lending Cooperative" className="breathe h-11 w-11" />
          <span className="leading-tight">
            <span className="block font-extrabold">DRL Lending</span>
            <span className="block text-[10px] font-bold tracking-[0.18em] text-white/50">
              COOPERATIVE
            </span>
          </span>
        </Link>

        <div className="relative max-w-md">
          <h2
            className="hero-in text-4xl font-extrabold leading-tight tracking-[-0.03em] text-white"
            style={{ animationDelay: '90ms' }}
          >
            Your whole book, in one place.
          </h2>
          <p className="hero-in mt-4 text-lg text-white/70" style={{ animationDelay: '170ms' }}>
            Principal out on the street, income earned, who paid today and who did not. Updated the
            moment you record a collection.
          </p>
        </div>

        <p className="hero-in relative flex items-center gap-2 text-sm text-white/50" style={{ animationDelay: '250ms' }}>
          <Icon name="shield" size={16} />
          Records are visible only to signed-in admins.
        </p>
      </div>

      {/* Form */}
      <div className="grid min-h-screen items-start justify-items-center bg-canvas px-4 pb-10 pt-16 lg:min-h-0 lg:items-center lg:pt-10">
        <div className="w-full max-w-sm">
          <Link to="/" className="hero-in mb-8 inline-flex items-center gap-2.5 lg:hidden">
            <img src="/drl-logo.svg" alt="DRL Lending Cooperative" className="breathe h-11 w-11" />
            <span className="leading-tight">
              <span className="block font-extrabold">DRL Lending</span>
              <span className="block text-[10px] font-bold tracking-[0.18em] text-faint">
                COOPERATIVE
              </span>
            </span>
          </Link>

          <h1 className="hero-in text-2xl font-extrabold tracking-tight" style={{ animationDelay: '40ms' }}>
            Sign in
          </h1>
          <p className="hero-in mt-1.5 text-muted" style={{ animationDelay: '80ms' }}>
            Admin access only.
          </p>

          {idleSignOut && (
            <div className="slide-down mt-5 flex items-start gap-2.5 rounded-xl border border-amber/40 bg-amber-soft px-4 py-3 text-sm">
              <Icon name="clock" size={17} className="mt-0.5 shrink-0 text-amber" />
              <span>You were signed out after an hour of inactivity.</span>
            </div>
          )}

          {locked && (
            <div
              role="alert"
              className="slide-down mt-5 flex items-start gap-2.5 rounded-xl border border-amber/40 bg-amber-soft px-4 py-3 text-sm"
            >
              <Icon name="clock" size={17} className="mt-0.5 shrink-0 text-amber" />
              <span>
                Too many failed attempts, so sign-in is paused for this account. Try again in{' '}
                <span className="tnum font-semibold">{formatCountdown(lockedUntil - now)}</span>.
              </span>
            </div>
          )}

          <form onSubmit={onSubmit} noValidate className="mt-6 space-y-4">
            <div className="hero-in" style={{ animationDelay: '120ms' }}>
              <label className="label" htmlFor="email">
                Email
              </label>
              <input
                id="email"
                className="input"
                type="email"
                autoComplete="username"
                autoFocus
                required
                value={email}
                onChange={(event) => {
                  setEmail(event.target.value);
                  setLockedUntil(null);
                }}
                placeholder="you@example.com"
              />
            </div>

            <div className="hero-in" style={{ animationDelay: '160ms' }}>
              <label className="label" htmlFor="password">
                Password
              </label>
              <div className="relative">
                <input
                  id="password"
                  className="input pr-11"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  onKeyUp={trackCapsLock}
                  onKeyDown={trackCapsLock}
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((current) => !current)}
                  className="absolute inset-y-0 right-0 grid w-11 place-items-center text-faint transition-colors hover:scale-110 hover:text-muted active:scale-95"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  <span key={showPassword ? 'on' : 'off'} className="pop">
                    <Icon name={showPassword ? 'eyeOff' : 'eye'} size={18} />
                  </span>
                </button>
              </div>
              {capsLockOn && (
                <p className="slide-down mt-1.5 flex items-center gap-1.5 text-xs font-semibold text-amber">
                  <Icon name="risk" size={13} />
                  Caps Lock is on
                </p>
              )}
            </div>

            {error && (
              <p key={errorShake} role="alert" className="shake rounded-xl bg-red-soft px-4 py-3 text-sm text-ink">
                {error}
              </p>
            )}

            <button
              type="submit"
              className="btn btn-primary btn-shine w-full"
              disabled={busy || locked}
            >
              {busy ? <Spinner size={18} label="Signing in" /> : 'Sign in'}
            </button>
          </form>

          <Link
            to="/"
            className="hero-in group mt-6 inline-flex items-center gap-2 text-sm font-semibold text-muted transition-colors hover:text-ink"
            style={{ animationDelay: '220ms' }}
          >
            <Icon name="arrowLeft" size={16} className="transition-transform group-hover:-translate-x-1" />
            Back to the site
          </Link>
        </div>
      </div>
    </div>
  );
}
