import { AddIcon, DeleteIcon } from "@/components/icons";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { ContractClause } from "@/features/contracts";

interface Props {
  clauses: ContractClause[];
  onChange: (next: ContractClause[]) => void;
}

export function ClausesEditor({ clauses, onChange }: Props) {
  const update = (i: number, patch: Partial<ContractClause>) => {
    const next = [...clauses];
    next[i] = { ...next[i], ...patch };
    onChange(next);
  };

  return (
    <div className="space-y-4">
      {clauses.map((clause, i) => (
        <Card key={i}>
          <CardContent className="pt-4 space-y-2">
            <div className="flex items-center gap-2">
              <Input
                value={clause.title}
                onChange={(e) => update(i, { title: e.target.value })}
                placeholder="Título de la cláusula"
                className="font-semibold"
              />
              <Button variant="ghost" size="icon" onClick={() => onChange(clauses.filter((_, j) => j !== i))} aria-label="Eliminar cláusula">
                <DeleteIcon className="h-4 w-4 text-destructive" />
              </Button>
            </div>
            <Textarea
              value={clause.body}
              onChange={(e) => update(i, { body: e.target.value })}
              rows={5}
              placeholder="Contenido de la cláusula (soporta placeholders)"
            />
          </CardContent>
        </Card>
      ))}
      <Button variant="outline" size="sm" onClick={() => onChange([...clauses, { title: "", body: "" }])}>
        <AddIcon className="h-4 w-4 mr-1" />Agregar Cláusula
      </Button>
    </div>
  );
}
