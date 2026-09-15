import { useState } from 'react';
import { NavLink, Outlet, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Icon } from './ui';
import GlobalSearch from './GlobalSearch';
import SignOutSummary from './SignOutSummary';

const NAV = [
  { to: '/app', label: 'Dashboard', icon: 'dashboard', end: true },
  { to: '/app/collect', label: 'Collect', icon: 'mapPin' },
  { to: '/app/members', label: 'Members', icon: 'members' },
  { to: '/app/loans', label: 'Loans', icon: 'loans' },
  { to: '/app/risk', label: 'Risk', icon: 'risk' },
  { to: '/app/cash', label: 'Cash', icon: 'wallet' },
  { to: '/app/reports', label: 'Reports', icon: 'reports' },
];

function Logo({ compact = false }) {
  return (
    <span className="flex items-center gap-2.5">
      <img src="/drl-logo.svg" alt="DRL Lending Cooperative" className="h-9 w-9 rounded-[10px]" />
      {!compact && (
        <span className="leading-tight">
          <span className="block text-sm font-extrabold tracking-tight">DRL Lending</span>
          <span className="block text-[11px] font-semibold text-faint">COOPERATIVE</span>
        </span>
      )}
    </span>
  );
}

export default function AppShell() {
  const { user, signOut } = useAuth();
  const [loggingOut, setLoggingOut] = useState(false);
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);

  return (
    <div className="min-h-screen lg:flex">
      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-screen w-[248px] shrink-0 flex-col border-r border-line bg-surface px-3 py-4 lg:flex">
        <Link to="/app" className="mb-4 px-2">
          <Logo />
        </Link>

        <GlobalSearch className="mb-4" />

        <nav className="flex flex-1 flex-col gap-1" aria-label="Main">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-[10px] px-3 py-2.5 text-sm font-semibold transition-colors ${
                  isActive
                    ? 'bg-brand-soft text-brand'
                    : 'text-muted hover:bg-[#f2f4f9] hover:text-ink'
                }`
              }
            >
              <Icon name={item.icon} size={19} />
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="mt-2 space-y-1 border-t border-line pt-3">
          <NavLink
            to="/app/settings"
            className={({ isActive }) =>
              `flex items-center gap-3 rounded-[10px] px-3 py-2.5 text-sm font-semibold transition-colors ${
                isActive ? 'bg-brand-soft text-brand' : 'text-muted hover:bg-[#f2f4f9] hover:text-ink'
              }`
            }
          >
            <Icon name="settings" size={19} />
            Settings
          </NavLink>
          <p className="truncate px-3 pt-1 text-xs text-faint" title={user?.email}>
            {user?.email}
          </p>
          <button
            type="button"
            onClick={() => setLoggingOut(true)}
            className="flex w-full items-center gap-3 rounded-[10px] px-3 py-2.5 text-sm font-semibold text-muted transition-colors hover:bg-[#f2f4f9] hover:text-ink"
          >
            <Icon name="logout" size={19} />
            Sign out
          </button>
        </div>
      </aside>

      {/* Mobile top bar */}
      <header className="sticky top-0 z-30 border-b border-line bg-surface/95 backdrop-blur lg:hidden">
        <div className="flex items-center justify-between px-4 py-2.5">
          <Link to="/app">
            <Logo />
          </Link>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setMobileSearchOpen((v) => !v)}
              className="btn btn-ghost btn-sm"
              aria-label="Search members"
              aria-pressed={mobileSearchOpen}
            >
              <Icon name={mobileSearchOpen ? 'x' : 'search'} size={19} />
            </button>
            <NavLink to="/app/settings" className="btn btn-ghost btn-sm" aria-label="Settings">
              <Icon name="settings" size={19} />
            </NavLink>
            <button
              type="button"
              onClick={() => setLoggingOut(true)}
              className="btn btn-ghost btn-sm"
              aria-label="Sign out"
            >
              <Icon name="logout" size={19} />
            </button>
          </div>
        </div>
        {mobileSearchOpen && (
          <div className="border-t border-line px-4 py-2.5">
            <GlobalSearch onNavigate={() => setMobileSearchOpen(false)} />
          </div>
        )}
      </header>

      <main className="min-w-0 flex-1 pb-24 lg:pb-8">
        <div className="mx-auto w-full max-w-[1280px] px-4 py-5 sm:px-6 sm:py-7">
          <Outlet />
        </div>
      </main>

      {/* Mobile bottom navigation */}
      <nav
        className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-7 border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden"
        aria-label="Main"
      >
        {NAV.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) =>
              `flex min-h-[58px] flex-col items-center justify-center gap-1 text-[11px] font-semibold transition-colors ${
                isActive ? 'text-brand' : 'text-faint'
              }`
            }
          >
            {({ isActive }) => (
              <>
                <span
                  className={`grid h-7 w-12 place-items-center rounded-full transition-colors ${
                    isActive ? 'bg-brand-soft' : ''
                  }`}
                >
                  <Icon name={item.icon} size={19} />
                </span>
                {item.label}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      <SignOutSummary
        open={loggingOut}
        onCancel={() => setLoggingOut(false)}
        onSignOut={signOut}
      />
    </div>
  );
}
