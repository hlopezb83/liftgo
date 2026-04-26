import { useState, useEffect } from "react";
import { useDefaultContractTemplate, useUpdateContractTemplate, type ContractClause, type ChecklistSection } from "@/hooks/useContractTemplates";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, Save, Info } from "lucide-react";
import { toast } from "sonner";
import { TableSkeleton } from "@/components/TableSkeleton";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { CONTRACT_PLACEHOLDERS as PLACEHOLDERS } from "@/lib/pdf/contract/placeholderRegistry";

export function ContractTemplateTab() {
  const { data: template, isLoading } = useDefaultContractTemplate();
  const updateMutation = useUpdateContractTemplate();

  const [introText, setIntroText] = useState("");
  const [declLandlord, setDeclLandlord] = useState<string[]>([]);
  const [declTenant, setDeclTenant] = useState<string[]>([]);
  const [clauses, setClauses] = useState<ContractClause[]>([]);
  const [checklistSections, setChecklistSections] = useState<ChecklistSection[]>([]);
  const [pagareText, setPagareText] = useState("");

  useEffect(() => {
    if (template) {
      setIntroText(template.intro_text || "");
      setDeclLandlord(template.declarations_landlord || []);
      setDeclTenant(template.declarations_tenant || []);
      setClauses(template.clauses || []);
      setChecklistSections(template.checklist_sections || []);
      setPagareText(template.pagare_text || "");
    }
  }, [template]);

  if (isLoading) return <TableSkeleton />;
  if (!template) return <p className="text-muted-foreground p-4">No se encontró plantilla por defecto. Crea una desde la base de datos.</p>;

  const handleSave = async () => {
    const invalidClause = clauses.find(c => !c.title.trim() || !c.body.trim());
    if (invalidClause) {
      toast.error("Todas las cláusulas deben tener título y contenido.");
      return;
    }
    try {
      await updateMutation.mutateAsync({
        id: template.id,
        intro_text: introText,
        declarations_landlord: declLandlord,
        declarations_tenant: declTenant,
        clauses: clauses,
        checklist_sections: checklistSections,
        pagare_text: pagareText,
      });
      toast.success("Plantilla guardada correctamente.");
    } catch {
      toast.error("Error al guardar la plantilla.");
    }
  };

  return (
    <div className="space-y-4 mt-4">
      {/* Placeholder reference */}
      <Collapsible>
        <CollapsibleTrigger asChild>
          <Button variant="outline" size="sm" className="gap-2 mb-2">
            <Info className="h-4 w-4" />
            Placeholders disponibles
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <Card className="mb-4">
            <CardContent className="pt-4">
              <div className="flex flex-wrap gap-2">
                {PLACEHOLDERS.map(p => (
                  <Badge key={p.key} variant="secondary" className="text-xs font-mono">
                    {p.key} <span className="ml-1 font-sans text-muted-foreground">— {p.desc}</span>
                  </Badge>
                ))}
              </div>
            </CardContent>
          </Card>
        </CollapsibleContent>
      </Collapsible>

      <Accordion type="multiple" defaultValue={["intro", "clauses"]} className="space-y-2">
        {/* Intro */}
        <AccordionItem value="intro">
          <AccordionTrigger>Párrafo Introductorio</AccordionTrigger>
          <AccordionContent>
            <Textarea value={introText} onChange={e => setIntroText(e.target.value)} rows={4} />
          </AccordionContent>
        </AccordionItem>

        {/* Declarations Landlord */}
        <AccordionItem value="decl-landlord">
          <AccordionTrigger>Declaraciones del Arrendador</AccordionTrigger>
          <AccordionContent>
            <EditableList items={declLandlord} onChange={setDeclLandlord} />
          </AccordionContent>
        </AccordionItem>

        {/* Declarations Tenant */}
        <AccordionItem value="decl-tenant">
          <AccordionTrigger>Declaraciones del Arrendatario</AccordionTrigger>
          <AccordionContent>
            <EditableList items={declTenant} onChange={setDeclTenant} />
          </AccordionContent>
        </AccordionItem>

        {/* Clauses */}
        <AccordionItem value="clauses">
          <AccordionTrigger>Cláusulas del Contrato</AccordionTrigger>
          <AccordionContent>
            <div className="space-y-4">
              {clauses.map((clause, i) => (
                <Card key={i}>
                  <CardContent className="pt-4 space-y-2">
                    <div className="flex items-center gap-2">
                      <Input
                        value={clause.title}
                        onChange={e => {
                          const next = [...clauses];
                          next[i] = { ...next[i], title: e.target.value };
                          setClauses(next);
                        }}
                        placeholder="Título de la cláusula"
                        className="font-semibold"
                      />
                      <Button variant="ghost" size="icon" onClick={() => setClauses(clauses.filter((_, j) => j !== i))}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                    <Textarea
                      value={clause.body}
                      onChange={e => {
                        const next = [...clauses];
                        next[i] = { ...next[i], body: e.target.value };
                        setClauses(next);
                      }}
                      rows={5}
                      placeholder="Contenido de la cláusula (soporta placeholders)"
                    />
                  </CardContent>
                </Card>
              ))}
              <Button variant="outline" size="sm" onClick={() => setClauses([...clauses, { title: "", body: "" }])}>
                <Plus className="h-4 w-4 mr-1" />Agregar Cláusula
              </Button>
            </div>
          </AccordionContent>
        </AccordionItem>

        {/* Checklist */}
        <AccordionItem value="checklist">
          <AccordionTrigger>Checklist — Anexo A</AccordionTrigger>
          <AccordionContent>
            <div className="space-y-4">
              {checklistSections.map((section, si) => (
                <Card key={si}>
                  <CardContent className="pt-4 space-y-2">
                    <div className="flex items-center gap-2">
                      <Input
                        value={section.title}
                        onChange={e => {
                          const next = [...checklistSections];
                          next[si] = { ...next[si], title: e.target.value };
                          setChecklistSections(next);
                        }}
                        placeholder="Título de sección"
                        className="font-semibold"
                      />
                      <Button variant="ghost" size="icon" onClick={() => setChecklistSections(checklistSections.filter((_, j) => j !== si))}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                    <EditableList
                      items={section.items}
                      onChange={items => {
                        const next = [...checklistSections];
                        next[si] = { ...next[si], items };
                        setChecklistSections(next);
                      }}
                    />
                  </CardContent>
                </Card>
              ))}
              <Button variant="outline" size="sm" onClick={() => setChecklistSections([...checklistSections, { title: "", items: [] }])}>
                <Plus className="h-4 w-4 mr-1" />Agregar Sección
              </Button>
            </div>
          </AccordionContent>
        </AccordionItem>

        {/* Pagaré */}
        <AccordionItem value="pagare">
          <AccordionTrigger>Pagaré — Anexo B</AccordionTrigger>
          <AccordionContent>
            <Textarea value={pagareText} onChange={e => setPagareText(e.target.value)} rows={6} />
          </AccordionContent>
        </AccordionItem>
      </Accordion>

      <Button onClick={handleSave} disabled={updateMutation.isPending} className="gap-2">
        <Save className="h-4 w-4" />
        {updateMutation.isPending ? "Guardando..." : "Guardar Plantilla"}
      </Button>
    </div>
  );
}

function EditableList({ items, onChange }: { items: string[]; onChange: (items: string[]) => void }) {
  return (
    <div className="space-y-2">
      {items.map((item, i) => (
        <div key={i} className="flex items-start gap-2">
          <Textarea
            value={item}
            onChange={e => {
              const next = [...items];
              next[i] = e.target.value;
              onChange(next);
            }}
            rows={2}
            className="min-h-[40px]"
          />
          <Button variant="ghost" size="icon" className="mt-1 shrink-0" onClick={() => onChange(items.filter((_, j) => j !== i))}>
            <Trash2 className="h-4 w-4 text-destructive" />
          </Button>
        </div>
      ))}
      <Button variant="outline" size="sm" onClick={() => onChange([...items, ""])}>
        <Plus className="h-4 w-4 mr-1" />Agregar
      </Button>
    </div>
  );
}
