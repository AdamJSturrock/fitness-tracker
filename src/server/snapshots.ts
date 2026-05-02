import type { Client } from '@libsql/client';

/**
 * Recompute the performance_snapshots row for (userId, exerciseId, date)
 * from the current exercise_logs rows. If no logs remain for that day, the
 * snapshot row is deleted. Otherwise an upsert writes summary fields and
 * marks the snapshot as a PR when its est. 1RM beats every earlier
 * snapshot for the same (user, exercise).
 *
 * Uses the Epley estimate: e1rm = weight × (1 + reps/30). Cardio rows
 * (no weight/reps) leave e1rm null and never count as a PR — they still
 * write a row so the workout view can show "last time: 30 min · 2.5 mi".
 *
 * Pass the libsql client through so this same routine works inside server
 * actions and stand-alone scripts (seed/backfill).
 */
export async function refreshPerformanceSnapshot(
  client: Client,
  userId: number,
  exerciseId: number,
  date: string,
): Promise<void> {
  const logs = await client.execute({
    sql: `SELECT sets, reps, weight_lb
            FROM exercise_logs
           WHERE user_id = ? AND exercise_id = ? AND date = ?`,
    args: [userId, exerciseId, date],
  });

  if (logs.rows.length === 0) {
    await client.execute({
      sql: `DELETE FROM performance_snapshots
             WHERE user_id = ? AND exercise_id = ? AND date = ?`,
      args: [userId, exerciseId, date],
    });
    return;
  }

  let topWeight: number | null = null;
  let topReps: number | null = null;
  let totalVolume = 0;
  let totalSets = 0;
  let bestE1rm: number | null = null;
  for (const r of logs.rows) {
    const sets = r.sets === null || r.sets === undefined ? null : Number(r.sets);
    const reps = r.reps === null || r.reps === undefined ? null : Number(r.reps);
    const weight =
      r.weight_lb === null || r.weight_lb === undefined
        ? null
        : Number(r.weight_lb);
    if (sets != null && reps != null && weight != null && weight > 0) {
      totalSets += sets;
      totalVolume += weight * sets * reps;
      const e1rm = weight * (1 + reps / 30);
      if (
        bestE1rm === null ||
        e1rm > bestE1rm ||
        (e1rm === bestE1rm && (topWeight === null || weight > topWeight))
      ) {
        bestE1rm = e1rm;
        topWeight = weight;
        topReps = reps;
      }
    } else if (sets != null && reps != null) {
      totalSets += sets;
      if (topReps === null || reps > topReps) topReps = reps;
    }
  }

  let isPr = false;
  if (bestE1rm !== null) {
    const prior = await client.execute({
      sql: `SELECT MAX(e1rm) AS best
              FROM performance_snapshots
             WHERE user_id = ? AND exercise_id = ? AND date < ?`,
      args: [userId, exerciseId, date],
    });
    const priorBest =
      prior.rows[0]?.best === null || prior.rows[0]?.best === undefined
        ? null
        : Number(prior.rows[0].best);
    if (priorBest === null || bestE1rm > priorBest) isPr = true;
  }

  await client.execute({
    sql: `INSERT INTO performance_snapshots
            (user_id, exercise_id, date,
             top_weight_lb, top_reps, total_volume_lb, total_sets, e1rm, is_pr)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(user_id, exercise_id, date) DO UPDATE SET
            top_weight_lb   = excluded.top_weight_lb,
            top_reps        = excluded.top_reps,
            total_volume_lb = excluded.total_volume_lb,
            total_sets      = excluded.total_sets,
            e1rm            = excluded.e1rm,
            is_pr           = excluded.is_pr`,
    args: [
      userId,
      exerciseId,
      date,
      topWeight,
      topReps,
      totalVolume > 0 ? totalVolume : null,
      totalSets > 0 ? totalSets : null,
      bestE1rm,
      isPr ? 1 : 0,
    ],
  });
}

/**
 * Walk every (user, exercise, date) in `exercise_logs` and (re)compute its
 * snapshot. Used by the backfill script and by the demo seeder so PRs show
 * up immediately.
 *
 * Iterates in date-ascending order so PR detection sees prior days first
 * and the chronologically-earliest top set wins the PR flag.
 */
export async function backfillAllSnapshots(client: Client): Promise<{
  scanned: number;
  written: number;
}> {
  // Wipe first so re-running is idempotent — otherwise stale PR flags from
  // an older log set could linger.
  await client.execute('DELETE FROM performance_snapshots');

  const r = await client.execute(
    `SELECT DISTINCT user_id, exercise_id, date
       FROM exercise_logs
      ORDER BY date ASC, user_id ASC, exercise_id ASC`,
  );
  let written = 0;
  for (const row of r.rows) {
    await refreshPerformanceSnapshot(
      client,
      Number(row.user_id),
      Number(row.exercise_id),
      String(row.date),
    );
    written++;
  }
  return { scanned: r.rows.length, written };
}
