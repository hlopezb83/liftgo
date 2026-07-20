import { WarnIcon } from "@/components/icons";
import { FormPageHeader } from "@/components/layout/FormPageHeader";
import { PageContainer } from "@/components/layout/PageContainer";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

interface Props {
  totalAssigned: number;
  totalRequired: number;
  missingByLine: { index: number; description: string; assigned: number; required: number }[];
  onGoToQuote: () => void;
  onBack: () => void;
}

export function SaleAssignmentBlocked({
  totalAssigned,
  totalRequired,
  missingByLine,
  onGoToQuote,
  onBack,
}: Props) {
  return (
    <PageContainer maxWidth="wide">
      <FormPageHeader title="Nueva Factura" />
      <Alert variant="destructive" className="mt-6">
        <WarnIcon className="h-5 w-5" />
        <AlertTitle>
          Asigna los equipos del inventario antes de facturar ({totalAssigned}/{totalRequired})
        </AlertTitle>
        <AlertDescription className="mt-2 space-y-2">
          <p>Las siguientes partidas de venta tienen equipos pendientes de asignación:</p>
          <ul className="list-disc pl-5">
            {missingByLine.map((line) => (
              <li key={line.index}>
                {line.description}: {line.assigned}/{line.required}
              </li>
            ))}
          </ul>
        </AlertDescription>
      </Alert>
      <div className="flex gap-3 mt-4">
        <Button onClick={onGoToQuote}>Ir a la cotización</Button>
        <Button variant="outline" onClick={onBack}>Volver</Button>
      </div>
    </PageContainer>
  );
}
