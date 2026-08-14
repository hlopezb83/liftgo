import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

function Skeleton({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  // Decorativo: los contenedores (TableSkeleton, CardListSkeleton, páginas)
  // ya anuncian la carga con role="status" + texto sr-only; cada bloque
  // individual no debe ser leído por tecnologías de asistencia.
  return <div aria-hidden="true" className={cn("animate-pulse rounded-md bg-muted", className)} {...props} />;
}

export { Skeleton };
