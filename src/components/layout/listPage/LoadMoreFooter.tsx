import { SpinnerIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";

export interface LoadMoreProps {
  hasMore: boolean;
  isLoading: boolean;
  onClick: () => void;
  /** Total de registros ya visibles, sólo para el label ("Mostrando N"). */
  loaded?: number;
}

export function LoadMoreFooter({ hasMore, isLoading, onClick, loaded }: LoadMoreProps) {
  return (
    <div className="flex items-center justify-center gap-3 border-t px-4 py-3 text-sm text-muted-foreground">
      {typeof loaded === "number" && (
        <span>Mostrando {loaded} registro{loaded === 1 ? "" : "s"}</span>
      )}
      {hasMore ? (
        <Button variant="outline" size="sm" onClick={onClick} disabled={isLoading}>
          {isLoading ? (
            <><SpinnerIcon className="mr-2 h-4 w-4 animate-spin" />Cargando…</>
          ) : (
            "Cargar más"
          )}
        </Button>
      ) : (
        <span>No hay más resultados.</span>
      )}
    </div>
  );
}
