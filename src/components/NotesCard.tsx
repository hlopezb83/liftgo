import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";

interface NotesCardProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  title?: string;
  rows?: number;
}

export function NotesCard({ value, onChange, placeholder = "Notas adicionales...", title = "Notas", rows = 3 }: NotesCardProps) {
  return (
    <Card>
      <CardHeader><CardTitle className="text-base">{title}</CardTitle></CardHeader>
      <CardContent>
        <Textarea value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} rows={rows} />
      </CardContent>
    </Card>
  );
}
