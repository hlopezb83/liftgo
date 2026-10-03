import type { DenoOptions, ErrorEvent } from "npm:@sentry/deno@10.76.0";
import { createEdgeObserver } from "./edgeSentry.ts";

/** Sólo pruebas: ningún fetch/telemetría real, aun cuando el handler falle. */
export function memoryObserver(
  overrides: Partial<Parameters<typeof createEdgeObserver>[0]> = {},
) {
  const events: ErrorEvent[] = [];
  const options: DenoOptions = {
    dsn: "https://public@example.invalid/1",
    environment: "test",
    release: "liftgo-cloud@test",
    transport: () => ({
      send(envelope) {
        for (const [header, payload] of envelope[1]) {
          if (header.type === "event") events.push(payload as ErrorEvent);
        }
        return Promise.resolve({ statusCode: 200 });
      },
      flush: () => Promise.resolve(true),
    }),
  };
  return {
    ...createEdgeObserver({ options: () => options, ...overrides }),
    events,
    options,
  };
}

export const ACTOR_A = "10000000-0000-4000-8000-000000000001";
export const ACTOR_B = "10000000-0000-4000-8000-000000000002";
export const ORG_A = "20000000-0000-4000-8000-000000000001";
export const ORG_B = "20000000-0000-4000-8000-000000000002";
