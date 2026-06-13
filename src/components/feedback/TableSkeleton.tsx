import { Skeleton } from "@/components/ui/skeleton";

export function TableSkeleton({ rows = 5, columnCount }: { rows?: number; columnCount?: number }) {
  if (!columnCount) {
    return (
      <div className="p-6 space-y-3">
        {Array.from({ length: rows }, (_, i) => (
          <Skeleton key={i} className="h-12" />
        ))}
      </div>
    );
  }

  return (
    <table className="w-full">
      <tbody>
        {Array.from({ length: rows }, (_, r) => (
          <tr key={r} className="border-b last:border-0">
            {Array.from({ length: columnCount }, (_, c) => (
              <td key={c} className="p-4">
                <Skeleton className="h-4 w-full" />
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
