"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatNumber, formatPercent } from "@/lib/format";
import type { FormFieldRow } from "@/lib/interaction-analytics";

// Form Abandonment (Part 5) — for each tagged form field: how many sessions
// entered it, how many filled it, and the abandonment rate. The stacked bar
// reads as a funnel through the form (most-entered field first): the filled
// portion sits below the abandoned portion so the drop-off is visible per field.

const FILLED = "#34d399"; // success
const ABANDONED = "#f87171"; // danger

export function FormAbandonment({ rows }: { rows: FormFieldRow[] }) {
  if (rows.length === 0) {
    return (
      <div className="px-4 py-8 text-center text-sm text-ink-tertiary">
        No tagged form activity in this range yet. Add{" "}
        <code className="text-ink-secondary">data-ht-form-field=&quot;…&quot;</code> to your
        booking form inputs (e.g. date picker, name, email) to see where visitors
        drop off.
      </div>
    );
  }

  const data = rows.map((r) => ({
    field: r.field,
    filled: r.filledSessions,
    abandoned: r.abandonedSessions,
    focused: r.focusedSessions,
    rate: r.abandonmentRate,
  }));

  return (
    <div className="space-y-4">
      <div className="h-64 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" vertical={false} />
            <XAxis
              dataKey="field"
              tick={{ fontSize: 12, fill: "#9ca3af" }}
              tickLine={false}
              axisLine={{ stroke: "#1f2937" }}
              interval={0}
            />
            <YAxis
              allowDecimals={false}
              tick={{ fontSize: 12, fill: "#9ca3af" }}
              tickLine={false}
              axisLine={false}
              width={40}
            />
            <Tooltip
              cursor={{ fill: "#ffffff0a" }}
              formatter={(value, name) =>
                [formatNumber(Number(value) || 0), name === "filled" ? "Filled" : "Abandoned"] as [
                  string,
                  string,
                ]
              }
              contentStyle={{
                borderRadius: 8,
                border: "1px solid #374151",
                backgroundColor: "#1f2937",
                color: "#f9fafb",
                fontSize: 12,
              }}
            />
            <Bar dataKey="filled" stackId="a" fill={FILLED} radius={[0, 0, 0, 0]}>
              {data.map((d) => (
                <Cell key={`f-${d.field}`} />
              ))}
            </Bar>
            <Bar dataKey="abandoned" stackId="a" fill={ABANDONED} radius={[3, 3, 0, 0]}>
              {data.map((d) => (
                <Cell key={`a-${d.field}`} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-ink-tertiary">
              <th className="px-3 py-2 font-medium">Field</th>
              <th className="px-3 py-2 text-right font-medium">Focused</th>
              <th className="px-3 py-2 text-right font-medium">Filled</th>
              <th className="px-3 py-2 text-right font-medium">Abandoned</th>
              <th className="px-3 py-2 text-right font-medium">Abandonment rate</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.field} className="border-b border-line/60 last:border-0">
                <td className="px-3 py-2">
                  <code className="rounded bg-card px-1.5 py-0.5 text-xs text-ink-secondary ring-1 ring-line">
                    {r.field}
                  </code>
                </td>
                <td className="px-3 py-2 text-right tabular-nums">{formatNumber(r.focusedSessions)}</td>
                <td className="px-3 py-2 text-right tabular-nums text-success">
                  {formatNumber(r.filledSessions)}
                </td>
                <td className="px-3 py-2 text-right tabular-nums text-danger">
                  {formatNumber(r.abandonedSessions)}
                </td>
                <td className="px-3 py-2 text-right tabular-nums font-semibold">
                  {r.abandonmentRate == null ? "—" : formatPercent(r.abandonmentRate)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center gap-4 text-[11px] text-ink-tertiary">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: FILLED }} /> Filled
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: ABANDONED }} /> Abandoned
        </span>
      </div>
    </div>
  );
}
