import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { ChecklistEditor } from "@/features/operations/components/operations/contractTemplate/ChecklistEditor";
import { ClausesEditor } from "@/features/operations/components/operations/contractTemplate/ClausesEditor";
import { EditableList } from "@/features/operations/components/operations/contractTemplate/EditableList";
import type { LegalTemplateContent } from "@/lib/platformLegalTemplates.functions";

export function LegalTemplateContentEditor({
  value,
  onChange,
}: {
  value: LegalTemplateContent;
  onChange: (value: LegalTemplateContent) => void;
}) {
  const set = <K extends keyof LegalTemplateContent>(key: K, next: LegalTemplateContent[K]) =>
    onChange({ ...value, [key]: next });

  return (
    <Tabs defaultValue="main" className="space-y-4">
      <TabsList className="grid h-auto w-full grid-cols-2 sm:grid-cols-4">
        <TabsTrigger value="main">Introducción</TabsTrigger>
        <TabsTrigger value="declarations">Declaraciones</TabsTrigger>
        <TabsTrigger value="clauses">Cláusulas</TabsTrigger>
        <TabsTrigger value="annexes">Anexos</TabsTrigger>
      </TabsList>
      <TabsContent value="main" className="space-y-4">
        <Field label="Introducción" value={value.intro_text ?? ""} onChange={(next) => set("intro_text", next)} />
        {value.body_text !== undefined && (
          <Field label="Texto general" value={value.body_text ?? ""} onChange={(next) => set("body_text", next)} />
        )}
      </TabsContent>
      <TabsContent value="declarations" className="space-y-5">
        <ListField
          label="Declaraciones del arrendador"
          items={value.declarations_landlord}
          onChange={(next) => set("declarations_landlord", next)}
        />
        <ListField
          label="Declaraciones del arrendatario"
          items={value.declarations_tenant}
          onChange={(next) => set("declarations_tenant", next)}
        />
      </TabsContent>
      <TabsContent value="clauses">
        <ClausesEditor clauses={value.clauses} onChange={(next) => set("clauses", next)} />
      </TabsContent>
      <TabsContent value="annexes" className="space-y-5">
        <div className="space-y-2">
          <Label>Checklist de entrega</Label>
          <ChecklistEditor sections={value.checklist_sections} onChange={(next) => set("checklist_sections", next)} />
        </div>
        <Field label="Texto del pagaré" value={value.pagare_text ?? ""} onChange={(next) => set("pagare_text", next)} rows={8} />
      </TabsContent>
    </Tabs>
  );
}

function Field({ label, value, onChange, rows = 6 }: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  rows?: number;
}) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Textarea value={value} onChange={(event) => onChange(event.target.value)} rows={rows} />
    </div>
  );
}

function ListField({ label, items, onChange }: {
  label: string;
  items: string[];
  onChange: (items: string[]) => void;
}) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <EditableList items={items} onChange={onChange} />
    </div>
  );
}
