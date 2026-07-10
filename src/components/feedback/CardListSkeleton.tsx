import { Skeleton } from "@/components/ui/skeleton";

interface CardListSkeletonProps {
  /** Número de tarjetas a mostrar. Default 4. */
  count?: number;
  /** Renglones de contenido dentro de cada tarjeta. Default 3. */
  rows?: number;
}

/**
 * Skeleton para listas de tarjetas (MobileCardList, dashboard cards, etc.).
 * Mantiene la altura visual mientras carga y evita saltos de layout.
 */
export function CardListSkeleton({ count = 4, rows = 3 }: CardListSkeletonProps) {
  return (
    <div className="space-y-3">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="rounded-lg border bg-card p-4 space-y-3">
          <div className="flex items-center justify-between">
            <Skeleton className="h-4 w-2/5" />
            <Skeleton className="h-4 w-16" />
          </div>
          {Array.from({ length: rows }, (_, r) => (
            <Skeleton key={r} className="h-3 w-full" />
          ))}
        </div>
      ))}
    </div>
  );
}
