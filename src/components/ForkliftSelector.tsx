import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { Tables } from "@/integrations/supabase/types";

interface ForkliftSelectorProps {
  value: string;
  onValueChange: (value: string) => void;
  availableForklifts: Tables<"forklifts">[];
  datesSelected: boolean;
  showStatus?: boolean;
}

export function ForkliftSelector({ value, onValueChange, availableForklifts, datesSelected, showStatus }: ForkliftSelectorProps) {
  return (
    <div className="space-y-1.5">
      <Label>Forklift *</Label>
      <Select value={value} onValueChange={onValueChange} disabled={!datesSelected}>
        <SelectTrigger>
          <SelectValue placeholder={datesSelected ? "Select a forklift" : "Select dates first"} />
        </SelectTrigger>
        <SelectContent>
          {availableForklifts.map((f) => (
            <SelectItem key={f.id} value={f.id}>
              {f.name} — {f.model}{showStatus ? ` (${f.status})` : ""}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {datesSelected && availableForklifts.length === 0 && (
        <p className="text-xs text-muted-foreground">No forklifts available for the selected dates.</p>
      )}
    </div>
  );
}
