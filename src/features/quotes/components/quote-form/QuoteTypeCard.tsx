import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface Props {
  value: string;
  onChange: (v: string) => void;
}

export function QuoteTypeCard({ value, onChange }: Props) {
  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Tipo de Cotización</CardTitle></CardHeader>
      <CardContent>
        <Tabs value={value} onValueChange={onChange}>
          <TabsList className="w-full">
            <TabsTrigger value="rental" className="flex-1">Renta</TabsTrigger>
            <TabsTrigger value="sale" className="flex-1">Venta</TabsTrigger>
          </TabsList>
        </Tabs>
      </CardContent>
    </Card>
  );
}
