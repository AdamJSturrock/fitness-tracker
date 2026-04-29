'use client';

import { useMemo, useState } from 'react';
import {
  ComposedChart,
  Legend,
  Line,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { formatShortDate } from '@/lib/dateUtils';
import { formatWeight, weightLbForBmi } from '@/lib/units';

export interface WeightChartProps {
  rawWeights: { date: string; weightLb: number }[];
  movingAvg: { date: string; weightLb: number }[];
  healthyLoss: { date: string; weightLb: number }[];
  projection: { date: string; weightLb: number }[] | null;
  targetMinLb: number | null;
  targetMaxLb: number | null;
  heightIn: number | null;
  todayIso: string;
}

interface BmiBand {
  y1: number;
  y2: number;
  fill: string;
}

function bmiBandsForHeight(
  heightIn: number,
  yDomain: [number, number],
): BmiBand[] {
  const [yMin, yMax] = yDomain;
  const t18 = weightLbForBmi(18.5, heightIn);
  const t25 = weightLbForBmi(25, heightIn);
  const t30 = weightLbForBmi(30, heightIn);
  const clamp = (v: number) => Math.max(yMin, Math.min(yMax, v));
  const raw: BmiBand[] = [
    { y1: yMin, y2: clamp(t18), fill: '#0ea5e9' }, // underweight (sky)
    { y1: clamp(t18), y2: clamp(t25), fill: '#10b981' }, // healthy (emerald)
    { y1: clamp(t25), y2: clamp(t30), fill: '#f59e0b' }, // overweight (amber)
    { y1: clamp(t30), y2: yMax, fill: '#e11d48' }, // obese (rose)
  ];
  return raw.filter((b) => b.y2 > b.y1 + 0.001);
}

interface ChartRow {
  date: string;
  raw?: number;
  ma?: number;
  healthy?: number;
  projection?: number;
}

function buildChartData(props: WeightChartProps): ChartRow[] {
  const dates = new Set<string>();
  for (const p of props.rawWeights) dates.add(p.date);
  for (const p of props.movingAvg) dates.add(p.date);
  for (const p of props.healthyLoss) dates.add(p.date);
  if (props.projection) for (const p of props.projection) dates.add(p.date);
  dates.add(props.todayIso);

  const sorted = Array.from(dates).sort();

  const rawMap = new Map(props.rawWeights.map((p) => [p.date, p.weightLb]));
  const maMap = new Map(props.movingAvg.map((p) => [p.date, p.weightLb]));
  const healthyMap = new Map(
    props.healthyLoss.map((p) => [p.date, p.weightLb]),
  );
  const projMap = props.projection
    ? new Map(props.projection.map((p) => [p.date, p.weightLb]))
    : null;

  return sorted.map((date) => {
    const row: ChartRow = { date };
    const r = rawMap.get(date);
    if (r !== undefined) row.raw = r;
    const m = maMap.get(date);
    if (m !== undefined) row.ma = m;
    const h = healthyMap.get(date);
    if (h !== undefined) row.healthy = h;
    if (projMap) {
      const p = projMap.get(date);
      if (p !== undefined) row.projection = p;
    }
    return row;
  });
}

function computeYDomain(data: ChartRow[], targetMin: number | null, targetMax: number | null): [number, number] | undefined {
  const values: number[] = [];
  for (const row of data) {
    if (row.raw !== undefined) values.push(row.raw);
    if (row.ma !== undefined) values.push(row.ma);
    if (row.healthy !== undefined) values.push(row.healthy);
    if (row.projection !== undefined) values.push(row.projection);
  }
  if (targetMin !== null) values.push(targetMin);
  if (targetMax !== null) values.push(targetMax);
  if (values.length === 0) return undefined;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const pad = Math.max(1, (max - min) * 0.08);
  return [Math.floor(min - pad), Math.ceil(max + pad)];
}

interface TooltipEntry {
  name?: string | number;
  value?: number | string;
  color?: string;
  dataKey?: string;
}

function ChartTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: TooltipEntry[];
  label?: string;
}) {
  if (!active || !payload || payload.length === 0 || !label) return null;
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs shadow-md">
      <p className="font-semibold text-slate-700">{formatShortDate(label)}</p>
      <ul className="mt-1 space-y-0.5">
        {payload.map((p, i) => {
          if (p.value === undefined || p.value === null) return null;
          const value =
            typeof p.value === 'number'
              ? formatWeight(p.value)
              : String(p.value);
          return (
            <li key={i} className="flex items-center gap-1.5">
              <span
                aria-hidden
                className="inline-block h-2 w-2 rounded-full"
                style={{ background: p.color ?? '#64748b' }}
              />
              <span className="text-slate-500">{p.name}:</span>
              <span className="font-medium text-slate-900">{value}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export default function WeightChart(props: WeightChartProps) {
  const [showBmi, setShowBmi] = useState(false);
  const data = useMemo(() => buildChartData(props), [props]);
  const yDomain = useMemo(
    () => computeYDomain(data, props.targetMinLb, props.targetMaxLb),
    [data, props.targetMinLb, props.targetMaxLb],
  );
  const bmiBands = useMemo(() => {
    if (!showBmi || !props.heightIn || !yDomain) return null;
    return bmiBandsForHeight(props.heightIn, yDomain);
  }, [showBmi, props.heightIn, yDomain]);
  const canShowBmi = props.heightIn !== null && props.heightIn > 0;

  if (props.movingAvg.length === 0) {
    return (
      <section
        aria-label="Weight chart"
        className="flex h-72 items-center justify-center rounded-xl border border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-500 md:h-96"
      >
        <div>
          <p className="font-medium text-slate-600">
            Log your first weight to see the chart
          </p>
          <p className="mt-1 text-xs text-slate-400">
            Add a weight on the Today tab — the smoothed line, healthy-loss
            reference, and projection will appear here.
          </p>
        </div>
      </section>
    );
  }

  const showTargetBand =
    props.targetMinLb !== null && props.targetMaxLb !== null;

  return (
    <section
      aria-label="Weight chart"
      className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm sm:p-4"
    >
      <div className="mb-2 flex items-center justify-end">
        <button
          type="button"
          onClick={() => setShowBmi((v) => !v)}
          disabled={!canShowBmi}
          aria-pressed={showBmi}
          title={
            canShowBmi
              ? 'Toggle BMI category bands'
              : 'Set your height on the Profile tab to enable BMI bands'
          }
          className={
            'inline-flex h-8 items-center rounded-md border px-3 text-xs font-medium transition ' +
            (showBmi
              ? 'border-emerald-600 bg-emerald-50 text-emerald-700'
              : 'border-slate-300 bg-white text-slate-600 hover:bg-slate-50') +
            ' disabled:cursor-not-allowed disabled:opacity-50'
          }
        >
          {showBmi ? 'BMI bands on' : 'Show BMI bands'}
        </button>
      </div>
      <div className="h-72 w-full md:h-96">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart
            data={data}
            margin={{ top: 8, right: 16, bottom: 8, left: 0 }}
          >
            {bmiBands?.map((b, i) => (
              <ReferenceArea
                key={`bmi-${i}`}
                y1={b.y1}
                y2={b.y2}
                fill={b.fill}
                fillOpacity={0.1}
                stroke="none"
                ifOverflow="hidden"
              />
            ))}
            <XAxis
              dataKey="date"
              type="category"
              tickFormatter={formatShortDate}
              tick={{ fontSize: 11, fill: '#64748b' }}
              tickMargin={6}
              minTickGap={24}
              stroke="#cbd5e1"
            />
            <YAxis
              domain={yDomain ?? ['auto', 'auto']}
              tick={{ fontSize: 11, fill: '#64748b' }}
              width={44}
              tickFormatter={(v: number) => `${Math.round(v)}`}
              stroke="#cbd5e1"
            />

            {showTargetBand ? (
              <ReferenceArea
                y1={props.targetMinLb as number}
                y2={props.targetMaxLb as number}
                fill="#10b981"
                fillOpacity={0.12}
                stroke="none"
                ifOverflow="extendDomain"
              />
            ) : null}

            <ReferenceLine
              x={props.todayIso}
              stroke="#cbd5e1"
              strokeWidth={1}
            />

            <Tooltip content={<ChartTooltip />} />
            <Legend
              verticalAlign="top"
              height={28}
              iconSize={10}
              wrapperStyle={{ fontSize: 12 }}
            />

            <Line
              type="monotone"
              dataKey="ma"
              name="Smoothed weight"
              stroke="#059669"
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
              connectNulls
            />
            <Line
              type="linear"
              dataKey="healthy"
              name="Max healthy loss"
              stroke="#94a3b8"
              strokeWidth={1.5}
              strokeDasharray="4 4"
              dot={false}
              isAnimationActive={false}
              connectNulls
            />
            {props.projection ? (
              <Line
                type="linear"
                dataKey="projection"
                name="Projection"
                stroke="#d97706"
                strokeWidth={1.5}
                strokeDasharray="6 4"
                dot={false}
                isAnimationActive={false}
                connectNulls
              />
            ) : null}
            <Scatter
              dataKey="raw"
              name="Logged weight"
              fill="#64748b"
              fillOpacity={0.6}
              shape="circle"
              isAnimationActive={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      {showBmi && canShowBmi ? (
        <ul className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-slate-600">
          <BmiKey color="#0ea5e9" label="Underweight (BMI < 18.5)" />
          <BmiKey color="#10b981" label="Healthy (18.5–25)" />
          <BmiKey color="#f59e0b" label="Overweight (25–30)" />
          <BmiKey color="#e11d48" label="Obese (≥ 30)" />
        </ul>
      ) : null}
    </section>
  );
}

function BmiKey({ color, label }: { color: string; label: string }) {
  return (
    <li className="flex items-center gap-1.5">
      <span
        aria-hidden
        className="inline-block h-2.5 w-3 rounded-sm"
        style={{ background: color, opacity: 0.5 }}
      />
      <span>{label}</span>
    </li>
  );
}
