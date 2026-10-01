import { useState } from "react";
import { QueryErrorState } from "@/components/feedback/QueryErrorState";
import { RefreshIcon } from "@/components/icons";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  PLATFORM_AUDIT_TARGETS,
  platformAuditInputSchema,
  type PlatformAuditInput,
  type PlatformAuditEvent,
} from "@/lib/platformAudit.types";
import { useSearchParams } from "@/lib/router-compat";
import { PlatformAuditEventDialog } from "../components/PlatformAuditEventDialog";
import { PlatformAuditEventList } from "../components/PlatformAuditEventList";
import { usePlatformOrganizations } from "../hooks/usePlatformOperator";
import { usePlatformAudit } from "../hooks/usePlatformReadModels";
import { PLATFORM_AUDIT_LABELS } from "../lib/platformAuditLabels";

const SELECT_CLASS = "h-10 w-full rounded-md border bg-background px-3 text-sm";

function validFilters(input: PlatformAuditInput, invalidTarget: boolean) {
  return !invalidTarget && platformAuditInputSchema.safeParse(input).success;
}

function AuditResult({
  valid,
  query,
  onSelect,
}: {
  valid: boolean;
  query: ReturnType<typeof usePlatformAudit>;
  onSelect: (event: PlatformAuditEvent) => void;
}) {
  if (!valid)
    return (
      <p role="alert" className="text-sm text-destructive">
        El filtro solicitado no es válido. Selecciona una empresa y un ámbito.
      </p>
    );
  if (query.isError)
    return (
      <QueryErrorState
        entity="la bitácora global"
        onRetry={() => void query.refetch()}
        isRetrying={query.isFetching}
      />
    );
  if (query.isPending) return <Skeleton className="h-64 w-full" />;
  return (
    <PlatformAuditEventList events={query.data.events} onSelect={onSelect} />
  );
}

export default function PlatformAuditPage() {
  const [params, setParams] = useSearchParams();
  const organization = params.get("organization") || undefined;
  const rawTarget = params.get("target") || undefined;
  const target = PLATFORM_AUDIT_TARGETS.find((value) => value === rawTarget);
  const filterKey = `${organization ?? "all"}:${rawTarget ?? "all"}`;
  return (
    <AuditContent
      key={filterKey}
      organization={organization}
      target={target}
      invalidTarget={!!rawTarget && !target}
      onFilter={(name, value) =>
        setParams(
          (previous) => {
            const next = new URLSearchParams(previous);
            if (value) next.set(name, value);
            else next.delete(name);
            return next;
          },
          { replace: true },
        )
      }
    />
  );
}

function AuditContent({
  organization,
  target,
  invalidTarget,
  onFilter,
}: {
  organization?: string;
  target?: PlatformAuditEvent["target_type"];
  invalidTarget: boolean;
  onFilter: (name: string, value: string) => void;
}) {
  const [cursors, setCursors] = useState<string[]>([]);
  const [selected, setSelected] = useState<PlatformAuditEvent | null>(null);
  const organizations = usePlatformOrganizations(true);
  const input = {
    organization_id: organization,
    target_type: target,
    before_id: cursors.at(-1),
    limit: 25,
  };
  const filtersValid = validFilters(input, invalidTarget);
  const query = usePlatformAudit(input, filtersValid);
  const events = query.data?.events ?? [];
  function next() {
    const last = events.at(-1);
    if (last && query.data?.has_more)
      setCursors((previous) => [...previous, last.id]);
  }
  return (
    <div className="space-y-6">
      <PageHeader
        title="Bitácora global"
        subtitle="Cambios administrativos del ecosistema LiftGo. Hora local del navegador."
        actions={
          <Button
            variant="outline"
            onClick={() => void query.refetch()}
            disabled={!filtersValid || query.isFetching}
          >
            <RefreshIcon
              className={`mr-2 h-4 w-4 ${query.isFetching ? "animate-spin" : ""}`}
            />
            Actualizar
          </Button>
        }
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="audit-organization">Empresa</Label>
          <select
            id="audit-organization"
            className={SELECT_CLASS}
            value={organization ?? ""}
            disabled={organizations.isPending || organizations.isError}
            onChange={(event) => onFilter("organization", event.target.value)}
          >
            <option value="">Todas las empresas y cambios globales</option>
            {organizations.data?.map((org) => (
              <option key={org.id} value={org.id}>
                {org.razon_social || org.name}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="audit-target">Ámbito</Label>
          <select
            id="audit-target"
            className={SELECT_CLASS}
            value={target ?? ""}
            onChange={(event) => onFilter("target", event.target.value)}
          >
            <option value="">Todos los ámbitos</option>
            {PLATFORM_AUDIT_TARGETS.map((value) => (
              <option key={value} value={value}>
                {PLATFORM_AUDIT_LABELS[value]}
              </option>
            ))}
          </select>
        </div>
      </div>
      {organizations.isError && (
        <p role="alert" className="text-sm text-destructive">
          No se pudo cargar el selector de empresas.{" "}
          <Button
            variant="link"
            size="sm"
            onClick={() => void organizations.refetch()}
          >
            Reintentar
          </Button>
        </p>
      )}
      <AuditResult valid={filtersValid} query={query} onSelect={setSelected} />
      {filtersValid && query.isSuccess && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">
              Página {cursors.length + 1} · {events.length} eventos
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                disabled={!cursors.length || query.isFetching}
                onClick={() => {
                  setSelected(null);
                  setCursors((previous) => previous.slice(0, -1));
                }}
              >
                Anterior
              </Button>
              <Button
                variant="outline"
                disabled={!query.data?.has_more || query.isFetching}
                onClick={next}
              >
                Siguiente
              </Button>
            </div>
          </div>
        </>
      )}
      <p className="text-xs text-muted-foreground">
        Los eventos no se editan ni borran desde el Centro. Las altas y cambios
        empresariales históricos disponibles se conservan; los eventos de
        catálogos comienzan con la habilitación de esta bitácora.
      </p>
      <PlatformAuditEventDialog
        event={selected}
        onClose={() => setSelected(null)}
      />
    </div>
  );
}
