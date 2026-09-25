/**
 * Validación masiva de la cartera contra el SAT (Constancia de Situación
 * Fiscal, vía el PAC). No consume timbre. Sólo Clientes con acceso `full`.
 */
import { useState } from "react";
import { ROUTES } from "@/app-routes/routes";
import { TablePagination } from "@/components/feedback/TablePagination";
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
  SAT_VALIDATION_PAGE_SIZE,
  type SatValidationRow,
  type SatValidationStatus,
} from "../hooks/customers/useSatValidation";
import { SAT_VALIDATION_ROLES } from "../lib/satAccess";

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

function SatValidationDesktopResults({ rows }: { rows: SatValidationRow[] }) {
  return (
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
          {rows.map((row) => (
            <TableRow key={row.id}>
              <TableCell className="font-medium">{row.razon_social || row.name}</TableCell>
              <TableCell className="font-mono text-xs">{row.rfc}</TableCell>
              <TableCell>
                <Badge variant={STATUS_VARIANT[row.sat_validation_status]}>
                  {STATUS_LABEL[row.sat_validation_status]}
                </Badge>
              </TableCell>
              <TableCell className="text-xs text-muted-foreground">
                {row.sat_validated_at ? formatDateMty(row.sat_validated_at) : "—"}
              </TableCell>
              <TableCell className="text-xs">{validationDetail(row)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
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

function SatValidationMetrics({ data, loading }: {
  data: { total: number; pending: number; mismatch: number; error: number } | undefined;
  loading: boolean;
}) {
  const metrics = [
    ["Total con RFC", data?.total ?? 0],
    ["Sin validar", data?.pending ?? 0],
    ["Con observaciones", data?.mismatch ?? 0],
    ["Con error", data?.error ?? 0],
  ] as const;
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {metrics.map(([label, value]) => (
        <Card key={label}>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">{label}</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold tabular-nums">
            {loading ? "—" : value.toLocaleString("es-MX")}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function SatValidationResults({ rows, total, page, onPageChange, isLoading, isError }: {
  rows: SatValidationRow[];
  total: number;
  page: number;
  onPageChange: (page: number) => void;
  isLoading: boolean;
  isError: boolean;
}) {
  const totalPages = Math.max(1, Math.ceil(total / SAT_VALIDATION_PAGE_SIZE));
  const start = (page - 1) * SAT_VALIDATION_PAGE_SIZE + 1;
  const end = start + rows.length - 1;
  const ready = !isLoading && !isError;
  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Resultado por cliente</CardTitle></CardHeader>
      <CardContent>
        {isLoading && <p className="text-sm text-muted-foreground">Cargando cartera…</p>}
        {isError && <p className="text-sm text-destructive">No se pudo cargar la cartera de clientes.</p>}
        {ready && total === 0 && (
          <p className="text-sm text-muted-foreground">No hay clientes con RFC registrado.</p>
        )}
        {ready && total > 0 && rows.length === 0 && (
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">Esta página ya no tiene clientes.</p>
            <Button variant="outline" size="sm" onClick={() => onPageChange(1)}>
              Volver a la primera página
            </Button>
          </div>
        )}
        {ready && rows.length > 0 && (
          <>
            <p className="mb-4 text-sm text-muted-foreground">
              Mostrando {start.toLocaleString("es-MX")}–{end.toLocaleString("es-MX")} de {total.toLocaleString("es-MX")} clientes
            </p>
            <SatValidationMobileResults rows={rows} />
            <SatValidationDesktopResults rows={rows} />
          </>
        )}
        {ready && total > SAT_VALIDATION_PAGE_SIZE && (
          <TablePagination page={Math.min(page, totalPages)} totalPages={totalPages} onPageChange={onPageChange} />
        )}
      </CardContent>
    </Card>
  );
}

function SatValidationContent() {
  const [page, setPage] = useState(1);
  const [onlyPending, setOnlyPending] = useState(true);
  const { data, isLoading, isError } = useSatValidationOverview(page);
  const validate = useValidateCustomersTaxInfo();
  const rows = data?.rows ?? [];
  const total = data?.total ?? 0;
  const pending = data?.pending ?? 0;
  const batchCount = Math.min(VALIDATION_BATCH_LIMIT, onlyPending ? pending : total);
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

        <SatValidationMetrics data={data} loading={isLoading || isError} />
        <SatValidationResults rows={rows} total={total} page={page} onPageChange={setPage} isLoading={isLoading} isError={isError} />
      </div>
    </PageContainer>
  );
}

export default function CustomersSatValidationPage() {
  return (
    <RoleGuard module="Clientes" minAccess="full" allowedRoles={SAT_VALIDATION_ROLES}>
      <SatValidationContent />
    </RoleGuard>
  );
}
