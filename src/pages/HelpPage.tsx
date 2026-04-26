import { useState } from "react";
import { Book, RefreshCw, Search, FileText, HelpCircle } from "lucide-react";
import { format } from "date-fns";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useUserManual } from "@/hooks/useUserManual";
import { useUserRole } from "@/hooks/useUserRole";

/** Simple Markdown → HTML renderer (no deps) */
function renderMarkdown(md: string): string {
  const html = md
    .replace(/^#### (.+)$/gm, '<h4 class="text-sm font-semibold mt-4 mb-1">$1</h4>')
    .replace(/^### (.+)$/gm, '<h3 class="text-base font-semibold mt-5 mb-2">$1</h3>')
    .replace(/^## (.+)$/gm, '<h2 class="text-lg font-bold mt-6 mb-2">$1</h2>')
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(
      /^> (.+)$/gm,
      '<div class="border-l-4 border-primary/40 bg-muted/50 pl-3 py-1 my-2 text-sm rounded-r">$1</div>'
    )
    .replace(/^(\d+)\. (.+)$/gm, '<li class="ml-5 list-decimal text-sm leading-relaxed">$2</li>')
    .replace(/^[-•] (.+)$/gm, '<li class="ml-5 list-disc text-sm leading-relaxed">$1</li>')
    .replace(/\n\n/g, '</p><p class="text-sm leading-relaxed mb-2">')
    .replace(/\n/g, "<br/>");

  return `<div class="prose-manual"><p class="text-sm leading-relaxed mb-2">${html}</p></div>`;
}

function HelpPage() {
  const { manual, isLoading, generate, isGenerating, versions, selectedVersion, setSelectedVersion } = useUserManual();
  const { data: role } = useUserRole();
  const [search, setSearch] = useState("");
  const isAdmin = role === "admin";

  const filteredSections = manual?.content?.filter((s) =>
    search === "" ||
    s.title.toLowerCase().includes(search.toLowerCase()) ||
    s.content.toLowerCase().includes(search.toLowerCase())
  ) ?? [];

  if (isLoading) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-10 w-full" />
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-14 w-full" />
        ))}
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
              <Book className="h-6 w-6" />
              Manual de Usuario v{manual?.version || "1.0"}
            </h1>
            <p className="text-sm text-muted-foreground">
              {manual
                ? `Generado el ${format(new Date(manual.generated_at), "dd/MM/yyyy")}`
                : "Aún no se ha generado el manual"}
            </p>
          </div>
          {versions.length > 1 && (
            <Select
              value={selectedVersion ?? "latest"}
              onValueChange={(val) => setSelectedVersion(val === "latest" ? null : val)}
            >
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Versión" />
              </SelectTrigger>
              <SelectContent>
                {versions.map((v, i) => (
                  <SelectItem key={v.id} value={i === 0 ? "latest" : v.id}>
                    v{v.version} {i === 0 ? "(actual)" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
        {isAdmin && (
          <Button onClick={() => generate()} disabled={isGenerating} size="sm">
            <RefreshCw className={`h-4 w-4 mr-2 ${isGenerating ? "animate-spin" : ""}`} />
            {isGenerating ? "Generando…" : manual ? "Regenerar" : "Generar Manual"}
          </Button>
        )}
      </div>

      {isGenerating && (
        <Card>
          <CardContent className="py-12 flex flex-col items-center gap-4 text-center">
            <RefreshCw className="h-10 w-10 animate-spin text-primary" />
            <div>
              <p className="font-semibold text-lg">Generando manual con IA…</p>
              <p className="text-sm text-muted-foreground">
                Esto puede tomar entre 30 segundos y 1 minuto. No cierres esta página.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {!manual && !isGenerating && (
        <Card>
          <CardContent className="py-12 flex flex-col items-center gap-4 text-center">
            <HelpCircle className="h-12 w-12 text-muted-foreground" />
            <div>
              <p className="font-semibold text-lg">No hay manual generado</p>
              <p className="text-sm text-muted-foreground">
                {isAdmin
                  ? 'Haz clic en "Generar Manual" para crear la documentación con IA.'
                  : "Un administrador debe generar el manual primero."}
              </p>
            </div>
            {isAdmin && (
              <Button onClick={() => generate()}>
                <FileText className="h-4 w-4 mr-2" />
                Generar Manual
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      {manual && !isGenerating && (
        <>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar en el manual…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>

          {filteredSections.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">
              No se encontraron secciones que coincidan con "{search}"
            </p>
          ) : (
            <Accordion type="multiple" className="space-y-2">
              {filteredSections.map((section, idx) => (
                <AccordionItem
                  key={idx}
                  value={`section-${idx}`}
                  className="border rounded-lg px-4 bg-card"
                >
                  <AccordionTrigger className="text-left font-semibold">
                    <span className="flex items-center gap-2">
                      <FileText className="h-4 w-4 text-primary shrink-0" />
                      {section.title}
                    </span>
                  </AccordionTrigger>
                  <AccordionContent>
                    <div
                      className="manual-content"
                      dangerouslySetInnerHTML={{ __html: renderMarkdown(section.content) }}
                    />
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          )}
        </>
      )}
    </div>
  );
}

export default HelpPage;
