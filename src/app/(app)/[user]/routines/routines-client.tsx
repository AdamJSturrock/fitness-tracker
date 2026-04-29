'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type {
  Exercise,
  RoutineWithExercises,
  UserName,
} from '@/lib/types';
import { formatWeight } from '@/lib/units';
import {
  addExerciseToRoutine,
  archiveRoutine,
  createExercise,
  createRoutine,
  removeRoutineExercise,
  updateRoutine,
  updateRoutineExercise,
} from '@/server/actions';

const DOW_LONG = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export interface RoutinesClientProps {
  userId: number;
  userSegment: UserName;
  routines: RoutineWithExercises[];
  exercises: Exercise[];
}

export default function RoutinesClient({
  userId,
  routines,
  exercises,
}: RoutinesClientProps) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [expanded, setExpanded] = useState<number | null>(
    routines.length > 0 ? routines[0].id : null,
  );
  const [busy, setBusy] = useState(false);

  function refresh() {
    startTransition(() => {
      router.refresh();
    });
  }

  async function handleNewRoutine() {
    setBusy(true);
    try {
      const r = await createRoutine({
        userId,
        name: 'New routine',
        scheduleDays: [],
      });
      setExpanded(r.id);
      refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <button
          type="button"
          onClick={handleNewRoutine}
          disabled={busy}
          className="inline-flex h-10 items-center rounded-lg bg-emerald-600 px-3 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-60"
        >
          + New routine
        </button>
      </div>

      {routines.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-500">
          <p className="font-medium text-slate-700">No routines yet.</p>
          <p className="mt-1 text-xs">
            Create one to build a weekly workout schedule.
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {routines.map((r) => (
            <RoutineCard
              key={r.id}
              routine={r}
              exercises={exercises}
              expanded={expanded === r.id}
              onToggleExpand={() =>
                setExpanded((cur) => (cur === r.id ? null : r.id))
              }
              onChange={refresh}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function RoutineCard({
  routine,
  exercises,
  expanded,
  onToggleExpand,
  onChange,
}: {
  routine: RoutineWithExercises;
  exercises: Exercise[];
  expanded: boolean;
  onToggleExpand: () => void;
  onChange: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState(routine.name);
  const [days, setDays] = useState<number[]>(routine.scheduleDays);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  function isDirty() {
    return (
      name !== routine.name ||
      days.length !== routine.scheduleDays.length ||
      days.some((d) => !routine.scheduleDays.includes(d))
    );
  }

  async function persistMeta() {
    if (!isDirty()) return;
    setBusy(true);
    try {
      await updateRoutine({ id: routine.id, name, scheduleDays: days });
      setSavedAt(Date.now());
      onChange();
    } finally {
      setBusy(false);
    }
  }

  async function handleArchive() {
    if (!confirm(`Archive routine "${routine.name}"?`)) return;
    setBusy(true);
    try {
      await archiveRoutine(routine.id);
      onChange();
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <button
        type="button"
        onClick={onToggleExpand}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-slate-50"
      >
        <div className="min-w-0">
          <p className="truncate text-base font-semibold text-slate-900">
            {routine.name}
          </p>
          <p className="text-xs text-slate-500">
            {routine.scheduleDays.length === 0
              ? 'No days scheduled'
              : routine.scheduleDays.map((d) => DOW_LONG[d - 1]).join(' · ')}
            {' · '}
            {routine.exercises.length} exercise
            {routine.exercises.length === 1 ? '' : 's'}
          </p>
        </div>
        <span aria-hidden className="text-slate-400">
          {expanded ? '▲' : '▼'}
        </span>
      </button>

      {expanded ? (
        <div className="space-y-4 border-t border-slate-200 bg-slate-50 px-4 py-4">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">
              Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onBlur={persistMeta}
              className="mt-1 block h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-200"
            />
          </div>

          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Schedule
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {DOW_LONG.map((label, i) => {
                const dow = i + 1;
                const on = days.includes(dow);
                return (
                  <button
                    key={dow}
                    type="button"
                    onClick={() => {
                      setDays((cur) =>
                        on ? cur.filter((d) => d !== dow) : [...cur, dow].sort(),
                      );
                    }}
                    onBlur={persistMeta}
                    className={
                      'inline-flex h-9 min-w-[3rem] items-center justify-center rounded-md border px-2 text-xs font-semibold transition ' +
                      (on
                        ? 'border-emerald-600 bg-emerald-600 text-white'
                        : 'border-slate-300 bg-white text-slate-600 hover:bg-slate-50')
                    }
                  >
                    {label}
                  </button>
                );
              })}
              <button
                type="button"
                onClick={persistMeta}
                disabled={busy || !isDirty()}
                className="ml-auto inline-flex h-9 items-center rounded-md border border-emerald-600 bg-white px-3 text-xs font-semibold text-emerald-700 hover:bg-emerald-50 disabled:opacity-50"
              >
                Save
              </button>
            </div>
          </div>

          <ExercisesEditor
            routine={routine}
            allExercises={exercises}
            onChange={onChange}
          />

          <div className="flex items-center justify-between">
            {savedAt ? (
              <span className="text-xs text-emerald-600">Saved ✓</span>
            ) : (
              <span />
            )}
            <button
              type="button"
              onClick={handleArchive}
              disabled={busy}
              className="text-xs font-medium text-rose-600 hover:underline disabled:opacity-50"
            >
              Archive routine
            </button>
          </div>
        </div>
      ) : null}
    </li>
  );
}

function ExercisesEditor({
  routine,
  allExercises,
  onChange,
}: {
  routine: RoutineWithExercises;
  allExercises: Exercise[];
  onChange: () => void;
}) {
  const [busy, setBusy] = useState(false);

  async function handleRemove(routineExerciseId: number) {
    setBusy(true);
    try {
      await removeRoutineExercise(routineExerciseId);
      onChange();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
        Exercises
      </p>
      {routine.exercises.length === 0 ? (
        <p className="mt-2 rounded-md border border-dashed border-slate-300 bg-white px-3 py-3 text-sm text-slate-500">
          No exercises yet — add one below.
        </p>
      ) : (
        <ul className="mt-2 space-y-2">
          {routine.exercises.map((re) => (
            <ExerciseRow
              key={re.id}
              re={re}
              onRemove={() => handleRemove(re.id)}
              onChange={onChange}
              disabled={busy}
            />
          ))}
        </ul>
      )}
      <AddExercise
        routineId={routine.id}
        allExercises={allExercises}
        existingIds={new Set(routine.exercises.map((e) => e.exerciseId))}
        onAdded={onChange}
      />
    </div>
  );
}

function ExerciseRow({
  re,
  onRemove,
  onChange,
  disabled,
}: {
  re: RoutineWithExercises['exercises'][number];
  onRemove: () => void;
  onChange: () => void;
  disabled?: boolean;
}) {
  const isBodyweight = re.exercise.category === 'bodyweight';
  const [sets, setSets] = useState(
    re.targetSets != null ? String(re.targetSets) : '',
  );
  const [reps, setReps] = useState(
    re.targetReps != null ? String(re.targetReps) : '',
  );
  const [weight, setWeight] = useState(
    re.targetWeightLb != null ? String(re.targetWeightLb) : '',
  );

  async function persist(field: 'sets' | 'reps' | 'weightLb', raw: string) {
    const trimmed = raw.trim();
    let value: number | null;
    if (trimmed === '') value = null;
    else {
      const n = Number(trimmed);
      if (!Number.isFinite(n) || n <= 0) return;
      value = field === 'weightLb' ? n : Math.round(n);
    }
    const patch =
      field === 'sets'
        ? { targetSets: value }
        : field === 'reps'
          ? { targetReps: value }
          : { targetWeightLb: value };
    await updateRoutineExercise({ id: re.id, ...patch });
    onChange();
  }

  return (
    <li className="rounded-md border border-slate-200 bg-white p-3">
      <div className="flex items-center justify-between gap-3">
        <p className="min-w-0 truncate text-sm font-semibold text-slate-900">
          {re.exercise.name}
          {isBodyweight ? (
            <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-slate-500">
              Bodyweight
            </span>
          ) : null}
        </p>
        <button
          type="button"
          onClick={onRemove}
          disabled={disabled}
          className="text-xs font-medium text-rose-600 hover:underline disabled:opacity-50"
        >
          Remove
        </button>
      </div>
      <div className="mt-2 grid grid-cols-3 gap-2">
        <NumField
          label="Sets"
          value={sets}
          onChange={setSets}
          onCommit={(v) => persist('sets', v)}
        />
        <NumField
          label="Reps"
          value={reps}
          onChange={setReps}
          onCommit={(v) => persist('reps', v)}
        />
        {isBodyweight ? (
          <div className="rounded-md bg-slate-50 px-2 py-2 text-[11px] text-slate-400">
            (no weight)
          </div>
        ) : (
          <NumField
            label="Weight (lb)"
            value={weight}
            onChange={setWeight}
            onCommit={(v) => persist('weightLb', v)}
            decimal
          />
        )}
      </div>
    </li>
  );
}

function AddExercise({
  routineId,
  allExercises,
  existingIds,
  onAdded,
}: {
  routineId: number;
  allExercises: Exercise[];
  existingIds: Set<number>;
  onAdded: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [newCategory, setNewCategory] = useState<'strength' | 'bodyweight'>(
    'strength',
  );

  const matches = useMemo(() => {
    const q = search.trim().toLowerCase();
    const pool = allExercises.filter((e) => !existingIds.has(e.id));
    if (q === '') return pool.slice(0, 12);
    return pool.filter((e) => e.name.toLowerCase().includes(q)).slice(0, 12);
  }, [search, allExercises, existingIds]);

  async function add(exerciseId: number) {
    setBusy(true);
    try {
      await addExerciseToRoutine({ routineId, exerciseId });
      onAdded();
      setSearch('');
    } finally {
      setBusy(false);
    }
  }

  async function createAndAdd() {
    if (newName.trim() === '') return;
    setBusy(true);
    try {
      const ex = await createExercise({
        name: newName.trim(),
        category: newCategory,
      });
      await addExerciseToRoutine({ routineId, exerciseId: ex.id });
      onAdded();
      setNewName('');
      setCreating(false);
      setOpen(false);
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-3 inline-flex h-9 items-center rounded-md border border-emerald-600 bg-white px-3 text-xs font-semibold text-emerald-700 hover:bg-emerald-50"
      >
        + Add exercise
      </button>
    );
  }

  return (
    <div className="mt-3 space-y-2 rounded-md border border-slate-200 bg-white p-3">
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search exercises…"
          className="block h-9 flex-1 rounded-md border border-slate-300 bg-white px-3 text-sm shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-200"
        />
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-xs text-slate-500 hover:underline"
        >
          Cancel
        </button>
      </div>

      {matches.length > 0 ? (
        <ul className="space-y-1">
          {matches.map((e) => (
            <li key={e.id}>
              <button
                type="button"
                onClick={() => add(e.id)}
                disabled={busy}
                className="flex w-full items-center justify-between rounded-md border border-slate-200 bg-white px-3 py-2 text-left text-sm hover:border-emerald-400 hover:bg-emerald-50 disabled:opacity-50"
              >
                <span className="font-medium text-slate-800">{e.name}</span>
                <span className="text-[11px] uppercase tracking-wide text-slate-400">
                  {e.category}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-slate-500">
          No matches.{' '}
          <button
            type="button"
            onClick={() => {
              setCreating(true);
              setNewName(search);
            }}
            className="font-semibold text-emerald-700 hover:underline"
          >
            + Add new exercise
          </button>
        </p>
      )}

      {!creating ? (
        <button
          type="button"
          onClick={() => {
            setCreating(true);
            setNewName(search);
          }}
          className="text-xs font-medium text-emerald-700 hover:underline"
        >
          + Add new exercise
        </button>
      ) : (
        <div className="space-y-2 rounded-md border border-emerald-200 bg-emerald-50 p-3">
          <div className="grid grid-cols-2 gap-2">
            <label className="block">
              <span className="block text-[11px] font-semibold uppercase tracking-wide text-emerald-800">
                Name
              </span>
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                className="mt-1 block h-9 w-full rounded-md border border-emerald-300 bg-white px-2 text-sm"
              />
            </label>
            <label className="block">
              <span className="block text-[11px] font-semibold uppercase tracking-wide text-emerald-800">
                Type
              </span>
              <select
                value={newCategory}
                onChange={(e) =>
                  setNewCategory(e.target.value as 'strength' | 'bodyweight')
                }
                className="mt-1 block h-9 w-full rounded-md border border-emerald-300 bg-white px-2 text-sm"
              >
                <option value="strength">Strength</option>
                <option value="bodyweight">Bodyweight</option>
              </select>
            </label>
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setCreating(false)}
              className="text-xs text-slate-600 hover:underline"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={createAndAdd}
              disabled={busy || newName.trim() === ''}
              className="inline-flex h-8 items-center rounded-md bg-emerald-600 px-3 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              Create & add
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function NumField({
  label,
  value,
  onChange,
  onCommit,
  decimal,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  onCommit: (v: string) => void;
  decimal?: boolean;
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
        className="mt-1 block h-9 w-full rounded-md border border-slate-300 bg-white px-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-200"
      />
    </label>
  );
}
