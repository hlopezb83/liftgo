import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { getUtilColor, type ModelRow } from "./utilizationHelpers";

export function UtilizationChart({ chartData }: { chartData: ModelRow[] }) {
  return (
    <div className="h-72">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={chartData} layout="vertical" margin={{ left: 20 }}>
          <XAxis type="number" unit="%" domain={[0, 100]} />
          <YAxis type="category" dataKey="model" width={160} tick={{ fontSize: 11 }} />
          <Tooltip formatter={(val: number) => `${val}%`} />
          <Bar dataKey="utilization" radius={[0, 4, 4, 0]}>
            {chartData.map((entry) => (
              <Cell key={entry.model} fill={getUtilColor(entry.utilization)} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
