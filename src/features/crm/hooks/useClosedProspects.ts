import { useState } from "react";
import { useCRMMetrics } from "./useCRMMetrics";
import { useUpdateProspect, type Prospect } from "./useProspects";

/**
 * Orquesta el estado de la página `CRMClosedPage`: búsqueda local,
 * filtrado por término, métricas y diálogo de reapertura.
 *
 * Extraído de la página para mantenerla como container puro.
 * Todas las derivaciones puras (filterRows, wonRows, lostRows y los
 * handlers) las memoiza React Compiler automáticamente.
 */
export function useClosedProspects() {
  const { data: metrics, isLoading } = useCRMMetrics();
  const updateProspect = useUpdateProspect();
  const [search, setSearch] = useState("");
  const [reopenTarget, setReopenTarget] = useState<Prospect | null>(null);

  const filterRows = (rows: Prospect[]) => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (p) =>
        p.companyName.toLowerCase().includes(q) ||
        (p.contactPerson ?? "").toLowerCase().includes(q),
    );
  };

  const wonRows = filterRows(metrics.won);
  const lostRows = filterRows(metrics.lost);

  const handleReopen = (p: Prospect) => setReopenTarget(p);

  const confirmReopen = () => {
    if (!reopenTarget) return;
    updateProspect.mutate({ id: reopenTarget.id, stage: "negociacion" });
    setReopenTarget(null);
  };

  return {
    metrics,
    isLoading,
    search,
    setSearch,
    wonRows,
    lostRows,
    reopenTarget,
    setReopenTarget,
    handleReopen,
    confirmReopen,
  };
}
