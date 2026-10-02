import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { QueryErrorState } from "@/components/feedback/QueryErrorState";
import { PageHeader } from "@/components/layout/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/contexts/AuthContext";
import { PLATFORM_PROFILE_LABELS } from "@/lib/platformAccess.types";
import { listPlatformOperatorsFn } from "@/lib/platformOperators.functions";
import type { PlatformOperatorRow } from "@/lib/platformOperators.types";
import { PlatformOperatorDialog } from "../components/PlatformOperatorDialog";
import { usePlatformCapabilities } from "../hooks/usePlatformAccess";

export default function PlatformOperatorsPage() {
  const { user } = useAuth();
  const { can } = usePlatformCapabilities();
  const cache = useQueryClient();
  const [scope, setScope] = useState<"operators" | "eligible">("operators");
  const [search, setSearch] = useState("");
  const [draftSearch, setDraftSearch] = useState("");
  const [offset, setOffset] = useState(0);
  const [selected, setSelected] = useState<PlatformOperatorRow | null>(null);
  const [saved, setSaved] = useState(false);
  const query = useQuery({ queryKey: ["platform", "operators", scope, search, offset],
    queryFn: () => listPlatformOperatorsFn({ data: { scope, search, offset } }), staleTime: 0 });

  function onSaved() {
    setSelected(null); setSaved(true);
    void cache.invalidateQueries({ queryKey: ["platform", "operators"] });
    void cache.invalidateQueries({ queryKey: ["platform", "audit"] });
  }
  return (
    <>
      <PageHeader title="Operadores de plataforma" subtitle="Administra perfiles y accesos globales de cuentas internas existentes."
        actions={<Button variant="outline" disabled={query.isFetching} onClick={() => { setSelected(null); void query.refetch(); }}>Actualizar listado</Button>} />
      <div className="rounded-xl border bg-card p-4 sm:p-6 space-y-4">
        <div className="flex flex-wrap gap-2" role="group" aria-label="Mostrar cuentas">
          {(["operators", "eligible"] as const).map((value) => <Button key={value}
            variant={scope === value ? "default" : "outline"} aria-pressed={scope === value}
            onClick={() => { setScope(value); setOffset(0); setSaved(false); }}>
            {value === "operators" ? "Operadores actuales" : "Cuentas internas"}
          </Button>)}
        </div>
        <form className="flex flex-col gap-3 sm:flex-row sm:items-end" onSubmit={(event) => {
          event.preventDefault(); setSearch(draftSearch.trim()); setOffset(0);
        }}>
          <div className="flex-1 space-y-2">
            <Label htmlFor="operator-search">Buscar por nombre o correo</Label>
            <Input id="operator-search" value={draftSearch} maxLength={100} onChange={(event) => setDraftSearch(event.target.value)} />
          </div>
          <Button type="submit" variant="outline">Buscar</Button>
        </form>
        <p className="text-sm text-muted-foreground">Las cuentas disponibles están activas y verificadas. El propio acceso se administra desde otra cuenta de operador raíz.</p>
      </div>
      {saved && <p role="status" className="rounded-lg border bg-muted p-3 text-sm">Acceso de plataforma actualizado.</p>}
      {query.isError ? <QueryErrorState entity="los operadores" onRetry={() => void query.refetch()} isRetrying={query.isFetching} />
        : query.isPending ? <Skeleton className="h-48 w-full" /> : <>
          <ul className="divide-y rounded-xl border bg-card" aria-label="Cuentas de plataforma">
            {query.data.rows.map((account) => <li key={account.id} className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
              <div className="min-w-0 space-y-1">
                <p className="font-medium break-words">{account.name || "Cuenta interna"}{account.id === user?.id && <span className="ml-2 text-xs text-muted-foreground">(Tú)</span>}</p>
                <p className="break-all text-sm text-muted-foreground">{account.email}</p>
                <div className="flex flex-wrap gap-2 pt-1">
                  <Badge variant="outline">{account.profile ? PLATFORM_PROFILE_LABELS[account.profile] : "Sin acceso de plataforma"}</Badge>
                  {!account.eligible && <Badge variant="secondary">Cuenta no disponible para asignar</Badge>}
                </div>
              </div>
              {can("operators.manage") && <Button variant="outline" className="shrink-0" disabled={account.id === user?.id}
                onClick={() => { setSelected(account); setSaved(false); }}>
                {account.profile ? "Cambiar acceso" : "Asignar acceso"}
              </Button>}
            </li>)}
          </ul>
          {query.data.rows.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">No hay cuentas que coincidan con esta búsqueda.</p>}
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">Página {offset/25+1}</p>
            <div className="flex gap-2">
              <Button variant="outline" disabled={offset===0 || query.isFetching} onClick={() => setOffset(offset-25)}>Anterior</Button>
              <Button variant="outline" disabled={!query.data.hasMore || query.isFetching} onClick={() => setOffset(offset+25)}>Siguiente</Button>
            </div>
          </div>
        </>}
      {selected && <PlatformOperatorDialog key={`${selected.id}:${selected.revision}`} account={selected} onClose={() => setSelected(null)} onSaved={onSaved} />}
    </>
  );
}
