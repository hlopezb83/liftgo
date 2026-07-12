import { HistoryIcon } from "@/components/icons";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDateDisplay, formatDateRange } from "@/lib/utils";

interface Extension {
  id: string;
  original_end_date: string;
  new_end_date: string;
  created_at: string | null;
  reason?: string | null;
}

export function BookingExtensionsCard({ extensions }: { extensions: Extension[] }) {
  if (!extensions || extensions.length === 0) return null;
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <HistoryIcon className="h-4 w-4 text-muted-foreground" /> Extensiones
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {extensions.map((ext) => (
          <div key={ext.id} className="p-3 rounded-lg bg-muted/40 text-sm space-y-1">
            <div className="flex justify-between">
              <span className="text-muted-foreground">
                {formatDateRange(ext.original_end_date, ext.new_end_date)}
              </span>
              <span className="text-xs text-muted-foreground">{formatDateDisplay(ext.created_at)}</span>
            </div>
            {ext.reason && <p className="text-xs">{ext.reason}</p>}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
