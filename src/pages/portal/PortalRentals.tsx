import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StatusBadge } from "@/components/StatusBadge";
import { usePortalBookings } from "@/hooks/useCustomerPortal";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDateDisplay } from "@/lib/utils";

export default function PortalRentals() {
  const { data: bookings, isLoading } = usePortalBookings();

  if (isLoading) return <Skeleton className="h-96" />;

  return (
    <div className="space-y-6 max-w-5xl">
      <h1 className="text-2xl font-bold">Mis Rentas</h1>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Historial de Reservas</CardTitle>
        </CardHeader>
        <CardContent>
          {bookings && bookings.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Equipo</TableHead>
                  <TableHead>Fecha Inicio</TableHead>
                  <TableHead>Fecha Fin</TableHead>
                  <TableHead>Estado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {bookings.map((b) => (
                  <TableRow key={b.id}>
                    <TableCell className="font-medium">
                      {b.forklifts?.name || "—"} — {b.forklifts?.model || ""}
                    </TableCell>
                    <TableCell>{formatDateDisplay(b.start_date)}</TableCell>
                    <TableCell>{formatDateDisplay(b.end_date)}</TableCell>
                    <TableCell><StatusBadge status={b.status} /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-8">No se encontraron rentas</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
