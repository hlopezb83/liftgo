import { AddIcon, DeleteIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { ChecklistSection } from "@/features/contracts";
import { EditableList } from "./EditableList";

interface Props {
  sections: ChecklistSection[];
  onChange: (next: ChecklistSection[]) => void;
}

export function ChecklistEditor({ sections, onChange }: Props) {
  const update = (i: number, patch: Partial<ChecklistSection>) => {
    const next = [...sections];
    next[i] = { ...next[i], ...patch };
    onChange(next);
  };

  return (
    <div className="space-y-4">
      {sections.map((section, si) => (
        <Card key={si}>
          <CardContent className="pt-4 space-y-2">
            <div className="flex items-center gap-2">
              <Input
                value={section.title}
                onChange={(e) => update(si, { title: e.target.value })}
                placeholder="Título de sección"
                className="font-semibold"
              />
              <Button variant="ghost" size="icon" onClick={() => onChange(sections.filter((_, j) => j !== si))} aria-label="Eliminar sección">
                <DeleteIcon className="h-4 w-4 text-destructive" />
              </Button>
            </div>
            <EditableList items={section.items} onChange={(items) => update(si, { items })} />
          </CardContent>
        </Card>
      ))}
      <Button variant="outline" size="sm" onClick={() => onChange([...sections, { title: "", items: [] }])}>
        <AddIcon className="h-4 w-4 mr-1" />Agregar Sección
      </Button>
    </div>
  );
}
