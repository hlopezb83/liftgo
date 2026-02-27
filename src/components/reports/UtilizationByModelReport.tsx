import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { exportToCsv } from "@/lib/exportCsv";
import { differenceInDays, parseISO, max, min } from "date-fns";
import { Download } from "lucide-react";
import type { Tables } from "@/integrations/supabase/types";
import type { BookingWithForklift } from "@/hooks/useBookings";

interface Props {
  forklifts: Tables<"forklifts">[];
  bookings: BookingWithForklift[];
  startDate: Date;
  endDate: Date;
}

interface ModelRow {
  model: string;
  units: number;
  available: number;
  rented: number;
  bookedDays: number;
  totalDays: number;
  utilization: number;
}

const EXCLUDED_STATUSES = ["sold", "retired", "vendido", "retirado"];

function getUtilColor(pct: number) {
  if (pct > 75) return "hsl(142, 71%, 45%)";
  if (pct >= 40) return "hsl(45, 93%, 47%)";
  return "hsl(0, 84%, 60%)";
}

export function UtilizationByModelReport({ forklifts, bookings, startDate, endDate }: Props) {
  const data = useMemo<ModelRow[]>(() => {
    const rangeDays = Math.max(differenceInDays(endDate, startDate), 1);

    // Filter active forklifts
    const active = forklifts.filter(
      (f) => !EXCLUDED_STATUSES.includes(f.status?.toLowerCase() ?? "")
    );

    // Group by model key
    const groups = new Map<string, Tables<"forklifts">[]>();
    for (const f of active) {
      const key = f.manufacturer ? `${f.manufacturer} ${f.model}` : f.name;
      const arr = groups.get(key) ?? [];
      arr.push(f);
      groups.set(key, arr);
    }

    return Array.from(groups.entries())
      .map(([model, units]) => {
        const ids = new Set(units.map((u) => u.id));
        const available = units.filter((u) => u.status === "available").length;
        const rented = units.filter((u) => u.status === "rented").length;

        // Calculate booked days within range
        const relevantBookings = bookings.filter(
          (b) => ids.has(b.forklift_id) && b.status !== "cancelled"
        );

        let bookedDays = 0;
        for (const b of relevantBookings) {
          const bStart = max([parseISO(b.start_date), startDate]);
          const bEnd = min([parseISO(b.end_date), endDate]);
          const overlap = differenceInDays(bEnd, bStart) + 1;
          if (overlap > 0) bookedDays += overlap;
        }

        const totalDays = units.length * rangeDays;
        const utilization = totalDays > 0 ? Math.min(Math.round((bookedDays / totalDays) * 100), 100) : 0;

        return { model, units: units.length, available, rented, bookedDays, totalDays, utilization };
      })
      .sort((a, b) => b.utilization - a.utilization);
  }, [forklifts, bookings, startDate, endDate]);

  const handleExport = () => {
    exportToCsv(
      "reporte-utilizacion-modelo.csv",
      data.map((r) => ({
        Modelo: r.model,
        Unidades: r.units,
        Disponibles: r.available,
        Rentados: r.rented,
        "Días Reservados": r.bookedDays,
        "Días Totales": r.totalDays,
        "Utilización %": r.utilization,
      }))
    );
  };

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Utilización por Modelo</CardTitle>
          <Button variant="outline" size="sm" onClick={handleExport}>
            <Download className="h-4 w-4 mr-1" />Exportar CSV
          </Button>
        </CardHeader>
        <CardContent>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data} layout="vertical" margin={{ left: 20 }}>
                <XAxis type="number" unit="%" domain={[0, 100]} />
                <YAxis type="category" dataKey="model" width={160} tick={{ fontSize: 11 }} />
                <Tooltip formatter={(val: number) => `${val}%`} />
                <Bar dataKey="utilization" radius={[0, 4, 4, 0]}>
                  {data.map((entry) => (
                    <Cell key={entry.model} fill={getUtilColor(entry.utilization)} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Modelo</TableHead>
                <TableHead className="text-right">Unidades</TableHead>
                <TableHead className="text-right">Disponibles</TableHead>
                <TableHead className="text-right">Rentados</TableHead>
                <TableHead className="text-right">Días Reservados</TableHead>
                <TableHead className="text-right">Días Totales</TableHead>
                <TableHead className="text-right">Utilización</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((r) => (
                <TableRow key={r.model}>
                  <TableCell className="font-medium">{r.model}</TableCell>
                  <TableCell className="text-right">{r.units}</TableCell>
                  <TableCell className="text-right">{r.available}</TableCell>
                  <TableCell className="text-right">{r.rented}</TableCell>
                  <TableCell className="text-right">{r.bookedDays}</TableCell>
                  <TableCell className="text-right">{r.totalDays}</TableCell>
                  <TableCell className="text-right font-mono" style={{ color: getUtilColor(r.utilization) }}>
                    {r.utilization}%
                  </TableCell>
                </TableRow>
              ))}
              {data.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                    No hay equipos activos para mostrar
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </>
  );
}
