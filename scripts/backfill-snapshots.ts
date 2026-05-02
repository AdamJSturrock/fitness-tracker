/**
 * One-shot: walk every exercise_logs row and (re)compute the matching
 * performance_snapshots row. Idempotent — safe to run repeatedly on
 * localhost or production. Use after migrating in pre-existing logs.
 *
 *   pnpm backfill:snapshots
 */

import { createClient } from '@libsql/client';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { backfillAllSnapshots } from '../src/server/snapshots';

function loadDotenvLocal() {
  const envPath = resolve(process.cwd(), '.env.local');
  if (!existsSync(envPath)) return;
  const raw = readFileSync(envPath, 'utf8');
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}

loadDotenvLocal();

async function main() {
  const url = process.env.TURSO_DATABASE_URL ?? 'file:./local.db';
  const authToken = process.env.TURSO_AUTH_TOKEN || undefined;
  console.log(`[backfill:snapshots] connecting to ${url}`);
  const client = createClient({ url, authToken });
  const { scanned, written } = await backfillAllSnapshots(client);
  console.log(`[backfill:snapshots] scanned ${scanned} log days · wrote ${written} snapshots`);
}

main().catch((err) => {
  console.error('[backfill:snapshots] FAILED:', err);
  process.exit(1);
});
