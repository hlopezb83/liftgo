import { useState, useEffect } from "react";
import { notifyError, notifySuccess, notifyValidation } from "@/lib/ui/appFeedback";
import { useDefaultContractTemplate, useUpdateContractTemplate, type ContractClause, type ChecklistSection } from "@/features/contracts";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Save, Info } from "@/components/icons";

import { TableSkeleton } from "@/components/feedback/TableSkeleton";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { CONTRACT_PLACEHOLDERS as PLACEHOLDERS } from "@/lib/pdf/contract/placeholderRegistry";
import { EditableList } from "./contractTemplate/EditableList";
import { ClausesEditor } from "./contractTemplate/ClausesEditor";
import { ChecklistEditor } from "./contractTemplate/ChecklistEditor";

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
    const invalidClause = clauses.find((c) => !c.title.trim() || !c.body.trim());
    if (invalidClause) {
      notifyValidation({ message: "Todas las cláusulas deben tener título y contenido." });
      return;
    }
    try {
      await updateMutation.mutateAsync({
        id: template.id,
        intro_text: introText,
        declarations_landlord: declLandlord,
        declarations_tenant: declTenant,
        clauses,
        checklist_sections: checklistSections,
        pagare_text: pagareText,
      });
      notifySuccess("Plantilla guardada correctamente.");
    } catch (err) {
      notifyError({ error: err, message: "Error al guardar la plantilla." });
    }
  };

  return (
    <div className="space-y-4 mt-4">
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
                {PLACEHOLDERS.map((p) => (
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
        <AccordionItem value="intro">
          <AccordionTrigger>Párrafo Introductorio</AccordionTrigger>
          <AccordionContent>
            <Textarea value={introText} onChange={(e) => setIntroText(e.target.value)} rows={4} />
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="decl-landlord">
          <AccordionTrigger>Declaraciones del Arrendador</AccordionTrigger>
          <AccordionContent>
            <EditableList items={declLandlord} onChange={setDeclLandlord} />
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="decl-tenant">
          <AccordionTrigger>Declaraciones del Arrendatario</AccordionTrigger>
          <AccordionContent>
            <EditableList items={declTenant} onChange={setDeclTenant} />
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="clauses">
          <AccordionTrigger>Cláusulas del Contrato</AccordionTrigger>
          <AccordionContent>
            <ClausesEditor clauses={clauses} onChange={setClauses} />
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="checklist">
          <AccordionTrigger>Checklist — Anexo A</AccordionTrigger>
          <AccordionContent>
            <ChecklistEditor sections={checklistSections} onChange={setChecklistSections} />
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="pagare">
          <AccordionTrigger>Pagaré — Anexo B</AccordionTrigger>
          <AccordionContent>
            <Textarea value={pagareText} onChange={(e) => setPagareText(e.target.value)} rows={6} />
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
