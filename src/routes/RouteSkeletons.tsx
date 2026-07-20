import { useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router";

// ---------------------------------------------------------------------------
// Skeletons semánticos por tipo de ruta.
// La navegación con `useNavigateTransition` mantiene el layout (sidebar/header)
// interactivo; estos placeholders sólo cubren el área del outlet mientras el
// chunk lazy resuelve. Cada uno imita la silueta real de su tipo de página.
// ---------------------------------------------------------------------------

const shimmer = "animate-pulse rounded-md bg-muted/60";

function SkeletonList() {
  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <div className={`${shimmer} h-6 w-48`} />
          <div className={`${shimmer} h-4 w-64`} />
        </div>
        <div className={`${shimmer} h-9 w-32`} />
      </div>
      {/* Toolbar */}
      <div className="flex gap-2">
        <div className={`${shimmer} h-9 flex-1 max-w-md`} />
        <div className={`${shimmer} h-9 w-32`} />
      </div>
      {/* Table rows */}
      <div className="space-y-2">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className={`${shimmer} h-11 w-full`} />
        ))}
      </div>
    </div>
  );
}

function SkeletonDetail() {
  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <div className={`${shimmer} h-4 w-24`} />
          <div className={`${shimmer} h-7 w-64`} />
        </div>
        <div className="flex gap-2">
          <div className={`${shimmer} h-9 w-24`} />
          <div className={`${shimmer} h-9 w-24`} />
        </div>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className={`${shimmer} h-40 col-span-2`} />
        <div className={`${shimmer} h-40`} />
      </div>
      <div className={`${shimmer} h-64 w-full`} />
    </div>
  );
}

function SkeletonForm() {
  return (
    <div className="space-y-6 p-6 max-w-4xl">
      <div className="space-y-2">
        <div className={`${shimmer} h-4 w-24`} />
        <div className={`${shimmer} h-7 w-56`} />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="space-y-2">
            <div className={`${shimmer} h-3 w-24`} />
            <div className={`${shimmer} h-9 w-full`} />
          </div>
        ))}
      </div>
      <div className="flex justify-end gap-2">
        <div className={`${shimmer} h-9 w-24`} />
        <div className={`${shimmer} h-9 w-32`} />
      </div>
    </div>
  );
}

function SkeletonDashboard() {
  return (
    <div className="space-y-6 p-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className={`${shimmer} h-24`} />
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className={`${shimmer} h-64 col-span-2`} />
        <div className={`${shimmer} h-64`} />
      </div>
    </div>
  );
}

function pickSkeleton(pathname: string) {
  if (pathname === "/" || pathname === "/mrr") return SkeletonDashboard;
  if (/\/(new|edit)(\/|$)/.test(pathname)) return SkeletonForm;
  // /modulo/:id → detail; /modulo → list
  const segments = pathname.split("/").filter(Boolean);
  if (segments.length >= 2) return SkeletonDetail;
  return SkeletonList;
}

/**
 * Suspense fallback global: selecciona un esqueleto según la ruta y añade
 * un mensaje de recarga si la carga excede 10s (chunk atascado / red caída).
 */
export const PageFallback = () => {
  const location = useLocation();
  const [stalled, setStalled] = useState(false);

  useEffect(() => {
    const t = window.setTimeout(() => setStalled(true), 10_000);
    return () => window.clearTimeout(t);
  }, []);

  const Skeleton = useMemo(() => pickSkeleton(location.pathname), [location.pathname]);

  return (
    <div className="relative">
      <Skeleton />

      {stalled && (
        <div className="fixed inset-x-0 bottom-6 flex justify-center pointer-events-none">
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="pointer-events-auto rounded-full bg-primary text-primary-foreground px-4 py-2 text-xs font-medium shadow-lg hover:opacity-90"
          >
            La carga está tardando. Recarga la página
          </button>
        </div>
      )}
    </div>
  );
};
