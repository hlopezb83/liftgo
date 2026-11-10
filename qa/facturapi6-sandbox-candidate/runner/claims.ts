// Claims durables del run en el bucket PRIVADO existente `cfdi-files`.
// Objetos creados con upsert:false bajo un prefijo exclusivo del run; nunca se
// sobrescriben ni se borran desde este código. `DURABLE_CLAIMS_GUARANTEED`
// sigue en false hasta revisión independiente (ver README, "Claims durables").
import { isRecord } from "./db.ts";
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

export interface StorageBucketLike {
  upload(path: string, body: Blob, opts: { upsert: false; contentType: string }): Promise<{ error: unknown }>;
  download(path: string): Promise<{ data: unknown; error: unknown }>;
}

const field = (e: unknown, k: string) => (isRecord(e) ? String(e[k] ?? "") : "");
const statusOf = (e: unknown) => field(e, "statusCode") || field(e, "status");
const isConflict = (e: unknown) =>
  statusOf(e) === "409" || /already exists|duplicate/i.test(field(e, "message"));
const isNotFound = (e: unknown) =>
  ["400", "404"].includes(statusOf(e)) && /not.?found/i.test(field(e, "message"));

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
    const body = new Blob(
      [JSON.stringify({ run_id: RUN_ID, at: new Date(this.now()).toISOString(), ...payload })],
      { type: "application/json" },
    );
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

  private consumeFailure(kind: "state" | "reserve" | "disable", code: string) {
    if (this.failNext !== kind) return;
    this.failNext = null;
    throw new ClaimUncertain(code);
  }

  state() {
    try {
      this.consumeFailure("state", "state_unreadable");
    } catch (e) {
      return Promise.reject(e);
    }
    return Promise.resolve(this.objects.has(DISABLED_OBJECT) ? "disabled" as const : "open" as const);
  }

  reserve(action: string, payload: Record<string, unknown>): Promise<ReserveResult> {
    try {
      this.consumeFailure("reserve", "claim_write_uncertain");
    } catch (e) {
      return Promise.reject(e);
    }
    const p = claimObject(action);
    if (this.objects.has(p)) return Promise.resolve("already_claimed");
    this.objects.set(p, payload);
    return Promise.resolve("reserved");
  }

  disable(reason: string) {
    try {
      this.consumeFailure("disable", "claim_write_uncertain");
    } catch (e) {
      return Promise.reject(e);
    }
    if (!this.objects.has(DISABLED_OBJECT)) this.objects.set(DISABLED_OBJECT, { reason });
    return Promise.resolve();
  }
}
