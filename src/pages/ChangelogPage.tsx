import { useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { changelog, CURRENT_VERSION, type ChangelogEntry } from "@/lib/changelog";
import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";

type FilterType = "all" | "major" | "minor" | "patch";

const TYPE_LABELS: Record<ChangelogEntry["type"], string> = {
  major: "Mayor",
  minor: "Menor",
  patch: "Parche",
};

const TYPE_COLORS: Record<ChangelogEntry["type"], string> = {
  major: "bg-destructive text-destructive-foreground",
  minor: "bg-primary text-primary-foreground",
  patch: "bg-muted text-muted-foreground",
};

const DOT_COLORS: Record<ChangelogEntry["type"], string> = {
  major: "bg-destructive",
  minor: "bg-primary",
  patch: "bg-muted-foreground",
};

export default function ChangelogPage() {
  const [filter, setFilter] = useState<FilterType>("all");

  const filtered = filter === "all" ? changelog : changelog.filter((e) => e.type === filter);

  const filters: { value: FilterType; label: string }[] = [
    { value: "all", label: "Todos" },
    { value: "major", label: "Mayor" },
    { value: "minor", label: "Menor" },
    { value: "patch", label: "Parche" },
  ];

  return (
    <div className="p-6 space-y-6 max-w-3xl mx-auto">
      <PageHeader
        title="Historial de Cambios"
        subtitle={`Versión actual: v${CURRENT_VERSION}`}
      />

      <div className="flex gap-2 flex-wrap">
        {filters.map((f) => (
          <Button
            key={f.value}
            variant={filter === f.value ? "default" : "outline"}
            size="sm"
            onClick={() => setFilter(f.value)}
          >
            {f.label}
          </Button>
        ))}
      </div>

      <div className="relative">
        {/* Timeline line */}
        <div className="absolute left-4 top-0 bottom-0 w-px bg-border" />

        <div className="space-y-6">
          {filtered.map((entry) => (
            <div key={entry.version} className="relative pl-10">
              {/* Timeline dot */}
              <div className={`absolute left-2.5 top-6 h-3 w-3 rounded-full ring-2 ring-background ${DOT_COLORS[entry.type]}`} />

              <Card>
                <CardContent className="p-5 space-y-3">
                  <div className="flex items-center gap-3 flex-wrap">
                    <Badge className={TYPE_COLORS[entry.type]}>
                      v{entry.version}
                    </Badge>
                    <Badge variant="outline">{TYPE_LABELS[entry.type]}</Badge>
                    <span className="text-xs text-muted-foreground">
                      {format(parseISO(entry.date), "d 'de' MMMM, yyyy", { locale: es })}
                    </span>
                  </div>

                  <div>
                    <h3 className="font-semibold text-base">{entry.title}</h3>
                    <p className="text-sm text-muted-foreground mt-1">{entry.description}</p>
                  </div>

                  <ul className="space-y-1">
                    {entry.changes.map((change, i) => (
                      <li key={i} className="text-sm flex gap-2">
                        <span className="text-muted-foreground mt-1">•</span>
                        <span>{change}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
