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
    async () => {
      // La mutación se dispara desde `apply` con los args completos.
      // Aquí solo actualizamos el estado optimista.
    },
  );

  const apply = () => {
    if (!report || !newStatus) return;
    setOptimisticStatus(newStatus);
    update.mutate(
      { reportId: report.id, newStatus, comment: comment.trim() || undefined },
      { onSuccess: () => { setNewStatus(""); setComment(""); } },
    );
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
