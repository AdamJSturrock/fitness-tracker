import { NextResponse } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { login } from '@/lib/auth';

export const runtime = 'nodejs';

function constantTimeEqual(a: string, b: string): boolean {
  const aBuf = Buffer.from(a, 'utf8');
  const bBuf = Buffer.from(b, 'utf8');
  if (aBuf.length !== bBuf.length) {
    // Still do a comparison so timing is similar regardless of length.
    timingSafeEqual(aBuf, aBuf);
    return false;
  }
  return timingSafeEqual(aBuf, bBuf);
}

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON.' }, { status: 400 });
  }

  const password =
    body && typeof body === 'object' && 'password' in body
      ? String((body as { password?: unknown }).password ?? '')
      : '';

  const expected = process.env.APP_PASSWORD;
  if (!expected) {
    return NextResponse.json(
      { error: 'Server is not configured (APP_PASSWORD missing).' },
      { status: 500 },
    );
  }

  if (!password || !constantTimeEqual(password, expected)) {
    return NextResponse.json(
      { error: 'Incorrect password.' },
      { status: 401 },
    );
  }

  await login();
  return NextResponse.json({ ok: true });
}
