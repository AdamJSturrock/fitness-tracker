import 'server-only';
import { createClient, type Client } from '@libsql/client';
import type { UserName } from './types';

let _db: Client | null = null;

/**
 * Singleton libsql client. Reads `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN`
 * from env. Falls back to a local sqlite file for development.
 */
export function getDb(): Client {
  if (_db) return _db;

  const url = process.env.TURSO_DATABASE_URL ?? 'file:./local.db';
  const authToken = process.env.TURSO_AUTH_TOKEN || undefined;

  _db = createClient({ url, authToken });
  return _db;
}

// Backwards-compatible export: callers can `import { db } from '@/lib/db'`.
export const db: Client = new Proxy({} as Client, {
  get(_target, prop, receiver) {
    const client = getDb();
    const value = Reflect.get(client as object, prop, receiver);
    return typeof value === 'function' ? value.bind(client) : value;
  },
});

const userIdCache = new Map<UserName, number>();

/**
 * Returns the integer user id for a given user name, caching after first lookup.
 * Throws if the user row is missing — run `pnpm migrate` to seed.
 */
export async function userIdByName(name: UserName): Promise<number> {
  const cached = userIdCache.get(name);
  if (cached !== undefined) return cached;

  const client = getDb();
  const result = await client.execute({
    sql: 'SELECT id FROM users WHERE name = ? LIMIT 1',
    args: [name],
  });

  const row = result.rows[0];
  if (!row) {
    throw new Error(
      `User '${name}' not found. Run \`pnpm migrate\` to seed users.`,
    );
  }

  const id = Number(row.id);
  userIdCache.set(name, id);
  return id;
}
