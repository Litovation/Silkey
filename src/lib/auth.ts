/**
 * Accounts: Google sign-in, session upkeep and the access check.
 *
 * Only the sign-in and a yes/no access answer ever go to the server; audio and
 * text stay on this computer.
 */
import {
  OAUTH_REDIRECT_URL,
  SUPABASE_PUBLISHABLE_KEY,
  SUPABASE_URL,
} from "./constants/supabase";

export interface Session {
  access_token: string;
  refresh_token: string;
  /** Unix seconds. */
  expires_at: number;
  email: string;
}

export type AccessStatus =
  "trial" | "paid" | "free_forever" | "expired" | "banned";

export interface Access {
  status: AccessStatus;
  allowed: boolean;
  trial_ends_at: string;
}

/** Why dictation is blocked for a signed-in user. */
export type BlockReason = "expired" | "banned" | "offline";

export type Verdict =
  | { state: "signedOut" }
  | { state: "allowed"; access: Access; offline: boolean }
  | { state: "blocked"; reason: BlockReason; access: Access | null };

interface AccessCache {
  access: Access;
  /** When the server last answered, by this PC's clock (ms). */
  checkedAt: number;
  /** Latest time this PC's clock has ever shown us (ms). */
  lastSeen: number;
}

const SESSION_KEY = "silktone.session";
const CACHE_KEY = "silktone.access";
const VERIFIER_KEY = "silktone.pkceVerifier";

const OFFLINE_WINDOW_MS = 3 * 24 * 60 * 60 * 1000;
// Small allowance for daylight-saving and clock-sync corrections.
const CLOCK_SLACK_MS = 10 * 60 * 1000;
const REFRESH_MARGIN_S = 60;
// A hung connection must not keep the app on a blank screen at startup.
const REQUEST_TIMEOUT_MS = 8000;

/** The server was reached and refused the session (signed out, banned, revoked). */
class AuthRejectedError extends Error {}

const read = <T>(key: string): T | null => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
};

const write = (key: string, value: unknown): void => {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // ignore
  }
};

export const getSession = (): Session | null => read<Session>(SESSION_KEY);

const clearAccount = (): void => {
  write(SESSION_KEY, null);
  write(CACHE_KEY, null);
};

const base64Url = (bytes: Uint8Array): string =>
  btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

/** Build the Google sign-in URL and remember the PKCE verifier for the return. */
export const beginSignIn = async (): Promise<string> => {
  const verifier = base64Url(crypto.getRandomValues(new Uint8Array(48)));
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(verifier),
  );
  write(VERIFIER_KEY, verifier);

  const params = new URLSearchParams({
    provider: "google",
    redirect_to: OAUTH_REDIRECT_URL,
    code_challenge: base64Url(new Uint8Array(digest)),
    code_challenge_method: "s256",
  });
  return `${SUPABASE_URL}/auth/v1/authorize?${params.toString()}`;
};

interface TokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  user?: { email?: string };
}

