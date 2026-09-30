import { SpinnerIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";

export interface LoadMoreProps {
  hasMore: boolean;
  isLoading: boolean;
  onClick: () => void;
  /** Total cargado; conservado para consumidores del contrato de paginación. */
  loaded?: number;
}

export function LoadMoreButton({ hasMore, isLoading, onClick }: LoadMoreProps) {
  if (!hasMore) return null;
  return (
    <Button variant="outline" size="sm" onClick={onClick} disabled={isLoading}>
      {isLoading ? (
        <><SpinnerIcon className="mr-2 h-4 w-4 animate-spin" />Cargando…</>
      ) : "Cargar más"}
    </Button>
  );
}
