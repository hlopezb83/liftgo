/**
 * Validación masiva de la cartera contra el SAT (Constancia de Situación
 * Fiscal, vía el PAC). No consume timbre. Sólo Clientes con acceso `full`.
 */
import { useMemo, useState } from "react";
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
import { ROUTES } from "@/routes/routes";
import {
  useSatValidationOverview,
  useValidateCustomersTaxInfo,
  type SatValidationRow,
  type SatValidationStatus,
} from "../hooks/customers/useSatValidation";

const STATUS_LABEL: Record<SatValidationStatus, string> = {
  not_validated: "Sin validar",
  valid: "Coincide con el SAT",
  mismatch: "Diferencias",
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

function countBy(rows: SatValidationRow[], status: SatValidationStatus): number {
  return rows.filter((r) => r.sat_validation_status === status).length;
}

function SatValidationContent() {
  const { data, isLoading, isError } = useSatValidationOverview();
  const validate = useValidateCustomersTaxInfo();
  const [onlyPending, setOnlyPending] = useState(true);
  const rows = useMemo(() => data ?? [], [data]);

  const pending = countBy(rows, "not_validated");

  const run = () => {
    validate.mutate(
      { limit: 40, onlyPending },
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
          subtitle="Compara los datos fiscales de tus clientes con su Constancia de Situación Fiscal. No consume timbres."
          backHref={ROUTES.customers.list}
          backLabel="Volver a clientes"
          actions={
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setOnlyPending((v) => !v)}
              >
                {onlyPending ? "Sólo sin validar" : "Toda la cartera"}
              </Button>
              <Button size="sm" onClick={run} disabled={validate.isPending}>
                {validate.isPending ? "Validando…" : "Validar cartera (40)"}
              </Button>
            </div>
          }
        />

        <div className="grid gap-3 sm:grid-cols-4">
          {(
            [
              ["Total con RFC", rows.length],
              ["Sin validar", pending],
              ["Con diferencias", countBy(rows, "mismatch")],
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
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Cliente</TableHead>
                      <TableHead>RFC</TableHead>
                      <TableHead>Estado</TableHead>
                      <TableHead>Última validación</TableHead>
                      <TableHead>Diferencias</TableHead>
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
                          {(() => {
                            const detalle = r.sat_validation_errors
                              .map((e) => e.message)
                              .filter(Boolean)
                              .join(" · ");
                            if (detalle) return detalle;
                            if (r.sat_validation_status === "mismatch") {
                              return "Sin detalle del SAT. Vuelve a validar para obtener los campos con diferencia.";
                            }
                            return "—";
                          })()}
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
