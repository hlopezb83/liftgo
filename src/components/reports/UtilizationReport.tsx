import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { exportToCsv } from "@/lib/exportCsv";
import { differenceInDays, parseISO, isWithinInterval } from "date-fns";
import { Download } from "lucide-react";
import type { Tables } from "@/integrations/supabase/types";
import type { BookingWithForklift } from "@/hooks/useBookings";

interface Props {
  forklifts: Tables<"forklifts">[];
  bookings: BookingWithForklift[];
  startDate: Date;
  endDate: Date;
}

export function UtilizationReport({ forklifts, bookings, startDate, endDate }: Props) {
  const data = useMemo(() => {
    const totalDays = Math.max(differenceInDays(endDate, startDate), 1);
    return forklifts.map((fl) => {
      const flBookings = bookings.filter((b) => b.forklift_id === fl.id && 
        isWithinInterval(parseISO(b.start_date), { start: startDate, end: endDate }));
      const bookedDays = flBookings.reduce((sum, b) => sum + differenceInDays(parseISO(b.end_date), parseISO(b.start_date)) + 1, 0);
      const utilization = Math.min(Math.round((bookedDays / totalDays) * 100), 100);
      return { name: fl.name, bookedDays, totalDays, utilization };
    });
  }, [forklifts, bookings, startDate, endDate]);

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Fleet Utilization</CardTitle>
          <Button variant="outline" size="sm" onClick={() => exportToCsv("utilization-report.csv", data)}>
            <Download className="h-4 w-4 mr-1" />Export CSV
          </Button>
        </CardHeader>
        <CardContent>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data}>
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis unit="%" />
                <Tooltip formatter={(val: number) => `${val}%`} />
                <Bar dataKey="utilization" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
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
                <TableHead>Forklift</TableHead>
                <TableHead className="text-right">Booked Days</TableHead>
                <TableHead className="text-right">Total Days</TableHead>
                <TableHead className="text-right">Utilization</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((r) => (
                <TableRow key={r.name}>
                  <TableCell className="font-medium">{r.name}</TableCell>
                  <TableCell className="text-right">{r.bookedDays}</TableCell>
                  <TableCell className="text-right">{r.totalDays}</TableCell>
                  <TableCell className="text-right font-mono">{r.utilization}%</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </>
  );
}
