// Renamed from `middleware.ts` to `proxy.ts` for Next.js 16: `middleware.ts` is
// deprecated, replaced by `proxy.ts` which exports a `proxy` function. The
// behaviour is the same — gate non-public paths behind a session cookie.

import { NextResponse, type NextRequest } from 'next/server';
import { getIronSession } from 'iron-session';
import type { SessionData } from '@/lib/auth';

const SESSION_COOKIE_NAME = 'fit_session';
const THIRTY_DAYS_SECONDS = 60 * 60 * 24 * 30;

function getCookieSecret(): string {
  const secret = process.env.COOKIE_SECRET;
  if (!secret || secret.length < 32) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error(
        'COOKIE_SECRET env var must be set to a string of at least 32 characters in production.',
      );
    }
    return 'dev-only-cookie-secret-please-replace-32+chars';
  }
  return secret;
}

export async function proxy(req: NextRequest) {
  const res = NextResponse.next();

  // iron-session v8 accepts a Web-style CookieStore (matching next/headers'
  // `cookies()` shape). Adapt the proxy request/response cookie jars to that
  // shape so we can read and write the session cookie inline.
  const cookieStore = {
    get: (name: string) => {
      const c = req.cookies.get(name);
      return c ? { name: c.name, value: c.value } : undefined;
    },
    set: (
      ...args:
        | [string, string, Record<string, unknown> | undefined]
        | [Record<string, unknown>]
    ) => {
      if (typeof args[0] === 'string') {
        const [name, value, options] = args as [
          string,
          string,
          Record<string, unknown> | undefined,
        ];
        res.cookies.set({ name, value, ...(options ?? {}) });
      } else {
        const opts = args[0] as { name: string; value: string };
        res.cookies.set(opts);
      }
    },
  };

  // iron-session's first overload accepts a CookieStore shape. The type isn't
  // exported, so we cast through `any` rather than reach into its internals.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const session = await getIronSession<SessionData>(cookieStore as any, {
    password: getCookieSecret(),
    cookieName: SESSION_COOKIE_NAME,
    cookieOptions: {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: THIRTY_DAYS_SECONDS,
      path: '/',
    },
  });

  if (!session.authed) {
    const url = req.nextUrl.clone();
    url.pathname = '/login';
    url.search = '';
    return NextResponse.redirect(url);
  }

  return res;
}

export const config = {
  // Run on every request EXCEPT login, the login API, the logout API,
  // Next.js internals, and the favicon.
  matcher: [
    '/((?!login|api/login|api/logout|_next/static|_next/image|favicon.ico).*)',
  ],
};
