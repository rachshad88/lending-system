import { Outlet } from 'react-router-dom';
import { AuthProvider } from '../context/AuthContext';

/**
 * Wraps only the routes that actually need a session. Because this module is
 * lazy-loaded, the Supabase client never reaches visitors who only read the
 * public landing page.
 */
export default function AuthLayout() {
  return (
    <AuthProvider>
      <Outlet />
    </AuthProvider>
  );
}
