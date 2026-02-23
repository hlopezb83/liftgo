import { useState } from "react";
import { useAuditLogs } from "@/hooks/useAuditLogs";
import { usePagination } from "@/hooks/usePagination";
import { ListPageLayout } from "@/components/ListPageLayout";
import { SearchBar } from "@/components/SearchBar";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TableRow, TableCell, TableHead } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableHeader } from "@/components/ui/table";
import { ArrowUpCircle, PlusCircle, Trash2, Clock } from "lucide-react";
import type { AuditLog } from "@/hooks/useAuditLogs";

const TABLES = [
  { value: "all", label: "Todas las Tablas" },
  { value: "bookings", label: "Reservas" },
  { value: "invoices", label: "Facturas" },
  { value: "forklifts", label: "Montacargas" },
  { value: "customers", label: "Clientes" },
  { value: "contracts", label: "Contratos" },
  { value: "payments", label: "Pagos" },
  { value: "deliveries", label: "Entregas" },
  { value: "maintenance_logs", label: "Mantenimiento" },
  { value: "damage_records", label: "Registros de Daños" },
  { value: "quotes", label: "Cotizaciones" },
  { value: "return_inspections", label: "Inspecciones de Devolución" },
];

const ACTION_LABELS: Record<string, string> = {
  INSERT: "Creación",
  UPDATE: "Actualización",
  DELETE: "Eliminación",
};

const TABLE_LABELS: Record<string, string> = Object.fromEntries(
  TABLES.filter((t) => t.value !== "all").map((t) => [t.value, t.label])
);

const FIELD_LABELS: Record<string, string> = {
  status: "Estado", start_date: "Fecha Inicio", end_date: "Fecha Fin", customer_name: "Nombre del Cliente",
  customer_id: "Cliente", customer_contact: "Contacto del Cliente", forklift_id: "Montacargas",
  booking_id: "Reserva", contract_number: "Número de Contrato", invoice_number: "Número de Factura",
  quote_number: "Número de Cotización", total: "Total", subtotal: "Subtotal", tax_amount: "Impuesto",
  tax_rate: "Tasa de Impuesto", description: "Descripción", notes: "Notas", daily_rate: "Tarifa Diaria",
  weekly_rate: "Tarifa Semanal", monthly_rate: "Tarifa Mensual", created_at: "Fecha de Creación",
  updated_at: "Fecha de Actualización", due_date: "Fecha de Vencimiento", paid_at: "Fecha de Pago",
  issued_at: "Fecha de Emisión", scheduled_date: "Fecha Programada", performed_at: "Fecha de Realización",
  name: "Nombre", model: "Modelo", manufacturer: "Fabricante", serial_number: "Número de Serie",
  fuel_type: "Tipo de Combustible", capacity_kg: "Capacidad (kg)", mast_height_m: "Altura de Mástil (m)",
  year: "Año", address: "Dirección", phone: "Teléfono", email: "Correo Electrónico", company: "Empresa",
  rfc: "RFC", driver_name: "Nombre del Operador", driver_phone: "Teléfono del Operador",
  service_type: "Tipo de Servicio", performed_by: "Realizado por", cost: "Costo",
  estimated_cost: "Costo Estimado", actual_cost: "Costo Real", condition: "Condición",
  fuel_level: "Nivel de Combustible", hours_used: "Horas Usadas", damage_notes: "Notas de Daño",
  damage_cost: "Costo de Daño", recurring_billing: "Facturación Recurrente", deposit_amount: "Monto de Depósito",
  terms_text: "Términos", signed_at: "Fecha de Firma", signed_by: "Firmado por", amount: "Monto",
  payment_method: "Método de Pago", payment_date: "Fecha de Pago", reference_number: "Número de Referencia",
  type: "Tipo", completed_at: "Fecha de Completado", image_url: "Imagen", return_status: "Estado de Devolución",
  last_billed_date: "Última Fecha de Facturación", line_items: "Partidas", valid_until: "Válido Hasta",
};

