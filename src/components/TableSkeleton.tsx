import { Skeleton } from "@/components/ui/skeleton";

export function TableSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="p-6 space-y-3">
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className="h-12" />
      ))}
    </div>
  );
}
