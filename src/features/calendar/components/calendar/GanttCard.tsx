import { ChevronLeftIcon, ChevronRightIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { GanttChart } from "./GanttChart";

export type MaintenanceWindow = { id: string; forklift_id: string; date: string; label: string };

interface GanttCardProps {
  rangeLabel: string;
  prevLabel: string;
  nextLabel: string;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
  forklifts: React.ComponentProps<typeof GanttChart>["forklifts"];
  bookings: React.ComponentProps<typeof GanttChart>["bookings"];
  rangeStart: Date;
  rangeEnd: Date;
  maintenanceWindows: MaintenanceWindow[];
}

/** Tarjeta del Gantt con la navegación de periodo (anterior / hoy / siguiente). */
export function GanttCard({
  rangeLabel, prevLabel, nextLabel, onPrev, onNext, onToday,
  forklifts, bookings, rangeStart, rangeEnd, maintenanceWindows,
}: GanttCardProps) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <CardTitle className="text-base">
          {rangeLabel ? rangeLabel.charAt(0).toUpperCase() + rangeLabel.slice(1) : rangeLabel}
        </CardTitle>
        <div className="flex gap-1">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" onClick={onPrev} aria-label={prevLabel}>
                <ChevronLeftIcon className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{prevLabel}</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="sm" onClick={onToday} aria-label="Ir a hoy">
                Hoy
              </Button>
            </TooltipTrigger>
            <TooltipContent>Ir a la fecha actual</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" onClick={onNext} aria-label={nextLabel}>
                <ChevronRightIcon className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{nextLabel}</TooltipContent>
          </Tooltip>
        </div>
      </CardHeader>
      <CardContent>
        <GanttChart
          forklifts={forklifts}
          bookings={bookings}
          rangeStart={rangeStart}
          rangeEnd={rangeEnd}
          maintenanceWindows={maintenanceWindows}
        />
      </CardContent>
    </Card>
  );
}
