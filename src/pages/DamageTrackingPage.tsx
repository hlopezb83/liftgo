import { useDamageRecords } from "@/hooks/useDamageRecords";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TableSkeleton } from "@/components/TableSkeleton";
import { EmptyRow } from "@/components/EmptyRow";
import { StatusBadge } from "@/components/StatusBadge";
import { formatCurrency } from "@/lib/formatCurrency";
import { DamageActions } from "@/components/DamageActions";
import { format } from "date-fns";

export default function DamageTrackingPage() {
  const { data: records, isLoading } = useDamageRecords();

  return (
    <div className="p-6 space-y-6">
      <PageHeader title="Damage Tracking" subtitle="Track damage from inspections through repair to invoicing" />

      <Card>
        <CardContent className="p-0">
          {isLoading ? <TableSkeleton /> : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Forklift</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Est. Cost</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {records && records.length > 0 ? records.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-mono text-sm">{format(new Date(r.created_at), "MMM d, yyyy")}</TableCell>
                    <TableCell className="font-medium">{r.forklifts?.name || "—"}</TableCell>
                    <TableCell>{r.customers?.name || "—"}</TableCell>
                    <TableCell className="max-w-[200px] truncate">{r.description}</TableCell>
                    <TableCell className="font-mono">{formatCurrency(r.estimated_cost)}</TableCell>
                    <TableCell><StatusBadge status={r.status} /></TableCell>
                    <TableCell><DamageActions record={r} /></TableCell>
                  </TableRow>
                )) : (
                  <EmptyRow colSpan={7} message="No damage records yet" />
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
