import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FISCAL_OPERATIONS, type FiscalJob } from "@/lib/platformFiscalJobs.types";
import { healthDate } from "../hooks/usePlatformHealth";
import { fiscalJobMode, fiscalJobStatus } from "../lib/fiscalJobPresentation";

export function PlatformFiscalJobCard({ job, onOpen }: { job: FiscalJob; onOpen: () => void }) {
  return <li className="space-y-4 p-4 sm:p-5">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0 space-y-2"><p className="text-xs text-muted-foreground break-words">{job.organizationName}</p>
        <h2 className="font-semibold break-words">{FISCAL_OPERATIONS[job.operation]} · {job.folio || job.documentId.slice(0, 8)}</h2>
        <div className="flex flex-wrap gap-2"><Badge variant="secondary">{fiscalJobStatus(job)}</Badge>
          <Badge variant="outline">Configuración al encolar: {fiscalJobMode(job.modeAtEnqueue)}</Badge></div></div>
      <Button variant="outline" className="min-h-11 shrink-0" onClick={onOpen}>Ver historial</Button>
    </div>
    <dl className="grid gap-4 text-sm sm:grid-cols-3">
      <div><dt className="text-muted-foreground">Intentos del consumidor</dt><dd className="mt-1 tabular-nums">{job.state.attempts} de {job.state.maxAttempts}</dd></div>
      <div><dt className="text-muted-foreground">Aplazamientos</dt><dd className="mt-1 tabular-nums">{job.state.deferrals}</dd></div>
      <div><dt className="text-muted-foreground">Próxima ejecución</dt><dd className="mt-1">{!job.removed && job.state.status === "pending" ? healthDate(job.state.nextRetryAt) : "Sin programación pendiente"}</dd></div>
    </dl>
  </li>;
}
