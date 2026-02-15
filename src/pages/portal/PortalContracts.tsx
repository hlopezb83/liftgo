import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StatusBadge } from "@/components/StatusBadge";
import { useCustomerPortal } from "@/hooks/useCustomerPortal";
import { Skeleton } from "@/components/ui/skeleton";

export default function PortalContracts() {
  const { contracts, isLoading } = useCustomerPortal();

  if (isLoading) return <Skeleton className="h-96" />;

  return (
    <div className="space-y-6 max-w-5xl">
      <h1 className="text-2xl font-bold">My Contracts</h1>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">All Contracts</CardTitle>
        </CardHeader>
        <CardContent>
          {contracts && contracts.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Contract #</TableHead>
                  <TableHead>Equipment</TableHead>
                  <TableHead>Start</TableHead>
                  <TableHead>End</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {contracts.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium">{c.contract_number}</TableCell>
                    <TableCell>{c.forklifts?.name || "—"} — {c.forklifts?.model || ""}</TableCell>
                    <TableCell>{c.start_date || "—"}</TableCell>
                    <TableCell>{c.end_date || "—"}</TableCell>
                    <TableCell><StatusBadge status={c.status} /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-8">No contracts found</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
