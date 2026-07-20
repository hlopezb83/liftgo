import { ErrorIcon, RefreshIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";

interface ErrorStateProps {
  title?: string;
  subtitle?: string;
  retryLabel?: string;
  onRetry?: () => void;
}

/**
 * Estado de error para listados. Reemplaza al EmptyState cuando una query falla
 * (red, RLS, JWT expirado) para no mentir sobre el estado del sistema (UX-A1).
 */
export function ErrorState({
  title = "No pudimos cargar los datos",
  subtitle = "Ocurrió un error al consultar la información. Intenta nuevamente.",
  retryLabel = "Reintentar",
  onRetry,
}: ErrorStateProps) {
  return (
    <div
      role="alert"
      className="flex flex-col items-center justify-center py-20 px-6 text-center"
    >
      <div className="rounded-full bg-destructive/10 p-4 mb-4">
        <ErrorIcon className="h-8 w-8 text-destructive" />
      </div>
      <h3 className="text-lg font-semibold text-foreground mb-1">{title}</h3>
      <p className="text-sm text-muted-foreground max-w-xs">{subtitle}</p>
      {onRetry && (
        <Button size="sm" variant="outline" className="mt-5 gap-2" onClick={onRetry}>
          <RefreshIcon className="h-4 w-4" />
          {retryLabel}
        </Button>
      )}
    </div>
  );
}
