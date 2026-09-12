import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Icon, PageLoader } from './ui';

export default function ProtectedRoute({ children }) {
  const { session, isAdmin, adminChecked, loading, signOut, isConfigured } = useAuth();
  const location = useLocation();

  if (!isConfigured) return <Navigate to="/login" replace />;
  if (loading) return <PageLoader />;
  if (!session) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  // Wait for the admin lookup, otherwise every sign-in flashes "no access"
  if (!adminChecked) return <PageLoader />;

  // Signed in but not on the admin list: row level security already blocks the
  // data, so say so plainly instead of rendering empty pages.
  if (!isAdmin) {
    return (
      <div className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-4 px-6 text-center">
        <span className="grid h-14 w-14 place-items-center rounded-full bg-amber-soft text-amber">
          <Icon name="shield" size={26} />
        </span>
        <h1 className="text-xl font-bold">This account has no access</h1>
        <p className="text-sm text-muted">
          You are signed in, but this user is not on the admin list, so none of the records are
          visible. Add the user id to the <code className="font-semibold">admin_users</code> table
          in Supabase to grant access.
        </p>
        <button type="button" className="btn btn-outline" onClick={signOut}>
          Sign out
        </button>
      </div>
    );
  }

  return children;
}
