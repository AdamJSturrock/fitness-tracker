import 'server-only';
import { cookies } from 'next/headers';
import { getIronSession, type SessionOptions } from 'iron-session';
import type { UserName } from './types';

export interface SessionData {
  authed?: true;
}

const SESSION_COOKIE_NAME = 'fit_session';
const USER_COOKIE_NAME = 'fit_user';
const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;
const THIRTY_DAYS_SECONDS = 60 * 60 * 24 * 30;

function getCookieSecret(): string {
  const secret = process.env.COOKIE_SECRET;
  if (!secret || secret.length < 32) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error(
        'COOKIE_SECRET env var must be set to a string of at least 32 characters in production.',
      );
    }
    // In dev/test, fall back to a stable but obviously-fake secret so local
    // builds don't fail when no .env.local exists.
    return 'dev-only-cookie-secret-please-replace-32+chars';
  }
  return secret;
}

export function sessionOptions(): SessionOptions {
  return {
    password: getCookieSecret(),
    cookieName: SESSION_COOKIE_NAME,
    cookieOptions: {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: THIRTY_DAYS_SECONDS,
      path: '/',
    },
  };
}

export async function getSession() {
  const cookieStore = await cookies();
  return getIronSession<SessionData>(cookieStore, sessionOptions());
}

export async function login(): Promise<void> {
  const session = await getSession();
  session.authed = true;
  await session.save();
}

export async function logout(): Promise<void> {
  const session = await getSession();
  session.destroy();
}

export async function isAuthed(): Promise<boolean> {
  const session = await getSession();
  return session.authed === true;
}

// ---------------------------------------------------------------------------
// fit_user cookie — plain (unsigned) cookie remembering the last-used user.
// Used by `(app)/page.tsx` to redirect to the right `/[user]/dashboard`.
// ---------------------------------------------------------------------------

import { VALID_USERS as VALID_USER_NAMES } from '@/lib/types';

export async function getLastUser(): Promise<UserName> {
  const cookieStore = await cookies();
  const value = cookieStore.get(USER_COOKIE_NAME)?.value;
  if (value && (VALID_USER_NAMES as readonly string[]).includes(value)) {
    return value as UserName;
  }
  return 'adam';
}

export async function setLastUser(user: UserName): Promise<void> {
  if (!VALID_USER_NAMES.includes(user)) {
    throw new Error(`Invalid user '${user}'`);
  }
  const cookieStore = await cookies();
  cookieStore.set(USER_COOKIE_NAME, user, {
    httpOnly: false,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: ONE_YEAR_SECONDS,
    path: '/',
  });
}

export const COOKIE_NAMES = {
  session: SESSION_COOKIE_NAME,
  user: USER_COOKIE_NAME,
} as const;
