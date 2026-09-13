import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { supabase, isConfigured } from '../lib/supabase';

const AuthContext = createContext(null);

const IDLE_LIMIT_MS = 60 * 60 * 1000; // one hour of inactivity
const IDLE_CHECK_MS = 30 * 1000;
const IDLE_KEY = 'drl.lastActivity';
const ACTIVITY_EVENTS = ['pointerdown', 'keydown', 'wheel', 'touchstart', 'focus'];

// Passwords are checked by the admin-auth Edge Function, which counts failures
// and locks the account server-side. Errors carry its code so screens can say
// how many tries are left or how long the pause lasts.
async function callAdminAuth(body) {
  const { data, error } = await supabase.functions.invoke('admin-auth', { body });
  if (!error) return data;

  let payload = null;
  try {
    payload = await error.context?.json();
  } catch {
    // network failures have no JSON body
  }
  const err = new Error(payload?.message ?? 'Sign-in is unavailable right now. Please try again.');
  err.code = payload?.code ?? 'network_error';
  err.attemptsLeft = payload?.attempts_left;
  err.nextLockSeconds = payload?.next_lock_seconds;
  err.retryAfterSeconds = payload?.retry_after_seconds;
  throw err;
}

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [adminChecked, setAdminChecked] = useState(false);
  const [loading, setLoading] = useState(isConfigured);
  const [idleSignOut, setIdleSignOut] = useState(false);
  const lastActivity = useRef(Date.now());

  const markActivity = useCallback(() => {
    lastActivity.current = Date.now();
    try {
      localStorage.setItem(IDLE_KEY, String(lastActivity.current));
    } catch {
      // private browsing can refuse writes; the in-memory timer still works
    }
  }, []);

  useEffect(() => {
    if (!isConfigured) return;

    let active = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setSession(data.session ?? null);
      setLoading(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession ?? null);
      if (nextSession) {
        markActivity();
      } else {
        setIsAdmin(false);
        setAdminChecked(false);
      }
    });

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, [markActivity]);

  // Confirm the signed-in user is actually on the admin list. Row level
  // security would block them anyway, but an explicit answer beats empty pages.
  useEffect(() => {
    if (!session) return;
    let active = true;
    supabase.rpc('is_admin').then(({ data, error }) => {
      if (!active) return;
      setIsAdmin(!error && data === true);
      setAdminChecked(true);
    });
    return () => {
      active = false;
    };
  }, [session]);

  // Idle timeout. The timestamp lives in localStorage too, so closing the tab
  // for two hours and coming back still counts as idle.
  useEffect(() => {
    if (!session) return;

    try {
      const stored = Number(localStorage.getItem(IDLE_KEY));
      if (stored && Number.isFinite(stored)) {
        lastActivity.current = stored;
      } else {
        markActivity();
      }
    } catch {
      markActivity();
    }

    if (Date.now() - lastActivity.current > IDLE_LIMIT_MS) {
      setIdleSignOut(true);
      supabase.auth.signOut();
      return;
    }

    ACTIVITY_EVENTS.forEach((evt) => window.addEventListener(evt, markActivity, { passive: true }));

    const timer = setInterval(() => {
      if (Date.now() - lastActivity.current > IDLE_LIMIT_MS) {
        setIdleSignOut(true);
        supabase.auth.signOut();
      }
    }, IDLE_CHECK_MS);

    return () => {
      clearInterval(timer);
      ACTIVITY_EVENTS.forEach((evt) => window.removeEventListener(evt, markActivity));
    };
  }, [session, markActivity]);

  const signIn = useCallback(
    async (email, password) => {
      setIdleSignOut(false);
      const tokens = await callAdminAuth({ action: 'login', email, password });
      // a stale timestamp from an earlier session would sign the new one out
      // the moment the idle check runs
      markActivity();
      const { error } = await supabase.auth.setSession(tokens);
      if (error) throw error;
    },
    [markActivity]
  );

  const changePassword = useCallback(
    async (currentPassword, newPassword) => {
      if (!session) throw new Error('Not signed in.');
      try {
        await callAdminAuth({
          action: 'change_password',
          current_password: currentPassword,
          new_password: newPassword,
        });
      } catch (err) {
        if (err.code === 'invalid_credentials') {
          const left = err.attemptsLeft;
          throw new Error(
            `Current password is incorrect.${
              left ? ` ${left} ${left === 1 ? 'try' : 'tries'} left before sign-in is paused.` : ''
            }`
          );
        }
        if (err.code === 'locked') {
          const minutes = Math.ceil((err.retryAfterSeconds ?? 900) / 60);
          throw new Error(
            `Too many wrong passwords. Sign-in is paused for ${minutes} ${
              minutes === 1 ? 'minute' : 'minutes'
            }.`
          );
        }
        throw err;
      }
    },
    [session]
  );

  const signOut = useCallback(async () => {
    setIdleSignOut(false);
    try {
      localStorage.removeItem(IDLE_KEY);
    } catch {
      // nothing to clean up
    }
    await supabase.auth.signOut();
  }, []);

  return (
    <AuthContext.Provider
      value={{
        session,
        user: session?.user ?? null,
        isAdmin,
        adminChecked,
        loading,
        idleSignOut,
        signIn,
        signOut,
        changePassword,
        isConfigured,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
