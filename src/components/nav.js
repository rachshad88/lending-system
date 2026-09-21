// Shared by the desktop sidebar (every item) and the phone tab bar. `more` items
// sit behind the "More" tab on phones so the bar keeps to five labelled tabs.
export const NAV = [
  { to: '/app', label: 'Dashboard', icon: 'dashboard', end: true },
  { to: '/app/collect', label: 'Collect', icon: 'mapPin' },
  { to: '/app/members', label: 'Members', icon: 'members' },
  { to: '/app/loans', label: 'Loans', icon: 'loans' },
  { to: '/app/risk', label: 'Risk', icon: 'risk', more: true },
  { to: '/app/cash', label: 'Cash', icon: 'wallet', more: true },
  { to: '/app/reports', label: 'Reports', icon: 'reports', more: true },
];
