import { Link as LinkIcon, InfoAlertIcon, ChevronDownIcon, ChevronRightIcon } from "@/components/icons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { APP_LOCALE } from "@/lib/format/dateFormats";
import { notifyError, notifySuccess } from "@/lib/ui/appFeedback";
import { formatMtyDate } from "@/lib/utils";
import { useChangelogEntry } from "../../hooks/useChangelog";
import { TYPE_LABELS, TYPE_COLORS, DOT_COLORS, CATEGORY_LABELS } from "../../lib/changelogConstants";
import type { ChangelogIndexEntry } from "../../lib/changelog";
import type { MouseEvent as ReactMouseEvent } from "react";

interface Props {
  entry: ChangelogIndexEntry;
  expanded: boolean;
  onToggle: () => void;
  highlighted: boolean;
}

export function ChangelogEntryCard({ entry, expanded, onToggle, highlighted }: Props) {
  const { data: detail, isLoading: detailLoading, error: detailError } = useChangelogEntry(entry.version, expanded);

  const copyLink = (e: ReactMouseEvent) => {
    e.stopPropagation();
    const url = `${window.location.origin}/changelog#v${entry.version}`;
    navigator.clipboard.writeText(url).then(
      () => notifySuccess("Enlace copiado"),
      (err) => notifyError({ error: err, message: "No se pudo copiar el enlace" }),
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
          <div className="relative">
            <button
              type="button"
              onClick={onToggle}
              className="w-full flex items-start gap-2 text-left pr-10"
              aria-expanded={expanded}
              aria-controls={`detail-${entry.version}`}
            >
              {expanded ? (
                <ChevronDownIcon className="h-4 w-4 mt-1 text-muted-foreground flex-shrink-0" />
              ) : (
                <ChevronRightIcon className="h-4 w-4 mt-1 text-muted-foreground flex-shrink-0" />
              )}
              <div className="flex-1 space-y-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge className={TYPE_COLORS[entry.type]}>v{entry.version}</Badge>
                  <Badge variant="outline">{TYPE_LABELS[entry.type]}</Badge>
                  {entry.category && <Badge variant="secondary">{CATEGORY_LABELS[entry.category]}</Badge>}
                  <span className="text-xs text-muted-foreground">
                    {formatMtyDate(entry.date, "d 'de' MMMM, yyyy", APP_LOCALE)}
                  </span>
                </div>
                <h3 className="font-semibold text-base">{entry.title}</h3>
              </div>
            </button>
            {/* R7 Bloque 21.14: botón de copiar fuera del toggle para evitar nested <button>. */}
            <Button
              variant="ghost"
              size="sm"
              onClick={copyLink}
              className="absolute top-0 right-0 h-6 px-2 text-muted-foreground hover:text-foreground"
              aria-label={`Copiar enlace a v${entry.version}`}
            >
              <LinkIcon className="h-3 w-3" />
            </Button>
          </div>

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
                  <InfoAlertIcon className="h-4 w-4" /> No se pudo cargar el detalle
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
