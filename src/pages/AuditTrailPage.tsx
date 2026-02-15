import { useState } from "react";
import { useAuditLogs } from "@/hooks/useAuditLogs";
import { usePagination } from "@/hooks/usePagination";
import { TablePagination } from "@/components/TablePagination";
import { PageHeader } from "@/components/PageHeader";
import { TableSkeleton } from "@/components/TableSkeleton";
import { EmptyRow } from "@/components/EmptyRow";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Search, ArrowUpCircle, PlusCircle, Trash2, Clock } from "lucide-react";
import type { AuditLog } from "@/hooks/useAuditLogs";

const TABLES = [
  { value: "all", label: "All Tables" },
  { value: "bookings", label: "Bookings" },
  { value: "invoices", label: "Invoices" },
  { value: "forklifts", label: "Forklifts" },
  { value: "customers", label: "Customers" },
  { value: "contracts", label: "Contracts" },
  { value: "payments", label: "Payments" },
  { value: "deliveries", label: "Deliveries" },
  { value: "maintenance_logs", label: "Maintenance" },
  { value: "damage_records", label: "Damage Records" },
  { value: "quotes", label: "Quotes" },
  { value: "return_inspections", label: "Return Inspections" },
];

const actionIcon = (action: string) => {
  switch (action) {
    case "INSERT": return <PlusCircle className="h-4 w-4 text-green-600" />;
    case "UPDATE": return <ArrowUpCircle className="h-4 w-4 text-blue-600" />;
    case "DELETE": return <Trash2 className="h-4 w-4 text-destructive" />;
    default: return <Clock className="h-4 w-4 text-muted-foreground" />;
  }
};

const actionBadgeVariant = (action: string) => {
  switch (action) {
    case "INSERT": return "default" as const;
    case "UPDATE": return "secondary" as const;
    case "DELETE": return "destructive" as const;
    default: return "outline" as const;
  }
};

function formatTimestamp(ts: string) {
  const d = new Date(ts);
  return d.toLocaleDateString() + " " + d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function getRecordLabel(log: AuditLog): string {
  const data = log.new_data || log.old_data;
  if (!data) return log.record_id.slice(0, 8);
  return data.name || data.contract_number || data.invoice_number || data.quote_number || data.description?.slice(0, 30) || log.record_id.slice(0, 8);
}

export default function AuditTrailPage() {
  const [tableFilter, setTableFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [selectedLog, setSelectedLog] = useState<AuditLog | null>(null);

  const { data: logs, isLoading } = useAuditLogs(
    tableFilter !== "all" ? { table_name: tableFilter } : undefined
  );

  const filtered = logs?.filter((log) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      log.table_name.toLowerCase().includes(q) ||
      log.action.toLowerCase().includes(q) ||
      (log.user_email || "").toLowerCase().includes(q) ||
      getRecordLabel(log).toLowerCase().includes(q)
    );
  });

  const { page, setPage, totalPages, paginatedItems } = usePagination(filtered);

  if (isLoading) return <div className="p-6"><TableSkeleton rows={8} /></div>;

  return (
    <div className="p-6 space-y-6">
      <PageHeader title="Audit Trail" subtitle="Track all changes across the system" />

      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <Select value={tableFilter} onValueChange={setTableFilter}>
          <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
          <SelectContent>
            {TABLES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <div className="relative w-full sm:w-64">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search audit logs…" className="pl-8" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10" />
                <TableHead>Action</TableHead>
                <TableHead>Table</TableHead>
                <TableHead>Record</TableHead>
                <TableHead>Changed Fields</TableHead>
                <TableHead>User</TableHead>
                <TableHead>When</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paginatedItems.length > 0 ? (
                paginatedItems.map((log) => (
                  <TableRow
                    key={log.id}
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => setSelectedLog(log)}
                  >
                    <TableCell>{actionIcon(log.action)}</TableCell>
                    <TableCell>
                      <Badge variant={actionBadgeVariant(log.action)}>{log.action}</Badge>
                    </TableCell>
                    <TableCell className="capitalize text-sm">{log.table_name.replace(/_/g, " ")}</TableCell>
                    <TableCell className="text-sm font-medium max-w-[160px] truncate">{getRecordLabel(log)}</TableCell>
                    <TableCell className="text-sm text-muted-foreground max-w-[200px] truncate">
                      {log.changed_fields?.join(", ") || "—"}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{log.user_email || "System"}</TableCell>
                    <TableCell className="text-sm text-muted-foreground whitespace-nowrap">{formatTimestamp(log.created_at)}</TableCell>
                  </TableRow>
                ))
              ) : (
                <EmptyRow colSpan={7} message="No audit logs found" />
              )}
            </TableBody>
          </Table>
          <TablePagination page={page} totalPages={totalPages} onPageChange={setPage} />
        </CardContent>
      </Card>

      {/* Detail dialog */}
      <Dialog open={!!selectedLog} onOpenChange={() => setSelectedLog(null)}>
        <DialogContent className="sm:max-w-2xl max-h-[80vh] overflow-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {selectedLog && actionIcon(selectedLog.action)}
              {selectedLog?.action} — {selectedLog?.table_name.replace(/_/g, " ")}
            </DialogTitle>
          </DialogHeader>
          {selectedLog && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div><span className="text-muted-foreground block">Record ID</span><span className="font-mono text-xs">{selectedLog.record_id}</span></div>
                <div><span className="text-muted-foreground block">User</span>{selectedLog.user_email || "System"}</div>
                <div><span className="text-muted-foreground block">Timestamp</span>{formatTimestamp(selectedLog.created_at)}</div>
                {selectedLog.changed_fields && (
                  <div><span className="text-muted-foreground block">Changed Fields</span>{selectedLog.changed_fields.join(", ")}</div>
                )}
              </div>

              {selectedLog.action === "UPDATE" && selectedLog.changed_fields && selectedLog.old_data && selectedLog.new_data && (
                <div>
                  <h4 className="text-sm font-semibold mb-2">Field Changes</h4>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Field</TableHead>
                        <TableHead>Old Value</TableHead>
                        <TableHead>New Value</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {selectedLog.changed_fields.map((field) => (
                        <TableRow key={field}>
                          <TableCell className="font-medium text-sm">{field}</TableCell>
                          <TableCell className="text-sm text-muted-foreground font-mono max-w-[200px] truncate">
                            {JSON.stringify(selectedLog.old_data?.[field]) ?? "—"}
                          </TableCell>
                          <TableCell className="text-sm font-mono max-w-[200px] truncate">
                            {JSON.stringify(selectedLog.new_data?.[field]) ?? "—"}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}

              {selectedLog.action === "INSERT" && selectedLog.new_data && (
                <div>
                  <h4 className="text-sm font-semibold mb-2">Created Data</h4>
                  <pre className="bg-muted p-3 rounded-lg text-xs overflow-auto max-h-60">
                    {JSON.stringify(selectedLog.new_data, null, 2)}
                  </pre>
                </div>
              )}

              {selectedLog.action === "DELETE" && selectedLog.old_data && (
                <div>
                  <h4 className="text-sm font-semibold mb-2">Deleted Data</h4>
                  <pre className="bg-muted p-3 rounded-lg text-xs overflow-auto max-h-60">
                    {JSON.stringify(selectedLog.old_data, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
