import { Skeleton } from "@/components/ui/skeleton";

interface FormSkeletonProps {
  /** Número de campos a simular. Default 6. */
  fields?: number;
  /** Muestra un botón submit al final. Default true. */
  showActions?: boolean;
}

/**
 * Skeleton para formularios (FormDialog en carga inicial, PrefillEffect, etc.).
 * Renderiza pares label + input con altura consistente con `TextField`/`Input`.
 */
export function FormSkeleton({ fields = 6, showActions = true }: FormSkeletonProps) {
  return (
    <div className="space-y-4">
      {Array.from({ length: fields }, (_, i) => (
        <div key={i} className="space-y-1.5">
          <Skeleton className="h-3.5 w-24" />
          <Skeleton className="h-9 w-full" />
        </div>
      ))}
      {showActions && (
        <div className="flex justify-end gap-2 pt-2">
          <Skeleton className="h-9 w-20" />
          <Skeleton className="h-9 w-28" />
        </div>
      )}
    </div>
  );
}
