import { WarnIcon } from "@/components/icons";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { LIST_PAGE_LIMIT, hasReachedListLimit } from "@/lib/supabase/constants";

interface Props<T> {
  /** Lista CRUDA del hook (pedida con limit+1), no la ya recortada. */
  rows: ReadonlyArray<T> | null | undefined;
}

/**
 * Aviso único de truncamiento de listados (FE2-01/02/03).
 * Devuelve `null` cuando la lista no está realmente truncada, así que puede
 * usarse directo en el slot `notice` de `ListPageLayout`.
 */
export function ListTruncationNotice<T>({ rows }: Props<T>) {
  if (!hasReachedListLimit(rows)) return null;
  return (
    <Alert>
      <WarnIcon className="h-4 w-4" />
      <AlertDescription>
        Mostrando los primeros {LIST_PAGE_LIMIT} registros. Refina los filtros para ver más.
      </AlertDescription>
    </Alert>
  );
}
