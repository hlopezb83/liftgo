/**
 * Validación masiva de la cartera contra el SAT (Constancia de Situación
 * Fiscal, vía el PAC). No consume timbre. Sólo Clientes con acceso `full`.
 */
import { useMemo, useState } from "react";
import { ROUTES } from "@/app-routes/routes";
import { PageContainer } from "@/components/layout/PageContainer";
import { PageHeader } from "@/components/layout/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { RoleGuard } from "@/layouts/RoleGuard";
import { formatDateMty } from "@/lib/format/dateFormats";
import { notifySuccess } from "@/lib/ui/appFeedback";
import {
  useSatValidationOverview,
  useValidateCustomersTaxInfo,
  type SatValidationRow,
  type SatValidationStatus,
} from "../hooks/customers/useSatValidation";

const STATUS_LABEL: Record<SatValidationStatus, string> = {
  not_validated: "Sin validar",
  valid: "Sin observaciones",
  mismatch: "Con observaciones (EFOS 69-B)",
  error: "Error / datos faltantes",
};

const STATUS_VARIANT: Record<
  SatValidationStatus,
  "default" | "secondary" | "destructive" | "outline"
> = {
  not_validated: "outline",
  valid: "default",
  mismatch: "destructive",
  error: "secondary",
};

const VALIDATION_BATCH_LIMIT = 40;

function countBy(rows: SatValidationRow[], status: SatValidationStatus): number {
  return rows.filter((r) => r.sat_validation_status === status).length;
}

function validationDetail(row: SatValidationRow): string {
  const detail = row.sat_validation_errors.map((error) => error.message).filter(Boolean).join(" · ");
  if (detail) return detail;
  return row.sat_validation_status === "mismatch"
    ? "Sin detalle del SAT. Vuelve a validar para obtener el motivo."
    : "—";
}

function SatValidationMobileResults({ rows }: { rows: SatValidationRow[] }) {
  return (
    <div className="space-y-3 md:hidden">
      {rows.map((row) => {
        const name = row.razon_social || row.name;
        const detail = validationDetail(row);
        return (
          <article key={row.id} aria-label={`Cliente ${name}`} className="space-y-3 rounded-lg border p-4">
            <div className="min-w-0">
              <h3 className="break-words text-sm font-medium">{name}</h3>
              <p className="mt-1 font-mono text-xs text-muted-foreground">{row.rfc}</p>
            </div>
            <Badge variant={STATUS_VARIANT[row.sat_validation_status]} className="max-w-full whitespace-normal text-left">
              {STATUS_LABEL[row.sat_validation_status]}
            </Badge>
            <dl className="space-y-2 text-xs">
              <div>
                <dt className="text-muted-foreground">Última validación</dt>
                <dd>{row.sat_validated_at ? formatDateMty(row.sat_validated_at) : "—"}</dd>
              </div>
              {detail !== "—" && (
                <div>
                  <dt className="text-muted-foreground">Detalle</dt>
                  <dd className="break-words">{detail}</dd>
                </div>
              )}
            </dl>
          </article>
        );
      })}
    </div>
  );
}

interface SatValidationActionsProps {
  onlyPending: boolean;
  setOnlyPending: (value: boolean) => void;
  batchCount: number;
  canRun: boolean;
  isPending: boolean;
  onRun: () => void;
}

function SatValidationActions({ onlyPending, setOnlyPending, batchCount, canRun, isPending, onRun }: SatValidationActionsProps) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div role="group" aria-label="Clientes para validar" className="inline-flex rounded-md border p-0.5">
        <Button variant={onlyPending ? "secondary" : "ghost"} size="sm" aria-pressed={onlyPending} onClick={() => setOnlyPending(true)}>
          Sólo sin validar
        </Button>
        <Button variant={onlyPending ? "ghost" : "secondary"} size="sm" aria-pressed={!onlyPending} onClick={() => setOnlyPending(false)}>
          Toda la cartera
        </Button>
      </div>
      <Button size="sm" onClick={onRun} disabled={!canRun}>
        {isPending ? "Validando…" : `Validar ${onlyPending ? "pendientes" : "cartera"} (${batchCount})`}
      </Button>
    </div>
  );
}

function SatValidationContent() {
  const { data, isLoading, isError } = useSatValidationOverview();
  const validate = useValidateCustomersTaxInfo();
  const [onlyPending, setOnlyPending] = useState(true);
  const rows = useMemo(() => data ?? [], [data]);

  const pending = countBy(rows, "not_validated");
  const batchCount = Math.min(VALIDATION_BATCH_LIMIT, onlyPending ? pending : rows.length);
  const canRun = !isLoading && !isError && !validate.isPending && batchCount > 0;

  const run = () => {
    if (!canRun) return;
    validate.mutate(
      { limit: batchCount, onlyPending },
      {
        onSuccess: (summary) => {
          notifySuccess(
            `Validados ${summary.processed} clientes: ${summary.valid} sin diferencias, ` +
              `${summary.mismatch} con diferencias, ${summary.error} con error. ` +
              `Quedan ${summary.remaining} sin validar.`,
          );
        },
      },
    );
  };

  return (
    <PageContainer>
      <div className="space-y-4">
        <PageHeader
          title="Validación fiscal contra el SAT"
          subtitle="Consulta la lista EFOS (art. 69-B) y detecta datos fiscales incompletos. No consume timbres."
          backHref={ROUTES.customers.list}
          backLabel="Volver a clientes"
          actions={<SatValidationActions onlyPending={onlyPending} setOnlyPending={setOnlyPending} batchCount={batchCount} canRun={canRun} isPending={validate.isPending} onRun={run} />}
        />

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {(
            [
              ["Total con RFC", rows.length],
              ["Sin validar", pending],
              ["Con observaciones", countBy(rows, "mismatch")],
              ["Con error", countBy(rows, "error")],
            ] as const
          ).map(([label, value]) => (
            <Card key={label}>
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-medium text-muted-foreground">
                  {label}
                </CardTitle>
              </CardHeader>
              <CardContent className="text-2xl font-semibold">{value}</CardContent>
            </Card>
          ))}
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Resultado por cliente</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading && (
              <p className="text-sm text-muted-foreground">Cargando cartera…</p>
            )}
            {isError && (
              <p className="text-sm text-destructive">
                No se pudo cargar la cartera de clientes.
              </p>
            )}
            {!isLoading && !isError && rows.length === 0 && (
              <p className="text-sm text-muted-foreground">
                No hay clientes con RFC registrado.
              </p>
            )}
            {rows.length > 0 && (
              <SatValidationMobileResults rows={rows} />
            )}
            {rows.length > 0 && (
              <div className="hidden overflow-x-auto md:block">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Cliente</TableHead>
                      <TableHead>RFC</TableHead>
                      <TableHead>Estado</TableHead>
                      <TableHead>Última validación</TableHead>
                      <TableHead>Detalle</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((r) => (
                      <TableRow key={r.id}>
                        <TableCell className="font-medium">
                          {r.razon_social || r.name}
                        </TableCell>
                        <TableCell className="font-mono text-xs">{r.rfc}</TableCell>
                        <TableCell>
                          <Badge variant={STATUS_VARIANT[r.sat_validation_status]}>
                            {STATUS_LABEL[r.sat_validation_status]}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {r.sat_validated_at ? formatDateMty(r.sat_validated_at) : "—"}
                        </TableCell>
                        <TableCell className="text-xs">
                          {validationDetail(r)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </PageContainer>
  );
}

export default function CustomersSatValidationPage() {
  return (
    <RoleGuard module="Clientes" minAccess="full">
      <SatValidationContent />
    </RoleGuard>
  );
}
