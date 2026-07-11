import { DocumentIcon, SearchIcon } from "@/components/icons";
import { Input } from "@/components/ui/input";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { renderSafeMarkdown } from "../lib/markdown";

interface Section { title: string; content: string }
interface Props {
  search: string;
  onSearchChange: (v: string) => void;
  sections: Section[];
}

export function ManualSections({ search, onSearchChange, sections }: Props) {
  return (
    <>
      <div className="relative">
        <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Buscar en el manual…"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          className="pl-9"
        />
      </div>

      {sections.length === 0 ? (
        <p className="text-center text-muted-foreground py-8">
          No se encontraron secciones que coincidan con "{search}"
        </p>
      ) : (
        <Accordion type="multiple" className="space-y-2">
          {sections.map((section, idx) => (
            <AccordionItem
              key={idx}
              value={`section-${idx}`}
              className="border rounded-lg px-4 bg-card"
            >
              <AccordionTrigger className="text-left font-semibold">
                <span className="flex items-center gap-2">
                  <DocumentIcon className="h-4 w-4 text-primary shrink-0" />
                  {section.title}
                </span>
              </AccordionTrigger>
              <AccordionContent>
                <div
                  className="manual-content"
                  dangerouslySetInnerHTML={{ __html: renderSafeMarkdown(section.content) }}
                />
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      )}
    </>
  );
}