const requestToken = async (
  grant: "pkce" | "refresh_token",
  body: Record<string, string>,
  fallbackEmail = "",
): Promise<Session> => {
  const response = await fetch(
    `${SUPABASE_URL}/auth/v1/token?grant_type=${grant}`,
    {
      method: "POST",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      headers: {
        apikey: SUPABASE_PUBLISHABLE_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    },
  );
  if (response.status >= 400 && response.status < 500) {
    throw new AuthRejectedError(`Sign-in was refused (${response.status})`);
  }
  if (!response.ok) throw new Error(`Auth server error (${response.status})`);

  const data = (await response.json()) as TokenResponse;
  const session: Session = {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: Math.floor(Date.now() / 1000) + data.expires_in,
    email: data.user?.email ?? fallbackEmail,
  };
  write(SESSION_KEY, session);
  return session;
};

/**
 * Finish sign-in from the query string the browser came back with.
 * Throws with a readable message when Google or the server reported a problem.
 */
export const completeSignIn = async (query: string): Promise<void> => {
  const params = new URLSearchParams(query);
  const code = params.get("code");
  const verifier = read<string>(VERIFIER_KEY);
  write(VERIFIER_KEY, null);

  if (!code || !verifier) {
    throw new Error(
      params.get("error_description") ??
        params.get("error") ??
        "No sign-in code",
    );
  }
  await requestToken("pkce", { auth_code: code, code_verifier: verifier });
};

const freshSession = async (session: Session): Promise<Session> => {
  if (session.expires_at - Date.now() / 1000 > REFRESH_MARGIN_S) return session;
  return requestToken(
    "refresh_token",
    { refresh_token: session.refresh_token },
    session.email,
  );
};

const fetchAccess = async (session: Session): Promise<Access> => {
  const response = await fetch(
    `${SUPABASE_URL}/rest/v1/rpc/silktone_get_access`,
    {
      method: "POST",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      headers: {
        apikey: SUPABASE_PUBLISHABLE_KEY,
        Authorization: `Bearer ${session.access_token}`,
        "Content-Type": "application/json",
      },
      body: "{}",
    },
  );
  if (response.status === 401 || response.status === 403) {
    throw new AuthRejectedError(
      `Access check was refused (${response.status})`,
    );
  }
  if (!response.ok) throw new Error(`Access check failed (${response.status})`);

  const access = (await response.json()) as Access | null;
  // No profile row means the account was removed on the server.
  if (!access) throw new AuthRejectedError("Account not found");
  return access;
};

const offlineVerdict = (now: number): Verdict => {
  const cache = read<AccessCache>(CACHE_KEY);
  if (!cache) return { state: "blocked", reason: "offline", access: null };

  const clockWentBack = now < cache.lastSeen - CLOCK_SLACK_MS;
  const tooLongOffline = now - cache.checkedAt > OFFLINE_WINDOW_MS;
  const trialOver =
    cache.access.status === "trial" &&
    now >= new Date(cache.access.trial_ends_at).getTime();

  if (!clockWentBack) {
    write(CACHE_KEY, { ...cache, lastSeen: Math.max(cache.lastSeen, now) });
  }
  if (!cache.access.allowed || trialOver) {
    return {
      state: "blocked",
      reason: cache.access.status === "banned" ? "banned" : "expired",
      access: cache.access,
    };
  }
  if (clockWentBack || tooLongOffline) {
    return { state: "blocked", reason: "offline", access: cache.access };
  }
  return { state: "allowed", access: cache.access, offline: true };
};

/**
 * Decide whether this PC may dictate right now. Asks the server when it can;
 * otherwise falls back to the last answer for up to three days.
 */
export const evaluateAccess = async (): Promise<Verdict> => {
  const session = getSession();
  if (!session) return { state: "signedOut" };

  try {
    const access = await fetchAccess(await freshSession(session));
    const now = Date.now();
    write(CACHE_KEY, { access, checkedAt: now, lastSeen: now });
    if (access.allowed) return { state: "allowed", access, offline: false };
    return {
      state: "blocked",
      reason: access.status === "banned" ? "banned" : "expired",
      access,
    };
  } catch (error) {
    if (error instanceof AuthRejectedError) {
      clearAccount();
      return { state: "signedOut" };
    }
    // Network or server trouble: fall back to the last known answer.
    return offlineVerdict(Date.now());
  }
};

export const signOut = async (): Promise<void> => {
  const session = getSession();
  clearAccount();
  if (!session) return;
  try {
    await fetch(`${SUPABASE_URL}/auth/v1/logout?scope=local`, {
      method: "POST",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      headers: {
        apikey: SUPABASE_PUBLISHABLE_KEY,
        Authorization: `Bearer ${session.access_token}`,
      },
    });
  } catch {
    // Signed out locally either way.
  }
};

/** Whole days left in the trial, never negative. */
export const trialDaysLeft = (access: Access, now = Date.now()): number =>
  Math.max(
    0,
    Math.ceil(
      (new Date(access.trial_ends_at).getTime() - now) / (24 * 60 * 60 * 1000),
    ),
  );
