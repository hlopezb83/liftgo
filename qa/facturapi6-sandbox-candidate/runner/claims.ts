// Claims durables del run en el bucket PRIVADO existente `cfdi-files`.
// Objetos creados con upsert:false bajo un prefijo exclusivo del run; nunca se
// sobrescriben ni se borran desde este código. Ver README, "Claims durables":
// el almacenamiento existente NO garantiza inmutabilidad (service_role puede
// actualizar/borrar y existe una herramienta de migración de prefijos), por eso
// `DURABLE_CLAIMS_GUARANTEED` es false y las fases de escritura no se abren.
import { RUN_ID } from "./policy.ts";

export const CLAIM_BUCKET = "cfdi-files";
/** Prefijo SIN organización: la RLS de usuarios no lo alcanza (sólo servicio). */
export const CLAIM_PREFIX = `qa-fx6-sandbox/${RUN_ID}`;
export const DISABLED_OBJECT = `${CLAIM_PREFIX}/disabled.json`;
export const claimObject = (action: string) => `${CLAIM_PREFIX}/claims/${action}.json`;

export type ReserveResult = "reserved" | "already_claimed";

export interface ClaimStore {
  /** "open" sólo si se confirmó que no existe el marcador de cierre. */
  state(): Promise<"open" | "disabled">;
  /** Reserva única. Lanza ante cualquier incertidumbre. */
  reserve(action: string, payload: Record<string, unknown>): Promise<ReserveResult>;
  /** Cierre irreversible. Idempotente: si ya existe, sigue cerrado. */
  disable(reason: string): Promise<void>;
}

export class ClaimUncertain extends Error {}

interface StorageBucketLike {
  upload(path: string, body: Blob, opts: { upsert: false; contentType: string }): Promise<{ error: any }>;
  download(path: string): Promise<{ data: unknown; error: any }>;
}

const isConflict = (e: any) =>
  String(e?.statusCode ?? e?.status ?? "") === "409" || /already exists|duplicate/i.test(String(e?.message ?? ""));
const isNotFound = (e: any) =>
  ["400", "404"].includes(String(e?.statusCode ?? e?.status ?? "")) && /not.?found/i.test(String(e?.message ?? ""));

export class StorageClaimStore implements ClaimStore {
  constructor(private bucket: StorageBucketLike, private now: () => number) {}

  async state(): Promise<"open" | "disabled"> {
    let r;
    try {
      r = await this.bucket.download(DISABLED_OBJECT);
    } catch {
      throw new ClaimUncertain("state_unreadable");
    }
    if (!r.error) return "disabled";
    if (isNotFound(r.error)) return "open";
    throw new ClaimUncertain("state_unreadable");
  }

  private async create(path: string, payload: Record<string, unknown>): Promise<ReserveResult> {
    const body = new Blob([JSON.stringify({ run_id: RUN_ID, at: new Date(this.now()).toISOString(), ...payload })], {
      type: "application/json",
    });
    let r;
    try {
      r = await this.bucket.upload(path, body, { upsert: false, contentType: "application/json" });
    } catch {
      throw new ClaimUncertain("claim_write_uncertain");
    }
    if (!r.error) return "reserved";
    if (isConflict(r.error)) return "already_claimed";
    throw new ClaimUncertain("claim_write_uncertain");
  }

  reserve(action: string, payload: Record<string, unknown>) {
    return this.create(claimObject(action), { action, ...payload });
  }

  async disable(reason: string) {
    await this.create(DISABLED_OBJECT, { reason });
  }
}

/** Doble en memoria para pruebas: mismas semánticas de crear-una-vez. */
export class MemoryClaimStore implements ClaimStore {
  objects = new Map<string, Record<string, unknown>>();
  failNext: "state" | "reserve" | "disable" | null = null;
  async state() {
    if (this.failNext === "state") { this.failNext = null; throw new ClaimUncertain("state_unreadable"); }
    return this.objects.has(DISABLED_OBJECT) ? "disabled" as const : "open" as const;
  }
  async reserve(action: string, payload: Record<string, unknown>): Promise<ReserveResult> {
    if (this.failNext === "reserve") { this.failNext = null; throw new ClaimUncertain("claim_write_uncertain"); }
    const p = claimObject(action);
    if (this.objects.has(p)) return "already_claimed";
    this.objects.set(p, payload);
    return "reserved";
  }
  async disable(reason: string) {
    if (this.failNext === "disable") { this.failNext = null; throw new ClaimUncertain("claim_write_uncertain"); }
    if (!this.objects.has(DISABLED_OBJECT)) this.objects.set(DISABLED_OBJECT, { reason });
  }
}
