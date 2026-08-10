import { useState } from "react";
import { useOptimisticStatus } from "@/hooks/useOptimisticStatus";
import { useUpdateFeedbackStatus, type FeedbackReport } from "./useFeedbackReports";
import type { FeedbackStatus } from "../lib/constants";

/**
 * Encapsula el estado optimista + la mutación para cambiar el status de un
 * reporte de feedback. Extrae la lógica del `FeedbackDetailSheet` para
 * mantener su complejidad ciclomática dentro del límite del proyecto.
 */
export function useFeedbackStatusUpdate(report: FeedbackReport | null) {
  const [newStatus, setNewStatus] = useState<FeedbackStatus | "">("");
  const [comment, setComment] = useState("");
  const update = useUpdateFeedbackStatus();

  // Prev-prop guard: resetea inputs cuando cambia el reporte activo.
  const [prevReportId, setPrevReportId] = useState<string | null>(null);
  const nextReportId = report?.id ?? null;
  if (prevReportId !== nextReportId) {
    setPrevReportId(nextReportId);
    setNewStatus("");
    setComment("");
  }

  const [optimisticStatus, setOptimisticStatus] = useOptimisticStatus<string>(
    report?.status ?? "",
    async (next) => {
      if (!report) return;
      // Await de la mutación REAL: la UI conserva el valor optimista hasta que
      // el servidor confirma (sin flicker nuevo→viejo→nuevo) y un rechazo
      // revierte sin unhandled rejection (try/catch en useOptimisticStatus).
      await update.mutateAsync({
        reportId: report.id,
        newStatus: next as FeedbackStatus,
        comment: comment.trim() || undefined,
      });
      setNewStatus("");
      setComment("");
    },
  );

  const apply = () => {
    if (!report || !newStatus) return;
    setOptimisticStatus(newStatus);
  };

  return {
    newStatus,
    setNewStatus,
    comment,
    setComment,
    optimisticStatus,
    apply,
    pending: update.isPending,
  };
}
