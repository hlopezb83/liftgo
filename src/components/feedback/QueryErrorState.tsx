import { WarnIcon, ResetIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

interface QueryErrorStateProps {
  /** Qué se estaba cargando: "el tablero", "la proyección de flujo de caja", … */
  entity: string;
  onRetry: () => void;
  isRetrying?: boolean;
  /** Renderiza el mensaje sin envolver en Card (para embeder en layouts propios). */
  bare?: boolean;
}

/**
 * Oleada 2 (B-1): estado de error estándar para queries de TanStack.
 * NUNCA dejamos que una vista KPI renderice ceros cuando isError=true —
 * un usuario podría tomar decisiones sobre datos falsos.
 */
export function QueryErrorState({ entity, onRetry, isRetrying = false, bare = false }: QueryErrorStateProps) {
  const body = (
    <div className="py-12 flex flex-col items-center justify-center gap-3 text-center">
      <WarnIcon className="h-8 w-8 text-destructive" />
      <div>
        <p className="font-medium">No se pudo cargar {entity}</p>
        <p className="text-sm text-muted-foreground">
          Revisa tu conexión e inténtalo de nuevo. Los valores en pantalla no son confiables.
        </p>
      </div>
      <Button variant="outline" size="sm" onClick={onRetry} disabled={isRetrying}>
        <ResetIcon className={isRetrying ? "mr-2 h-4 w-4 animate-spin" : "mr-2 h-4 w-4"} />
        Reintentar
      </Button>
    </div>
  );
  if (bare) return body;
  return (
    <Card>
      <CardContent>{body}</CardContent>
    </Card>
  );
}