const translateField = (field: string) => FIELD_LABELS[field] || field.replace(/_/g, " ");
const translateAction = (action: string) => ACTION_LABELS[action] || action;
const translateTable = (table: string) => TABLE_LABELS[table] || table.replace(/_/g, " ");

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

  return (
    <>
      <ListPageLayout
        title="Bitácora de Cambios"
        subtitle="Rastrea todos los cambios en el sistema"
        filters={
          <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
            <Select value={tableFilter} onValueChange={setTableFilter}>
              <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
              <SelectContent>
                {TABLES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
              </SelectContent>
            </Select>
            <SearchBar value={search} onChange={setSearch} placeholder="Buscar en bitácora…" className="w-full sm:w-64" />
          </div>
        }
        isLoading={isLoading}
        items={paginatedItems}
        page={page}
        totalPages={totalPages}
        onPageChange={setPage}
        emptyMessage="No se encontraron registros"
        tableHeader={
          <TableRow>
            <TableHead className="w-10" />
            <TableHead>Acción</TableHead>
            <TableHead>Tabla</TableHead>
            <TableHead>Registro</TableHead>
            <TableHead>Campos Modificados</TableHead>
            <TableHead>Usuario</TableHead>
            <TableHead>Cuándo</TableHead>
          </TableRow>
        }
        renderRow={(log) => (
          <TableRow key={log.id} className="cursor-pointer hover:bg-muted/50" onClick={() => setSelectedLog(log)}>
            <TableCell>{actionIcon(log.action)}</TableCell>
            <TableCell><Badge variant={actionBadgeVariant(log.action)}>{translateAction(log.action)}</Badge></TableCell>
            <TableCell className="text-sm">{translateTable(log.table_name)}</TableCell>
            <TableCell className="text-sm font-medium max-w-[160px] truncate">{getRecordLabel(log)}</TableCell>
            <TableCell className="text-sm text-muted-foreground max-w-[200px] truncate">{log.changed_fields?.map(translateField).join(", ") || "—"}</TableCell>
            <TableCell className="text-sm text-muted-foreground">{log.user_email || "Sistema"}</TableCell>
            <TableCell className="text-sm text-muted-foreground whitespace-nowrap">{formatTimestamp(log.created_at)}</TableCell>
          </TableRow>
        )}
      />

      <Dialog open={!!selectedLog} onOpenChange={() => setSelectedLog(null)}>
        <DialogContent className="sm:max-w-2xl max-h-[80vh] overflow-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {selectedLog && actionIcon(selectedLog.action)}
              {selectedLog && translateAction(selectedLog.action)} — {selectedLog && translateTable(selectedLog.table_name)}
            </DialogTitle>
          </DialogHeader>
          {selectedLog && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div><span className="text-muted-foreground block">ID del Registro</span><span className="font-mono text-xs">{selectedLog.record_id}</span></div>
                <div><span className="text-muted-foreground block">Usuario</span>{selectedLog.user_email || "Sistema"}</div>
                <div><span className="text-muted-foreground block">Fecha y Hora</span>{formatTimestamp(selectedLog.created_at)}</div>
                {selectedLog.changed_fields && (
                  <div><span className="text-muted-foreground block">Campos Modificados</span>{selectedLog.changed_fields.map(translateField).join(", ")}</div>
                )}
              </div>

              {selectedLog.action === "UPDATE" && selectedLog.changed_fields && selectedLog.old_data && selectedLog.new_data && (
                <div>
                  <h4 className="text-sm font-semibold mb-2">Cambios en Campos</h4>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Campo</TableHead>
                        <TableHead>Valor Anterior</TableHead>
                        <TableHead>Valor Nuevo</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {selectedLog.changed_fields.map((field) => (
                        <TableRow key={field}>
                          <TableCell className="font-medium text-sm">{translateField(field)}</TableCell>
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
                  <h4 className="text-sm font-semibold mb-2">Datos Creados</h4>
                  <pre className="bg-muted p-3 rounded-lg text-xs overflow-auto max-h-60">
                    {JSON.stringify(selectedLog.new_data, null, 2)}
                  </pre>
                </div>
              )}

              {selectedLog.action === "DELETE" && selectedLog.old_data && (
                <div>
                  <h4 className="text-sm font-semibold mb-2">Datos Eliminados</h4>
                  <pre className="bg-muted p-3 rounded-lg text-xs overflow-auto max-h-60">
                    {JSON.stringify(selectedLog.old_data, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
