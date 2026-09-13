import { ErrorNote, Icon, SectionCard, Spinner } from './ui';
import { useAsync } from '../lib/useAsync';
import { getLoginActivity, getLoginThrottle } from '../lib/api';
import { formatDateTime } from '../lib/format';

const OUTCOME = {
  ok: { label: 'Signed in', tone: 'pill-green' },
  bad_password: { label: 'Wrong password', tone: 'pill-red' },
  locked: { label: 'Refused, paused', tone: 'pill-amber' },
};

const DAY_MS = 24 * 60 * 60 * 1000;

async function loadSignInSecurity() {
  const [attempts, throttle] = await Promise.all([getLoginActivity(20), getLoginThrottle()]);
  return { attempts: attempts ?? [], throttle: throttle ?? [] };
}

function StatusLine({ attempts, throttle }) {
  const current = Date.now();
  const paused = throttle.filter((row) => row.locked_until && Date.parse(row.locked_until) > current);
  const recentFailures = attempts.filter(
    (row) => row.outcome !== 'ok' && current - Date.parse(row.attempted_at) < DAY_MS
  ).length;

  if (paused.length > 0) {
    return (
      <div className="flex items-start gap-2.5 rounded-xl border border-amber/40 bg-amber-soft px-4 py-3 text-sm">
        <Icon name="clock" size={17} className="mt-0.5 shrink-0 text-amber" />
        <div className="min-w-0 space-y-0.5">
          {paused.map((row) => (
            <p key={row.email} className="break-words">
              Sign-in for <span className="font-semibold">{row.email}</span> is paused until{' '}
              <span className="font-semibold">{formatDateTime(row.locked_until)}</span>.
            </p>
          ))}
        </div>
      </div>
    );
  }

  if (recentFailures > 0) {
    return (
      <div className="flex items-start gap-2.5 rounded-xl bg-red-soft px-4 py-3 text-sm">
        <Icon name="shield" size={17} className="mt-0.5 shrink-0" />
        <span>
          {recentFailures} failed {recentFailures === 1 ? 'attempt' : 'attempts'} in the last 24
          hours.
        </span>
      </div>
    );
  }

  return (
    <div className="flex items-start gap-2.5 rounded-xl bg-canvas px-4 py-3 text-sm">
      <Icon name="shield" size={17} className="mt-0.5 shrink-0 text-green" />
      <span>No failed sign-in attempts in the last 24 hours.</span>
    </div>
  );
}

export default function SignInSecurity() {
  const { data, error, loading, reload } = useAsync(loadSignInSecurity, []);

  return (
    <SectionCard title="Sign-in security" bodyClass="p-4 sm:p-5">
      <p className="text-sm text-muted">
        Five wrong passwords in a row pause sign-in for 15 minutes, then 1 hour, then 24 hours. The
        pause is enforced by the server, so it also stops anyone scripting guesses.
      </p>

      {loading ? (
        <div className="grid place-items-center py-8">
          <Spinner size={22} label="Loading sign-in activity" />
        </div>
      ) : error ? (
        <div className="mt-4">
          <ErrorNote error={error} onRetry={reload} />
        </div>
      ) : (
        <>
          <div className="mt-4">
            <StatusLine attempts={data.attempts} throttle={data.throttle} />
          </div>

          <div className="mt-4 flex items-center justify-between gap-3">
            <p className="flex items-center gap-2 font-bold">
              <Icon name="history" size={17} />
              Recent attempts
            </p>
            <button type="button" className="btn btn-outline" onClick={reload}>
              Refresh
            </button>
          </div>

          {data.attempts.length === 0 ? (
            <p className="mt-3 text-sm text-muted">No sign-in attempts recorded yet.</p>
          ) : (
            <ul className="mt-3 divide-y divide-[#eef0f6] rounded-xl border border-line">
              {data.attempts.map((row) => {
                const outcome = OUTCOME[row.outcome] ?? { label: row.outcome, tone: 'pill-grey' };
                return (
                  <li
                    key={row.id}
                    className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-3 text-sm"
                  >
                    <div className="min-w-0">
                      <p className="font-semibold">{formatDateTime(row.attempted_at)}</p>
                      <p className="truncate text-muted">
                        {row.email}
                        {row.ip ? ` · ${row.ip}` : ''}
                      </p>
                    </div>
                    <span className={`pill ${outcome.tone}`}>{outcome.label}</span>
                  </li>
                );
              })}
            </ul>
          )}

          <p className="mt-4 text-xs text-muted">
            Paused yourself by mistake? It reopens on its own. To reopen it now, run{' '}
            <code className="rounded bg-canvas px-1.5 py-0.5 font-semibold">
              delete from login_throttle where email = 'you@example.com';
            </code>{' '}
            in the Supabase SQL Editor.
          </p>
        </>
      )}
    </SectionCard>
  );
}
