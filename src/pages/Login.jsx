import { useState } from 'react';
import { Link, Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Icon, Spinner } from '../components/ui';

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
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  if (session) return <Navigate to={location.state?.from ?? '/app'} replace />;

  const onSubmit = async (event) => {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await signIn(email.trim(), password);
    } catch (err) {
      setError(
        err.message?.includes('Invalid login credentials')
          ? 'That email and password combination does not match an account.'
          : err.message
      );
    } finally {
      setBusy(false);
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
        className="relative hidden flex-col justify-between p-10 lg:flex"
        style={{
          background:
            'radial-gradient(700px 400px at 20% 10%, #0073ea 0%, transparent 60%), #1f2b3e',
        }}
      >
        <Link to="/" className="flex items-center gap-3 text-white">
          <span className="grid h-11 w-11 place-items-center rounded-xl bg-white text-lg font-extrabold text-brand">
            D
          </span>
          <span className="leading-tight">
            <span className="block font-extrabold">DRL Lending</span>
            <span className="block text-[10px] font-bold tracking-[0.18em] text-white/50">
              COOPERATIVE
            </span>
          </span>
        </Link>

        <div className="max-w-md">
          <h2 className="text-4xl font-extrabold leading-tight tracking-[-0.03em] text-white">
            Your whole book, in one place.
          </h2>
          <p className="mt-4 text-lg text-white/70">
            Principal out on the street, income earned, who paid today and who did not — updated the
            moment you record a collection.
          </p>
        </div>

        <p className="flex items-center gap-2 text-sm text-white/50">
          <Icon name="shield" size={16} />
          Records are visible only to signed-in admins.
        </p>
      </div>

      {/* Form */}
      <div className="grid min-h-screen place-items-center bg-canvas px-4 py-10 lg:min-h-0">
        <div className="w-full max-w-sm">
          <Link to="/" className="mb-8 inline-flex items-center gap-2.5 lg:hidden">
            <span className="grid h-11 w-11 place-items-center rounded-xl bg-brand text-lg font-extrabold text-white">
              D
            </span>
            <span className="leading-tight">
              <span className="block font-extrabold">DRL Lending</span>
              <span className="block text-[10px] font-bold tracking-[0.18em] text-faint">
                COOPERATIVE
              </span>
            </span>
          </Link>

          <h1 className="text-2xl font-extrabold tracking-tight">Sign in</h1>
          <p className="mt-1.5 text-muted">Admin access only.</p>

          {idleSignOut && (
            <div className="mt-5 flex items-start gap-2.5 rounded-xl border border-amber/40 bg-amber-soft px-4 py-3 text-sm">
              <Icon name="clock" size={17} className="mt-0.5 shrink-0 text-amber" />
              <span>You were signed out after an hour of inactivity.</span>
            </div>
          )}

          <form onSubmit={onSubmit} className="mt-6 space-y-4">
            <div>
              <label className="label" htmlFor="email">
                Email
              </label>
              <input
                id="email"
                className="input"
                type="email"
                autoComplete="username"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="you@example.com"
              />
            </div>

            <div>
              <label className="label" htmlFor="password">
                Password
              </label>
              <input
                id="password"
                className="input"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="••••••••"
              />
            </div>

            {error && (
              <p role="alert" className="rounded-xl bg-red-soft px-4 py-3 text-sm text-ink">
                {error}
              </p>
            )}

            <button type="submit" className="btn btn-primary w-full" disabled={busy}>
              {busy ? <Spinner size={18} label="Signing in" /> : 'Sign in'}
            </button>
          </form>

          <Link
            to="/"
            className="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-muted transition-colors hover:text-ink"
          >
            <Icon name="arrowLeft" size={16} />
            Back to the site
          </Link>
        </div>
      </div>
    </div>
  );
}
