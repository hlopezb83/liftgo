import { useCallback, useMemo, useState } from "react";
import { useNavigateTransition } from "@/hooks/useNavigateTransition";
import { useCRMMetrics } from "./useCRMMetrics";
import type { Prospect } from "./useProspects";

function filterProspectRows(rows: Prospect[], rawSearch: string): Prospect[] {
  const q = rawSearch.trim().toLowerCase();
  if (!q) return rows;
  return rows.filter(
    (p) =>
      p.companyName.toLowerCase().includes(q) ||
      (p.contactPerson ?? "").toLowerCase().includes(q),
  );
}

/**
 * Orquesta el estado de la página `CRMClosedPage`: búsqueda local,
 * filtrado por término, métricas y diálogo de reapertura.
 *
 * R17-I: expone `handleConvert` que navega al alta de cliente con datos
 * pre-cargados del prospecto ganado.
 */
export function useClosedProspects() {
  const { data: metrics, isLoading, isError, refetch } = useCRMMetrics();
  const navigate = useNavigateTransition();
  const [search, setSearch] = useState("");

  const wonRows = useMemo(() => filterProspectRows(metrics.won, search), [metrics.won, search]);
  const lostRows = useMemo(() => filterProspectRows(metrics.lost, search), [metrics.lost, search]);

  const handleConvert = useCallback((p: Prospect) => {
    // R18-C1: /customers/new no existe (cae en `/customers/:id` con id="new").
    // La ruta correcta es /customers?from_prospect=true&prospect_id=… (ver
    // CustomersPage: consume estos query params para abrir el form de alta).
    const params = new URLSearchParams({
      from_prospect: "true",
      prospect_id: p.id,
      company: p.companyName,
      contact: p.contactPerson ?? "",
      email: p.email ?? "",
      phone: p.phone ?? "",
    });
    navigate(`/customers?${params.toString()}`);
  }, [navigate]);

  return {
    metrics,
    isLoading,
    isError,
    refetch,
    search,
    setSearch,
    wonRows,
    lostRows,
    handleConvert,
  };
}
