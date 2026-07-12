import { RefreshIcon, HelpIcon, DocumentIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export function ManualGeneratingCard() {
  return (
    <Card>
      <CardContent className="py-12 flex flex-col items-center gap-4 text-center">
        <RefreshIcon className="h-10 w-10 animate-spin text-primary" />
        <div>
          <p className="font-semibold text-lg">Generando manual con IA…</p>
          <p className="text-sm text-muted-foreground">
            Esto puede tomar entre 30 segundos y 1 minuto. No cierres esta página.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

export function ManualEmptyCard({ isAdmin, onGenerate }: { isAdmin: boolean; onGenerate: () => void }) {
  return (
    <Card>
      <CardContent className="py-12 flex flex-col items-center gap-4 text-center">
        <HelpIcon className="h-12 w-12 text-muted-foreground" />
        <div>
          <p className="font-semibold text-lg">No hay manual generado</p>
          <p className="text-sm text-muted-foreground">
            {isAdmin
              ? 'Haz clic en "Generar Manual" para crear la documentación con IA.'
              : "Un administrador debe generar el manual primero."}
          </p>
        </div>
        {isAdmin && (
          <Button onClick={onGenerate}>
            <DocumentIcon className="h-4 w-4 mr-2" />
            Generar Manual
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
