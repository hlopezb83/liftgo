import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { INTEGRATION_STATUS_LABELS, type IntegrationRow } from "@/lib/platformHealth.types";
import { healthDate } from "../hooks/usePlatformHealth";

function checkLabel(check: IntegrationRow["lastCheck"], observedAt: string) {
  if (!check) return "Sin comprobación vigente";
  if (check.status === "pending" && Date.parse(observedAt) - Date.parse(check.startedAt) > 60000) return "Comprobación interrumpida";
  return INTEGRATION_STATUS_LABELS[check.status];
}
function responseLabel(check: IntegrationRow["lastCheck"]) {
  const http = check?.httpStatus ? `HTTP ${check.httpStatus}` : "Sin respuesta registrada";
  return check?.latencyMs != null ? `${http} · ${check.latencyMs} ms` : http;
}
export function PlatformIntegrationCard({ row, observedAt, canCheck, checking, disabled, onCheck }: {
  row: IntegrationRow; observedAt: string; canCheck: boolean; checking: boolean; disabled: boolean; onCheck: () => void;
}) {
  const check = row.lastCheck;
  return <li className="rounded-xl border bg-card p-5 sm:p-6 space-y-4">
    <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
      <div className="min-w-0"><h2 className="font-semibold break-words">{row.name}</h2>
        <div className="mt-2 flex flex-wrap gap-2"><Badge variant="outline">{row.mode === "test" ? "Pruebas" : row.mode === "live" ? "Producción" : "Ambiente sin configurar"}</Badge>
          {!row.active && <Badge variant="secondary">Empresa suspendida</Badge>}</div></div>
      {canCheck && <Button variant="outline" className="shrink-0" disabled={!row.active || disabled} onClick={onCheck}>
        {checking ? "Comprobando…" : "Comprobar conexión"}</Button>}
    </div>
    <dl className="grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-3">
      <div><dt className="text-muted-foreground">Llave del ambiente seleccionado</dt><dd className="mt-1 font-medium">{row.keyConfigured ? "Configurada" : "No configurada"}</dd></div>
      <div><dt className="text-muted-foreground">Último resultado</dt><dd className="mt-1 font-medium">{checkLabel(check, observedAt)}</dd></div>
      <div><dt className="text-muted-foreground">Fecha de comprobación</dt><dd className="mt-1">{healthDate(check?.completedAt ?? check?.startedAt)}</dd></div>
      <div><dt className="text-muted-foreground">Respuesta del proveedor</dt><dd className="mt-1">{responseLabel(check)}</dd></div>
      <div><dt className="text-muted-foreground">Trabajos fiscales en cola</dt><dd className="mt-1 tabular-nums">{row.queuedJobs}</dd></div>
      <div><dt className="text-muted-foreground">Reintentos agotados</dt><dd className="mt-1 tabular-nums">{row.exhaustedJobs}</dd></div>
    </dl>
  </li>;
}
