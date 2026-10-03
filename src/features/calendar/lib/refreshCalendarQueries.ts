import { notifyError, notifySuccess } from "@/lib/ui/appFeedback";

/** QueryCache owns query failures; the toolbar owns progress and success. */
export async function refreshCalendarQueries(
  refetches: Array<() => Promise<{ isError: boolean }>>,
): Promise<void> {
  try {
    const results = await Promise.all(refetches.map((refetch) => refetch()));
    if (results.every((result) => !result.isError)) {
      notifySuccess("Calendario actualizado");
    }
  } catch (error) {
    // A rejected orchestration task is distinct from a resolved query error.
    notifyError({ title: "No se pudo actualizar el calendario", error, phase: "query" });
  }
}
