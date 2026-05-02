'use client';

import { useState } from 'react';
import Link from 'next/link';
import type {
  RoutineWithExercises,
  TodayRoutineRow,
  UserName,
} from '@/lib/types';
import { formatWeight } from '@/lib/units';

export interface WorkoutSectionProps {
  date: string;
  routine: RoutineWithExercises | null;
  rows: TodayRoutineRow[];
  streak: number;
  hasAnyRoutine: boolean;
  userSegment: UserName;
  onTick: (routineExerciseId: number) => Promise<void>;
  onUntick: (routineExerciseId: number) => Promise<void>;
  onUpdateLog: (
    logId: number,
    patch: {
      sets?: number | null;
      reps?: number | null;
      weightLb?: number | null;
      durationMin?: number | null;
      distanceMi?: number | null;
      kcalMachine?: number | null;
    },
  ) => Promise<void>;
}

const DOW_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function formatLastSnapshot(snap: TodayRoutineRow['lastSnapshot']): string {
  if (!snap) return '';
  const parts: string[] = [];
  if (snap.totalSets != null && snap.topReps != null) {
    parts.push(`${snap.totalSets}×${snap.topReps}`);
  } else if (snap.topReps != null) {
    parts.push(`${snap.topReps} reps`);
  }
  if (snap.topWeightLb != null) parts.push(`@ ${formatWeight(snap.topWeightLb, 0)}`);
  if (snap.e1rm != null) parts.push(`· est. 1RM ${Math.round(snap.e1rm)}`);
  return parts.join(' ');
}

function formatTarget(row: TodayRoutineRow): string {
  const re = row.routineExercise;
  if (re.exercise.category === 'cardio') {
    const dur = re.targetDurationMin;
    const dist = re.targetDistanceMi;
    if (dur && dist) return `${dur} min · ${dist} mi`;
    if (dur) return `${dur} min`;
    if (dist) return `${dist} mi`;
    return '—';
  }
  const sets = re.targetSets;
  const reps = re.targetReps;
  const w = re.targetWeightLb;
  const isBodyweight = re.exercise.category === 'bodyweight';
  const setReps =
    sets && reps ? `${sets} × ${reps}` : reps ? `${reps} reps` : sets ? `${sets} sets` : '';
  const weight = isBodyweight ? '' : w ? ` @ ${formatWeight(w, 0)}` : '';
  return `${setReps}${weight}`.trim() || '—';
}

