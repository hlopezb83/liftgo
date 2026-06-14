import { useCallback, useMemo, useState } from "react";
import { useCRMMetrics } from "./useCRMMetrics";
import { useUpdateProspect, type Prospect } from "./useProspects";

/**
 * Orquesta el estado de la página `CRMClosedPage`: búsqueda local,
 * filtrado por término, métricas y diálogo de reapertura.
 *
 * Extraído de la página para mantenerla como container puro.
 */
export function useClosedProspects() {
  const { data: metrics, isLoading } = useCRMMetrics();
  const updateProspect = useUpdateProspect();
  const [search, setSearch] = useState("");
  const [reopenTarget, setReopenTarget] = useState<Prospect | null>(null);

  const filterRows = useCallback((rows: Prospect[]) => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (p) =>
        p.companyName.toLowerCase().includes(q) ||
        (p.contactPerson ?? "").toLowerCase().includes(q),
    );
  }, [search]);

  const wonRows = useMemo(() => filterRows(metrics.won), [metrics.won, filterRows]);
  const lostRows = useMemo(() => filterRows(metrics.lost), [metrics.lost, filterRows]);

  const handleReopen = useCallback((p: Prospect) => setReopenTarget(p), []);

  const confirmReopen = useCallback(() => {
    if (!reopenTarget) return;
    updateProspect.mutate({ id: reopenTarget.id, stage: "negociacion" });
    setReopenTarget(null);
  }, [reopenTarget, updateProspect]);

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
