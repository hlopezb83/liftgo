import { QueryErrorState } from "@/components/feedback/QueryErrorState";
import { TableSkeleton } from "@/components/feedback/TableSkeleton";
import { InfoIcon } from "@/components/icons";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useDefaultContractTemplate } from "@/features/contracts";
import { useUserRole } from "@/features/users";
import { LegalTemplateOverridesForm } from "./contractTemplate/LegalTemplateOverridesForm";

function TextList({ items }: { items: string[] }) {
  return (
    <ul className="list-disc space-y-1 pl-5 text-sm">
      {items.map((item, index) => <li key={`${index}-${item.slice(0, 20)}`}>{item}</li>)}
    </ul>
  );
}

export function ContractTemplateTab() {
  const { data: template, isLoading, isError, refetch } = useDefaultContractTemplate();
  const { data: role } = useUserRole();

  if (isLoading) return <TableSkeleton />;
  if (isError) {
    return <QueryErrorState bare entity="la plantilla legal LiftGo" onRetry={() => { void refetch(); }} />;
  }
  if (!template) {
    return <p className="p-4 text-muted-foreground">Tu organización no tiene una versión legal asignada.</p>;
  }

  return (
    <div className="mt-4 space-y-4">
      <Card className="border-primary/20 bg-primary/5">
        <CardContent className="flex gap-3 pt-4 text-sm">
          <InfoIcon className="mt-0.5 h-4 w-4 shrink-0" />
          <p>
            Esta plantilla es el machote legal compartido de LiftGo. Sólo plataforma publica
            nuevas versiones. Cada empresa administra únicamente sus datos locales permitidos.
          </p>
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center gap-2">
        <h3 className="font-semibold">{template.name}</h3>
        <Badge>Versión {template.version}</Badge>
        <Badge variant="outline" className="font-mono text-[10px]">
          SHA-256 {template.checksum_sha256.slice(0, 12)}…
        </Badge>
      </div>

      <LegalTemplateOverridesForm
        key={`${template.id}-${JSON.stringify(template.local_overrides)}`}
        definitionId={template.id}
        overrides={template.local_overrides}
        canEdit={role === "admin" || role === "administrativo"}
      />

      <Card>
        <CardHeader><CardTitle className="text-base">Introducción</CardTitle></CardHeader>
        <CardContent className="whitespace-pre-wrap text-sm">{template.intro_text}</CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle className="text-base">Declaraciones del arrendador</CardTitle></CardHeader>
        <CardContent><TextList items={template.declarations_landlord} /></CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle className="text-base">Declaraciones del arrendatario</CardTitle></CardHeader>
        <CardContent><TextList items={template.declarations_tenant} /></CardContent>
      </Card>
      <div className="space-y-3">
        {template.clauses.map((clause, index) => (
          <Card key={`${index}-${clause.title}`}>
            <CardHeader><CardTitle className="text-base">{clause.title}</CardTitle></CardHeader>
            <CardContent className="whitespace-pre-wrap text-sm">{clause.body}</CardContent>
          </Card>
        ))}
      </div>
      <Card>
        <CardHeader><CardTitle className="text-base">Pagaré — Anexo B</CardTitle></CardHeader>
        <CardContent className="whitespace-pre-wrap text-sm">{template.pagare_text}</CardContent>
      </Card>
    </div>
  );
}

