import { useMemo } from 'react';
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { formatDateShort, formatMonth, peso } from '../lib/format';

const GREEN = '#00b874';
const BLUE = '#0073ea';

function shortPeso(value) {
  const n = Number(value ?? 0);
  if (Math.abs(n) >= 1_000_000) return `₱${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1_000) return `₱${Math.round(n / 1000)}k`;
  return `₱${n}`;
}

function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="card px-3 py-2 text-sm shadow-pop">
      <p className="mb-1 font-bold">{label}</p>
      {payload.map((entry) => (
        <p key={entry.name} className="flex items-center justify-between gap-4">
          <span className="flex items-center gap-1.5 text-muted">
            <span
              className="inline-block h-2 w-2 rounded-full"
              style={{ background: entry.color }}
            />
            {entry.name}
          </span>
          <span className="tnum font-semibold">{peso(entry.value)}</span>
        </p>
      ))}
    </div>
  );
}

export default function IncomeChart({ data, granularity }) {
  const rows = useMemo(
    () =>
      (data ?? []).map((row) => ({
        label: granularity === 'month' ? formatMonth(row.bucket) : formatDateShort(row.bucket),
        income: Number(row.income ?? 0),
        collected: Number(row.collected ?? 0),
      })),
    [data, granularity]
  );

  const hasValues = useMemo(
    () => rows.some((row) => row.income > 0 || row.collected > 0),
    [rows]
  );

  if (!hasValues) {
    return (
      <div className="grid h-[280px] place-items-center text-center">
        <div>
          <p className="font-semibold">No collections recorded in this window yet</p>
          <p className="text-sm text-muted">Record a payment and it will show up here.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-[280px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
          <CartesianGrid stroke="#eef0f6" vertical={false} />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 11, fill: '#6b6e7e' }}
            tickLine={false}
            axisLine={{ stroke: '#e1e4ed' }}
            interval="preserveStartEnd"
            minTickGap={16}
          />
          <YAxis
            tickFormatter={shortPeso}
            tick={{ fontSize: 11, fill: '#6b6e7e' }}
            tickLine={false}
            axisLine={false}
            width={58}
          />
          <Tooltip content={<ChartTooltip />} cursor={{ fill: 'rgba(0,115,234,0.06)' }} />
          <Legend
            verticalAlign="top"
            align="right"
            height={28}
            iconType="circle"
            iconSize={8}
            wrapperStyle={{ fontSize: 12, fontWeight: 600 }}
          />
          <Bar
            dataKey="income"
            name="Income earned"
            fill={GREEN}
            radius={[4, 4, 0, 0]}
            maxBarSize={30}
          />
          <Line
            dataKey="collected"
            name="Total collected"
            stroke={BLUE}
            strokeWidth={2.5}
            dot={false}
            activeDot={{ r: 4 }}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
