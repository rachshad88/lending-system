import { useEffect, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import Modal from './Modal';
import { Icon } from './ui';

const tabClass = (active) =>
  `flex min-h-[58px] flex-col items-center justify-center gap-1 text-xs font-semibold transition-colors ${
    active ? 'text-brand' : 'text-faint'
  }`;

function TabFace({ icon, label, active }) {
  return (
    <>
      <span
        className={`grid h-7 w-12 place-items-center rounded-full transition-colors ${
          active ? 'bg-brand-soft' : ''
        }`}
      >
        <Icon name={icon} size={19} />
      </span>
      {label}
    </>
  );
}

/**
 * Phone navigation: four sections that get used daily plus a More tab holding
 * the rest. The More tab lights up while one of its pages is open, so the
 * current location is always visible on the bar.
 */
export default function MobileTabBar({ items }) {
  const { pathname } = useLocation();
  const [moreOpen, setMoreOpen] = useState(false);

  const tabs = items.filter((item) => !item.more);
  const overflow = items.filter((item) => item.more);
  const moreActive = overflow.some((item) => pathname.startsWith(item.to));

  // Any navigation, including the browser's back button, closes the sheet.
  useEffect(() => {
    setMoreOpen(false);
  }, [pathname]);

  return (
    <>
      <nav
        className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden"
        aria-label="Main"
      >
        {tabs.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) => tabClass(isActive)}
          >
            {({ isActive }) => <TabFace icon={item.icon} label={item.label} active={isActive} />}
          </NavLink>
        ))}
        <button
          type="button"
          onClick={() => setMoreOpen(true)}
          aria-haspopup="dialog"
          aria-expanded={moreOpen}
          aria-current={moreActive ? 'page' : undefined}
          className={tabClass(moreActive)}
        >
          <TabFace icon="menu" label="More" active={moreActive} />
        </button>
      </nav>

      <Modal open={moreOpen} onClose={() => setMoreOpen(false)} title="More" size="sm">
        <ul className="-mx-2 space-y-1">
          {overflow.map((item) => (
            <li key={item.to}>
              <NavLink
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  `flex min-h-[48px] items-center gap-3 rounded-[10px] px-3 text-base font-semibold transition-colors ${
                    isActive ? 'bg-brand-soft text-brand' : 'text-ink hover:bg-canvas'
                  }`
                }
              >
                <Icon name={item.icon} size={20} />
                {item.label}
                <Icon name="chevronRight" size={18} className="ml-auto text-faint" />
              </NavLink>
            </li>
          ))}
        </ul>
      </Modal>
    </>
  );
}
