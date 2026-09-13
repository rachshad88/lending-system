import { createClient } from 'npm:@supabase/supabase-js@2';

type VerifyResult = {
  status: 'ok' | 'invalid' | 'locked';
  user_id?: string;
  email?: string;
  attempts_left?: number;
  next_lock_seconds?: number;
  retry_after_seconds?: number;
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';

function projectKey(namedKeysEnv: string, legacyEnv: string): string {
  const raw = Deno.env.get(namedKeysEnv);
  if (raw) {
    try {
      const keys = JSON.parse(raw);
      if (typeof keys?.default === 'string') return keys.default;
    } catch {
      // fall back to the legacy single-key variable
    }
  }
  return Deno.env.get(legacyEnv) ?? '';
}

const SECRET_KEY = projectKey('SUPABASE_SECRET_KEYS', 'SUPABASE_SERVICE_ROLE_KEY');
const PUBLISHABLE_KEY = projectKey('SUPABASE_PUBLISHABLE_KEYS', 'SUPABASE_ANON_KEY');

const ALLOWED_ORIGINS = new Set([
  'http://localhost:5173',
  ...(Deno.env.get('ALLOWED_ORIGINS') ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
]);

const clientOptions = {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
};

const admin = createClient(SUPABASE_URL, SECRET_KEY, clientOptions);

function corsHeaders(origin: string | null): Record<string, string> {
  if (!origin || !ALLOWED_ORIGINS.has(origin)) return { Vary: 'Origin' };
  return {
    Vary: 'Origin',
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-region',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Max-Age': '600',
  };
}

function json(
  body: unknown,
  status: number,
  origin: string | null,
  extra: Record<string, string> = {}
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(origin), 'Content-Type': 'application/json', ...extra },
  });
}

function isCredentials(email: unknown, password: unknown): email is string {
  return (
    typeof email === 'string' &&
    email.trim().length > 0 &&
    email.length <= 254 &&
    typeof password === 'string' &&
    password.length >= 1 &&
    password.length <= 128
  );
}

async function verify(
  email: string,
  password: string,
  ip: string | null,
  userAgent: string | null
): Promise<VerifyResult> {
  const { data, error } = await admin.rpc('verify_admin_login', {
    p_email: email,
    p_password: password,
    p_ip: ip,
    p_user_agent: userAgent,
  });
  if (error) throw new Error(`verify_admin_login: ${error.message}`);
  return data as VerifyResult;
}

function rejection(result: VerifyResult, origin: string | null): Response {
  if (result.status === 'locked') {
    const seconds = result.retry_after_seconds ?? 900;
    return json({ code: 'locked', retry_after_seconds: seconds }, 429, origin, {
      'Retry-After': String(seconds),
    });
  }
  return json(
    {
      code: 'invalid_credentials',
      attempts_left: result.attempts_left,
      next_lock_seconds: result.next_lock_seconds,
    },
    401,
    origin
  );
}

async function login(
  body: Record<string, unknown>,
  ip: string | null,
  userAgent: string | null,
  origin: string | null
): Promise<Response> {
  const { email, password } = body;
  if (!isCredentials(email, password)) return json({ code: 'bad_request' }, 400, origin);

  const result = await verify(email, password as string, ip, userAgent);
  if (result.status !== 'ok' || !result.email) return rejection(result, origin);

  // Auth's own password is random bytes, so the session is minted from a
  // one-time link token instead. generateLink never sends an email.
  const { data: link, error: linkError } = await admin.auth.admin.generateLink({
    type: 'magiclink',
    email: result.email,
  });
  const tokenHash = link?.properties?.hashed_token;
  if (linkError || !tokenHash) {
    throw new Error(`generateLink: ${linkError?.message ?? 'no token returned'}`);
  }

  const publicClient = createClient(SUPABASE_URL, PUBLISHABLE_KEY, clientOptions);
  const { data: verified, error: otpError } = await publicClient.auth.verifyOtp({
    token_hash: tokenHash,
    type: 'magiclink',
  });
  if (otpError || !verified.session) {
    throw new Error(`verifyOtp: ${otpError?.message ?? 'no session returned'}`);
  }

  return json(
    {
      access_token: verified.session.access_token,
      refresh_token: verified.session.refresh_token,
    },
    200,
    origin
  );
}

async function changePassword(
  req: Request,
  body: Record<string, unknown>,
  ip: string | null,
  userAgent: string | null,
  origin: string | null
): Promise<Response> {
  const jwt = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!jwt) return json({ code: 'unauthorized' }, 401, origin);

  const { data: userData, error: userError } = await admin.auth.getUser(jwt);
  const user = userData?.user;
  if (userError || !user?.email) return json({ code: 'unauthorized' }, 401, origin);

  const { data: adminRow, error: adminError } = await admin
    .from('admin_users')
    .select('user_id')
    .eq('user_id', user.id)
    .maybeSingle();
  if (adminError) throw new Error(`admin_users: ${adminError.message}`);
  if (!adminRow) return json({ code: 'forbidden' }, 403, origin);

  const { current_password: current, new_password: next } = body;
  if (typeof next !== 'string' || next.length < 8 || next.length > 128) {
    return json(
      { code: 'weak_password', message: 'New password must be 8 to 128 characters.' },
      400,
      origin
    );
  }
  if (!isCredentials(user.email, current)) return json({ code: 'bad_request' }, 400, origin);

  // the same counter as sign-in, so an open session cannot be used to grind
  // through guesses at the current password either
  const result = await verify(user.email, current as string, ip, userAgent);
  if (result.status !== 'ok') return rejection(result, origin);

  const { error } = await admin.rpc('set_admin_password', {
    p_user_id: user.id,
    p_new_password: next,
  });
  if (error) throw new Error(`set_admin_password: ${error.message}`);

  return json({ ok: true }, 200, origin);
}

Deno.serve(async (req) => {
  const origin = req.headers.get('Origin');

  // Browsers from other sites are turned away. Requests with no Origin at all
  // (scripts) are let through: Origin is trivially faked there, and the
  // lockout applies to them exactly the same.
  if (origin && !ALLOWED_ORIGINS.has(origin)) {
    return new Response('Forbidden', { status: 403, headers: { Vary: 'Origin' } });
  }
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders(origin) });
  }
  if (req.method !== 'POST') return json({ code: 'method_not_allowed' }, 405, origin);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ code: 'bad_request' }, 400, origin);
  }

  const ip = (req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim().slice(0, 64) || null;
  const userAgent = (req.headers.get('user-agent') ?? '').slice(0, 200) || null;

  try {
    if (body?.action === 'login') return await login(body, ip, userAgent, origin);
    if (body?.action === 'change_password') {
      return await changePassword(req, body, ip, userAgent, origin);
    }
    return json({ code: 'bad_request' }, 400, origin);
  } catch (err) {
    console.error('admin-auth failed:', err instanceof Error ? err.message : 'unknown error');
    return json(
      { code: 'server_error', message: 'Sign-in is unavailable right now. Please try again.' },
      500,
      origin
    );
  }
});
