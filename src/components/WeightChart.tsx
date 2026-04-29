'use client';

import { useMemo } from 'react';
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
import { formatWeight } from '@/lib/units';

export interface WeightChartProps {
  rawWeights: { date: string; weightLb: number }[];
  movingAvg: { date: string; weightLb: number }[];
  healthyLoss: { date: string; weightLb: number }[];
  projection: { date: string; weightLb: number }[] | null;
  targetMinLb: number | null;
  targetMaxLb: number | null;
  todayIso: string;
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
  const data = useMemo(() => buildChartData(props), [props]);
  const yDomain = useMemo(
    () => computeYDomain(data, props.targetMinLb, props.targetMaxLb),
    [data, props.targetMinLb, props.targetMaxLb],
  );

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
      <div className="h-72 w-full md:h-96">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart
            data={data}
            margin={{ top: 8, right: 16, bottom: 8, left: 0 }}
          >
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
    </section>
  );
}
