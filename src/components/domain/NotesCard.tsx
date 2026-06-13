import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";

interface NotesCardProps {
  value: string;
  onChange?: (value: string) => void;
  placeholder?: string;
  title?: string;
  rows?: number;
  readOnly?: boolean;
}

export function NotesCard({ value, onChange, placeholder = "Notas adicionales...", title = "Notas", rows = 3, readOnly = false }: NotesCardProps) {
  return (
    <Card>
      <CardHeader><CardTitle className="text-base">{title}</CardTitle></CardHeader>
      <CardContent>
        {readOnly ? (
          <p className="text-sm whitespace-pre-wrap text-muted-foreground">{value}</p>
        ) : (
          <Textarea value={value} onChange={(e) => onChange?.(e.target.value)} placeholder={placeholder} rows={rows} />
        )}
      </CardContent>
    </Card>
  );
}
