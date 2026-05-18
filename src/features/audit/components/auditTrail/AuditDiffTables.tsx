import { Table, TableBody, TableHead, TableHeader, TableRow, TableCell } from "@/components/ui/table";
import {
  translateField,
  formatAuditValue,
} from "./auditTrailConstants";
import { visibleFields, visibleSnapshot } from "./auditDiffHelpers";

export function AuditUpdateDiffTable({
  changedFields, oldData, newData,
}: {
  changedFields: string[];
  oldData: Record<string, unknown> | null;
  newData: Record<string, unknown> | null;
}) {
  return (
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
          {visibleFields(changedFields).map((field) => (
            <TableRow key={field}>
              <TableCell className="font-medium text-sm">{translateField(field)}</TableCell>
              <TableCell className="text-sm text-destructive line-through max-w-[220px] truncate">
                {formatAuditValue(field, oldData?.[field])}
              </TableCell>
              <TableCell className="text-sm font-medium text-emerald-600 max-w-[220px] truncate">
                {formatAuditValue(field, newData?.[field])}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

export function AuditSnapshotTable({
  title, data,
}: {
  title: string;
  data: Record<string, unknown> | null;
}) {
  const rows = visibleSnapshot(data);
  return (
    <div>
      <h4 className="text-sm font-semibold mb-2">{title}</h4>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Campo</TableHead>
            <TableHead>Valor</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map(([field, value]) => (
            <TableRow key={field}>
              <TableCell className="font-medium text-sm">{translateField(field)}</TableCell>
              <TableCell className="text-sm max-w-[400px] truncate">
                {formatAuditValue(field, value)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <details className="mt-3">
        <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground">
          Ver JSON completo
        </summary>
        <pre className="bg-muted p-3 rounded-lg text-xs overflow-auto max-h-60 mt-2">
          {JSON.stringify(data, null, 2)}
        </pre>
      </details>
    </div>
  );
}

export { visibleFields };
