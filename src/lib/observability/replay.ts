import { addIntegration, addEventProcessor } from "@sentry/react";
import { replayIntegration, type ReplayFrameEvent } from "@sentry/replay";
import { scrubData, scrubEvent } from "./scrubPII";

export function scrubReplayFrame(event: ReplayFrameEvent): ReplayFrameEvent | null {
  // No conservar argumentos de console ni selectores/texto de interacciones.
  const raw = JSON.stringify(event.data);
  if (/"(?:category|tag)":"(?:console|ui\.input|ui\.click)(?:\.|"|$)/.test(raw)) return null;
  return { ...event, data: scrubData(event.data) } as ReplayFrameEvent;
}

export function installReplay(): void {
  // Los metadatos de replay no pasan por beforeSend.
  addEventProcessor(scrubEvent);
  addIntegration(replayIntegration({
    maskAllText: true,
    maskAllInputs: true,
    maskAttributes: ["title", "alt", "placeholder", "aria-label", "href", "src", "data-customer-id", "data-email"],
    blockAllMedia: true,
    stickySession: false,
    networkDetailAllowUrls: [],
    networkCaptureBodies: false,
    mask: ["[data-sentry-mask]"],
    block: ["[data-sentry-block]"],
    beforeAddRecordingEvent: scrubReplayFrame,
  }));
}