export default function WorkoutSection(props: WorkoutSectionProps) {
  const {
    routine,
    rows,
    streak,
    hasAnyRoutine,
    userSegment,
    onTick,
    onUntick,
    onUpdateLog,
  } = props;

  const completedCount = rows.filter((r) => r.log !== null).length;

  return (
    <section
      aria-label="Today's workout"
      className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
    >
      <header className="flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold text-slate-900">
          {routine ? "Today's workout" : 'Workout'}
        </h2>
        <div className="flex items-center gap-2 text-xs">
          {streak > 0 ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-1 font-semibold text-amber-700">
              <span aria-hidden>🔥</span>
              <span>{streak}-day streak</span>
            </span>
          ) : null}
          <Link
            href={`/${userSegment}/routines`}
            className="rounded-md border border-slate-200 px-2 py-1 text-slate-600 hover:bg-slate-50"
          >
            Routines
          </Link>
        </div>
      </header>

      {!hasAnyRoutine ? (
        <EmptyState userSegment={userSegment} reason="no-routines" />
      ) : !routine ? (
        <EmptyState userSegment={userSegment} reason="rest-day" />
      ) : (
        <>
          <p className="text-sm text-slate-600">
            <span className="font-semibold text-slate-900">{routine.name}</span>
            <span className="text-slate-400"> · </span>
            <span className="text-slate-500">
              {routine.scheduleDays.map((d) => DOW_SHORT[d - 1]).join(' · ')}
            </span>
            <span className="text-slate-400"> · </span>
            <span>
              {completedCount}/{rows.length} done
            </span>
          </p>
          <ul className="space-y-2">
            {rows.map((row) => (
              <RoutineRow
                key={row.routineExercise.id}
                row={row}
                onTick={onTick}
                onUntick={onUntick}
                onUpdateLog={onUpdateLog}
              />
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

function EmptyState({
  userSegment,
  reason,
}: {
  userSegment: UserName;
  reason: 'no-routines' | 'rest-day';
}) {
  if (reason === 'no-routines') {
    return (
      <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-600">
        No routines yet.{' '}
        <Link
          href={`/${userSegment}/routines`}
          className="font-semibold text-emerald-700 hover:underline"
        >
          Set up your weekly schedule →
        </Link>
      </div>
    );
  }
  return (
    <p className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">
      <span aria-hidden>🛌</span> Rest day.
    </p>
  );
}

function RoutineRow({
  row,
  onTick,
  onUntick,
  onUpdateLog,
}: {
  row: TodayRoutineRow;
  onTick: (routineExerciseId: number) => Promise<void>;
  onUntick: (routineExerciseId: number) => Promise<void>;
  onUpdateLog: (
    logId: number,
    patch: {
      sets?: number | null;
      reps?: number | null;
      weightLb?: number | null;
      durationMin?: number | null;
      distanceMi?: number | null;
      kcalMachine?: number | null;
    },
  ) => Promise<void>;
}) {
  const re = row.routineExercise;
  const category = re.exercise.category;
  const isBodyweight = category === 'bodyweight';
  const isCardio = category === 'cardio';
  const isDone = row.log !== null;
  const [busy, setBusy] = useState(false);

  // Editable fields when ticked, prefilled from log.
  const [sets, setSets] = useState<string>(
    row.log?.sets != null ? String(row.log.sets) : '',
  );
  const [reps, setReps] = useState<string>(
    row.log?.reps != null ? String(row.log.reps) : '',
  );
  const [weight, setWeight] = useState<string>(
    row.log?.weightLb != null ? String(row.log.weightLb) : '',
  );
  const [duration, setDuration] = useState<string>(
    row.log?.durationMin != null ? String(row.log.durationMin) : '',
  );
  const [distance, setDistance] = useState<string>(
    row.log?.distanceMi != null ? String(row.log.distanceMi) : '',
  );
  const [kcalMachine, setKcalMachine] = useState<string>(
    row.log?.kcalMachine != null ? String(row.log.kcalMachine) : '',
  );

  const correction = re.exercise.kcalCorrectionFactor;
  const enteredKcal = Number(kcalMachine);
  const correctedKcal =
    Number.isFinite(enteredKcal) && enteredKcal > 0
      ? Math.round(enteredKcal * correction)
      : null;

  async function toggle() {
    setBusy(true);
    try {
      if (isDone) {
        await onUntick(re.id);
      } else {
        await onTick(re.id);
      }
    } finally {
      setBusy(false);
    }
  }

  async function saveLogField(
    field:
      | 'sets'
      | 'reps'
      | 'weightLb'
      | 'durationMin'
      | 'distanceMi'
      | 'kcalMachine',
    raw: string,
  ) {
    if (!row.log) return;
    const trimmed = raw.trim();
    let value: number | null;
    if (trimmed === '') {
      value = null;
    } else {
      const n = Number(trimmed);
      if (!Number.isFinite(n) || n <= 0) return;
      value =
        field === 'weightLb' ||
        field === 'durationMin' ||
        field === 'distanceMi'
          ? n
          : Math.round(n);
    }
    setBusy(true);
    try {
      await onUpdateLog(row.log.id, { [field]: value });
    } finally {
      setBusy(false);
    }
  }

  function categoryBadge() {
    if (isCardio) {
      return (
        <span className="ml-2 rounded-full bg-sky-100 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-sky-700">
          Cardio
        </span>
      );
    }
    if (isBodyweight) {
      return (
        <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-slate-500">
          Bodyweight
        </span>
      );
    }
    return null;
  }

  return (
    <li
      className={
        'rounded-lg border p-3 transition ' +
        (isDone
          ? 'border-emerald-300 bg-emerald-50'
          : 'border-slate-200 bg-white')
      }
    >
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={toggle}
          disabled={busy}
          aria-pressed={isDone}
          aria-label={isDone ? 'Mark not done' : 'Mark done'}
          className={
            'inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border text-base font-semibold transition ' +
            (isDone
              ? 'border-emerald-600 bg-emerald-600 text-white'
              : 'border-slate-300 bg-white text-slate-400 hover:border-slate-400') +
            ' disabled:opacity-50'
          }
        >
          {isDone ? '✓' : ''}
        </button>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-slate-900">
            {re.exercise.name}
            {categoryBadge()}
          </p>
          <p className="text-xs text-slate-500">{formatTarget(row)}</p>
          {row.lastSnapshot && !isCardio ? (
            <p className="mt-0.5 text-[11px] text-slate-400">
              Last: {formatLastSnapshot(row.lastSnapshot)}
              {row.lastSnapshot.isPr ? (
                <span className="ml-1 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700">
                  PR
                </span>
              ) : null}
            </p>
          ) : null}
        </div>
      </div>

      {isDone ? (
        isCardio ? (
          <div className="mt-3 space-y-2">
            <div className="grid grid-cols-3 gap-2">
              <NumField
                label="Minutes"
                value={duration}
                onChange={setDuration}
                onCommit={(v) => saveLogField('durationMin', v)}
                decimal
                disabled={busy}
              />
              <NumField
                label="Distance (mi)"
                value={distance}
                onChange={setDistance}
                onCommit={(v) => saveLogField('distanceMi', v)}
                decimal
                disabled={busy}
              />
              <NumField
                label="Machine kcal"
                value={kcalMachine}
                onChange={setKcalMachine}
                onCommit={(v) => saveLogField('kcalMachine', v)}
                disabled={busy}
              />
            </div>
            {correctedKcal != null ? (
              <p className="rounded-md bg-sky-50 px-2 py-1.5 text-xs text-sky-900">
                Corrected estimate:{' '}
                <span className="font-bold">{correctedKcal} kcal</span>{' '}
                <span className="text-sky-700">
                  ({Math.round(correction * 100)}% of {Math.round(enteredKcal)})
                </span>
              </p>
            ) : (
              <p className="text-[11px] text-slate-400">
                Enter the machine&rsquo;s kcal reading; we&rsquo;ll show a more
                realistic figure ({Math.round(correction * 100)}% factor).
              </p>
            )}
          </div>
        ) : (
          <div className="mt-3 grid grid-cols-3 gap-2">
            <NumField
              label="Sets"
              value={sets}
              onChange={setSets}
              onCommit={(v) => saveLogField('sets', v)}
              disabled={busy}
            />
            <NumField
              label="Reps"
              value={reps}
              onChange={setReps}
              onCommit={(v) => saveLogField('reps', v)}
              disabled={busy}
            />
            {isBodyweight ? (
              <div />
            ) : (
              <NumField
                label="Weight (lb)"
                value={weight}
                onChange={setWeight}
                onCommit={(v) => saveLogField('weightLb', v)}
                decimal
                disabled={busy}
              />
            )}
          </div>
        )
      ) : null}
    </li>
  );
}

function NumField({
  label,
  value,
  onChange,
  onCommit,
  decimal,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  onCommit: (v: string) => void;
  decimal?: boolean;
  disabled?: boolean;
}) {
  return (
    <label className="block">
      <span className="block text-[11px] font-medium uppercase tracking-wide text-slate-500">
        {label}
      </span>
      <input
        type="text"
        inputMode={decimal ? 'decimal' : 'numeric'}
        value={value}
        onChange={(e) => {
          const cleaned = decimal
            ? e.target.value.replace(/[^0-9.]/g, '')
            : e.target.value.replace(/[^0-9]/g, '');
          onChange(cleaned);
        }}
        onBlur={(e) => onCommit(e.target.value)}
        disabled={disabled}
        className="mt-1 block h-10 w-full rounded-md border border-slate-300 bg-white px-2 text-sm text-slate-900 shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-200 disabled:opacity-60"
      />
    </label>
  );
}
