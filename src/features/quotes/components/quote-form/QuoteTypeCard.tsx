import { Card, CardContent, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface Props {
  value: string;
  onChange: (v: string) => void;
}

export function QuoteTypeCard({ value, onChange }: Props) {
  // V26-07: el bloque ocupaba ~136px de alto para dos opciones. Se compacta
  // fusionando encabezado y control en una sola fila (sin CardHeader propio),
  // conservando el título como etiqueta accesible de las pestañas.
  return (
    <Card>
      <CardContent className="p-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
        <CardTitle id="quote-type-label" className="text-base shrink-0">Tipo de Cotización</CardTitle>
        <Tabs value={value} onValueChange={onChange} className="flex-1">
          <TabsList className="w-full" aria-labelledby="quote-type-label">
            <TabsTrigger value="rental" className="flex-1">Renta</TabsTrigger>
            <TabsTrigger value="sale" className="flex-1">Venta</TabsTrigger>
          </TabsList>
        </Tabs>
      </CardContent>
    </Card>
  );
}
