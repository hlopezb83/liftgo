import { useState } from "react";
import { useNavigateTransition } from "@/hooks/useNavigateTransition";
import { useCRMMetrics } from "./useCRMMetrics";
import { useUpdateProspect, type Prospect } from "./useProspects";

/**
 * Orquesta el estado de la página `CRMClosedPage`: búsqueda local,
 * filtrado por término, métricas y diálogo de reapertura.
 *
 * R17-I: expone `handleConvert` que navega al alta de cliente con datos
 * pre-cargados del prospecto ganado.
 */
export function useClosedProspects() {
  const { data: metrics, isLoading } = useCRMMetrics();
  const updateProspect = useUpdateProspect();
  const navigate = useNavigateTransition();
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

  const handleConvert = (p: Prospect) => {
    const params = new URLSearchParams({
      name: p.companyName,
      contact: p.contactPerson ?? "",
      email: p.email ?? "",
      phone: p.phone ?? "",
      prospect_id: p.id,
    });
    navigate(`/customers/new?${params.toString()}`);
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
    handleConvert,
  };
}
