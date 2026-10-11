// The single shared access password. Used by proxy.ts (every request) and
// /api/unlock (setting the cookie). Web Crypto only, so it runs anywhere.

export const ACCESS_COOKIE = "kube_access";
/** 90 days: enter the password once per device. */
export const ACCESS_COOKIE_MAX_AGE = 60 * 60 * 24 * 90;

/** The configured password, or null when the gate is off (e.g. local dev). */
export function accessPassword(): string | null {
  return process.env.KUBE_ACCESS_PASSWORD?.trim() || null;
}

/**
 * The cookie value proving someone entered the password. It's derived from
 * the password, so changing KUBE_ACCESS_PASSWORD logs everyone out.
 */
export function accessToken(password: string): Promise<string> {
  return hmacHex(password, "studyingkube-access-v1");
}

/** Constant-time check of a password attempt. */
export async function passwordMatches(attempt: string, password: string): Promise<boolean> {
  const [a, b] = await Promise.all([hmacHex("attempt", attempt), hmacHex("attempt", password)]);
  return safeEqual(a, b);
}

export async function hasValidAccessCookie(cookieValue: string | undefined, password: string): Promise<boolean> {
  if (!cookieValue) return false;
  return safeEqual(cookieValue, await accessToken(password));
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function hmacHex(key: string, message: string): Promise<string> {
  const encoder = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    encoder.encode(key),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", cryptoKey, encoder.encode(message));
  return Array.from(new Uint8Array(signature), (b) => b.toString(16).padStart(2, "0")).join("");
}
