import { Link as LinkIcon, AlertCircle, ChevronDown, ChevronRight } from "lucide-react";
import { notifyError, notifySuccess } from "@/lib/ui/appFeedback";

import { es } from "date-fns/locale";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useChangelogEntry } from "../../hooks/useChangelog";
import type { ChangelogIndexEntry } from "../../lib/changelog";
import { TYPE_LABELS, TYPE_COLORS, DOT_COLORS, CATEGORY_LABELS } from "../../lib/changelogConstants";
import { formatMtyDate } from "@/lib/utils";

interface Props {
  entry: ChangelogIndexEntry;
  expanded: boolean;
  onToggle: () => void;
  highlighted: boolean;
}

export function ChangelogEntryCard({ entry, expanded, onToggle, highlighted }: Props) {
  const { data: detail, isLoading: detailLoading, error: detailError } = useChangelogEntry(entry.version, expanded);

  const copyLink = (e: React.MouseEvent) => {
    e.stopPropagation();
    const url = `${window.location.origin}/changelog#v${entry.version}`;
    navigator.clipboard.writeText(url).then(
      () => notifySuccess("Enlace copiado"),
      () => notifyError({ message: "No se pudo copiar el enlace" }),
    );
  };

  return (
    <li id={`v${entry.version}`} className="relative pl-10 scroll-mt-20">
      <div
        className={`absolute left-2.5 top-6 h-3 w-3 rounded-full ring-2 ring-background ${DOT_COLORS[entry.type]}`}
        aria-hidden
      />
      <Card className={highlighted ? "ring-2 ring-primary transition-shadow" : "transition-shadow"}>
        <CardContent className="p-5 space-y-3">
          <button
            type="button"
            onClick={onToggle}
            className="w-full flex items-start gap-2 text-left"
            aria-expanded={expanded}
            aria-controls={`detail-${entry.version}`}
          >
            {expanded ? (
              <ChevronDown className="h-4 w-4 mt-1 text-muted-foreground flex-shrink-0" />
            ) : (
              <ChevronRight className="h-4 w-4 mt-1 text-muted-foreground flex-shrink-0" />
            )}
            <div className="flex-1 space-y-2">
              <div className="flex items-center gap-2 flex-wrap">
                <Badge className={TYPE_COLORS[entry.type]}>v{entry.version}</Badge>
                <Badge variant="outline">{TYPE_LABELS[entry.type]}</Badge>
                {entry.category && <Badge variant="secondary">{CATEGORY_LABELS[entry.category]}</Badge>}
                <span className="text-xs text-muted-foreground">
                  {formatMtyDate(entry.date, "d 'de' MMMM, yyyy", es)}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={copyLink}
                  className="h-6 px-2 ml-auto text-muted-foreground hover:text-foreground"
                  aria-label={`Copiar enlace a v${entry.version}`}
                >
                  <LinkIcon className="h-3 w-3" />
                </Button>
              </div>
              <h3 className="font-semibold text-base">{entry.title}</h3>
            </div>
          </button>

          {expanded && (
            <div id={`detail-${entry.version}`} className="pl-6 space-y-2">
              {detailLoading && (
                <>
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-3/4" />
                </>
              )}
              {detailError && (
                <p className="text-sm text-destructive flex items-center gap-2">
                  <AlertCircle className="h-4 w-4" /> No se pudo cargar el detalle
                </p>
              )}
              {detail && (
                <>
                  <p className="text-sm text-muted-foreground">{detail.description}</p>
                  <ul className="space-y-1">
                    {detail.changes.map((change, i) => (
                      <li key={i} className="text-sm flex gap-2">
                        <span className="text-muted-foreground mt-1">•</span>
                        <span>{change}</span>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </li>
  );
}
