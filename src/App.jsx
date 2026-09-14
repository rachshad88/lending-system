import { lazy, Suspense } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { PageLoader } from './components/ui';

// Each route is its own chunk, so opening the landing page does not download
// the dashboard, the charts, the export libraries or the Supabase client.
const Landing = lazy(() => import('./pages/Landing'));
const AuthLayout = lazy(() => import('./components/AuthLayout'));
const AppShell = lazy(() => import('./components/AppShell'));
const ProtectedRoute = lazy(() => import('./components/ProtectedRoute'));
const Login = lazy(() => import('./pages/Login'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const Members = lazy(() => import('./pages/Members'));
const MemberDetail = lazy(() => import('./pages/MemberDetail'));
const Loans = lazy(() => import('./pages/Loans'));
const LoanDetail = lazy(() => import('./pages/LoanDetail'));
const WriteOffs = lazy(() => import('./pages/WriteOffs'));
const CashReconciliation = lazy(() => import('./pages/CashReconciliation'));
const Reports = lazy(() => import('./pages/Reports'));
const Settings = lazy(() => import('./pages/Settings'));

export default function App() {
  return (
    <BrowserRouter>
      <Suspense fallback={<PageLoader />}>
        <Routes>
          <Route path="/" element={<Landing />} />

          <Route element={<AuthLayout />}>
            <Route path="/login" element={<Login />} />
            <Route
              path="/app"
              element={
                <ProtectedRoute>
                  <AppShell />
                </ProtectedRoute>
              }
            >
              <Route index element={<Dashboard />} />
              <Route path="members" element={<Members />} />
              <Route path="members/:id" element={<MemberDetail />} />
              <Route path="loans" element={<Loans />} />
              <Route path="loans/:id" element={<LoanDetail />} />
              <Route path="risk" element={<WriteOffs />} />
              <Route path="cash" element={<CashReconciliation />} />
              <Route path="reports" element={<Reports />} />
              <Route path="settings" element={<Settings />} />
            </Route>
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}
