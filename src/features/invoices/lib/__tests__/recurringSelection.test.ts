// R8-05 / R8-12: la selección del asistente de facturas recurrentes debe
// reconciliarse contra el preview actual sin resucitar filas desmarcadas.
import { describe, it, expect } from "vitest";
import type { RecurringPreviewLine } from "../../hooks/invoices/recurring/usePreviewRecurringInvoices";
import {
  emptyRecurringSelection,
  reconcileRecurringSelection,
  recurringPreviewFingerprint,
  toggleRecurringGroup,
  toggleRecurringSelection,
} from "../recurringSelection";

function line(over: Partial<RecurringPreviewLine> & { bookingId: string }): RecurringPreviewLine {
  return {
    bookingCode: over.bookingId,
    customerId: "c1",
    customerName: "Acme",
    forkliftName: "MT-01",
    periodStart: "2026-08-01",
    periodEnd: "2026-08-31",
    periodLabel: "Agosto 2026",
    monthlyRate: 10000,
    billedAmount: 10000,
    isProrated: false,
    eligible: true,
    ...over,
  };
}

/** R9-18: la selección se llavea por reserva + periodo. */
const K = (id: string, start = "2026-08-01") => `${id}|${start}`;
const ids = (s: { selected: ReadonlySet<string> }) =>
  ids(s).map((k) => k.split("|")[0]).sort();

const reconcile = (
  prev: ReturnType<typeof emptyRecurringSelection>,
  lines: RecurringPreviewLine[],
  allowStale = false,
) => reconcileRecurringSelection(prev, lines, allowStale);

describe("reconcileRecurringSelection — estado inicial", () => {
  it("marca por defecto las reservas seleccionables y deja fuera las no elegibles", () => {
    const s = reconcile(emptyRecurringSelection(), [
      line({ bookingId: "a" }),
      line({ bookingId: "b", eligible: false, reason: "already_invoiced" }),
      line({ bookingId: "c", rateWarning: true }),
    ]);
    expect(ids(s)).toEqual(["a"]);
  });
});

describe("R8-12 — no resucitar lo que el usuario desmarcó", () => {
  it("un refresh del preview no vuelve a marcar la fila desmarcada", () => {
    const lines = [line({ bookingId: "a" }), line({ bookingId: "b" })];
    let s = reconcile(emptyRecurringSelection(), lines);
    s = toggleRecurringSelection(s, K("a"));
    expect(ids(s)).toEqual(["b"]);

    // Refresh idéntico.
    s = reconcile(s, lines);
    expect(ids(s)).toEqual(["b"]);
  });

  it("cuando otra fila desaparece, la desmarcada sigue desmarcada", () => {
    let s = reconcile(emptyRecurringSelection(), [
      line({ bookingId: "a" }),
      line({ bookingId: "b" }),
      line({ bookingId: "c" }),
    ]);
    s = toggleRecurringSelection(s, K("a"));
    s = reconcile(s, [line({ bookingId: "a" }), line({ bookingId: "b" })]);
    expect(ids(s)).toEqual(["b"]);
    expect(s.signatures[K("c")]).toBeUndefined();
  });

  it("activar la confirmación de tarifa sólo agrega las líneas con aviso", () => {
    const lines = [line({ bookingId: "a" }), line({ bookingId: "s", rateWarning: true })];
    let s = reconcile(emptyRecurringSelection(), lines, false);
    s = toggleRecurringSelection(s, K("a")); // el usuario excluye 'a'
    s = reconcile(s, lines, true);
    expect(ids(s)).toEqual(["s"]);

    // Y al apagarla, 'a' sigue excluida y 's' deja de ser seleccionable.
    s = reconcile(s, lines, false);
    expect(ids(s)).toEqual([]);
  });

  it("una línea con aviso desmarcada no vuelve al re-activar la confirmación", () => {
    const lines = [line({ bookingId: "s", rateWarning: true })];
    let s = reconcile(emptyRecurringSelection(), lines, true);
    expect(ids(s)).toEqual(["s"]);
    s = toggleRecurringSelection(s, K("s"));
    s = reconcile(s, lines, false);
    s = reconcile(s, lines, true);
    expect(ids(s)).toEqual([]);
  });
});

describe("R8-05 — selección obsoleta tras cambios del preview", () => {
  it("quita la selección de una fila que dejó de ser elegible", () => {
    let s = reconcile(emptyRecurringSelection(), [line({ bookingId: "a" }), line({ bookingId: "b" })]);
    s = reconcile(s, [
      line({ bookingId: "a", eligible: false, reason: "already_invoiced" }),
      line({ bookingId: "b" }),
    ]);
    expect(ids(s)).toEqual(["b"]);
  });

  it("purga ids que ya no existen en el preview", () => {
    let s = reconcile(emptyRecurringSelection(), [line({ bookingId: "a" })]);
    s = reconcile(s, [line({ bookingId: "z" })]);
    expect(ids(s)).toEqual(["z"]);
    expect(s.selected.has(K("a"))).toBe(false);
  });

  it("desmarca la fila cuyo periodo cambió y no la re-agrega sola", () => {
    let s = reconcile(emptyRecurringSelection(), [line({ bookingId: "a" })]);
    const moved = [line({ bookingId: "a", periodStart: "2026-09-01", periodEnd: "2026-09-30" })];
    s = reconcile(s, moved);
    expect(ids(s)).toEqual([]);
    s = reconcile(s, moved);
    expect(ids(s)).toEqual([]);
  });

  it("desmarca la fila cuyo monto facturable cambió", () => {
    let s = reconcile(emptyRecurringSelection(), [line({ bookingId: "a" })]);
    s = reconcile(s, [line({ bookingId: "a", billedAmount: 12500 })]);
    expect(ids(s)).toEqual([]);
  });

  it("el usuario puede volver a marcar la fila cambiada y ya persiste", () => {
    let s = reconcile(emptyRecurringSelection(), [line({ bookingId: "a" })]);
    const changed = [line({ bookingId: "a", billedAmount: 12500 })];
    s = reconcile(s, changed);
    s = toggleRecurringSelection(s, K("a"));
    s = reconcile(s, changed);
    expect(ids(s)).toEqual(["a"]);
  });
});

describe("toggleRecurringGroup", () => {
  it("desmarca todo el grupo y lo recuerda entre refrescos", () => {
    const lines = [line({ bookingId: "a" }), line({ bookingId: "b" }), line({ bookingId: "c" })];
    let s = reconcile(emptyRecurringSelection(), lines);
    s = toggleRecurringGroup(s, [K("a"), K("b")]);
    expect(ids(s)).toEqual(["c"]);
    s = reconcile(s, lines);
    expect(ids(s)).toEqual(["c"]);
    s = toggleRecurringGroup(s, [K("a"), K("b")]);
    expect(ids(s)).toEqual(["a", "b", "c"]);
  });
});

describe("recurringPreviewFingerprint", () => {
  it("cambia con el periodo, la elegibilidad y la confirmación de tarifa", () => {
    const base = [line({ bookingId: "a" })];
    const fp = recurringPreviewFingerprint(base, false);
    expect(recurringPreviewFingerprint(base, false)).toBe(fp);
    expect(recurringPreviewFingerprint([line({ bookingId: "a", billedAmount: 1 })], false)).not.toBe(fp);
    expect(recurringPreviewFingerprint([line({ bookingId: "a", eligible: false })], false)).not.toBe(fp);
    // Con aviso de tarifa y sin confirmar, la fila deja de ser seleccionable.
    expect(recurringPreviewFingerprint([line({ bookingId: "a", rateWarning: true })], false)).not.toBe(fp);
    // Confirmada, vuelve a ser seleccionable (misma huella que la base).
    expect(recurringPreviewFingerprint([line({ bookingId: "a", rateWarning: true })], true)).toBe(fp);
  });
});

describe("R9-01 — la intención sobrevive a la ausencia temporal de una reserva", () => {
  it("una fila desmarcada que desaparece y vuelve igual sigue desmarcada", () => {
    const all = [line({ bookingId: "a" }), line({ bookingId: "b" })];
    let s = reconcile(emptyRecurringSelection(), all);
    s = toggleRecurringSelection(s, K("a"));
    // 'a' desaparece del preview (refetch parcial) y luego regresa idéntica.
    s = reconcile(s, [line({ bookingId: "b" })]);
    s = reconcile(s, all);
    expect(ids(s)).toEqual(["b"]);
    expect(s.deselected.has(K("a"))).toBe(true);
  });

  it("una fila marcada que desaparece y vuelve igual sigue marcada", () => {
    const all = [line({ bookingId: "a" }), line({ bookingId: "b" })];
    let s = reconcile(emptyRecurringSelection(), all);
    s = reconcile(s, [line({ bookingId: "b" })]);
    s = reconcile(s, all);
    expect(ids(s)).toEqual(["a", "b"]);
  });

  it("si reaparece con firma distinta exige re-aprobación manual (R8-05)", () => {
    const all = [line({ bookingId: "a" }), line({ bookingId: "b" })];
    let s = reconcile(emptyRecurringSelection(), all);
    s = reconcile(s, [line({ bookingId: "b" })]);
    s = reconcile(s, [line({ bookingId: "a", billedAmount: 12345 }), line({ bookingId: "b" })]);
    expect(ids(s)).toEqual(["b"]);
    s = toggleRecurringSelection(s, K("a"));
    expect(ids(s)).toEqual(["a", "b"]);
  });

  it("un refresh normal conserva selección y desmarcados", () => {
    const all = [line({ bookingId: "a" }), line({ bookingId: "b" })];
    let s = reconcile(emptyRecurringSelection(), all);
    s = toggleRecurringSelection(s, K("b"));
    s = reconcile(s, all);
    s = reconcile(s, all);
    expect(ids(s)).toEqual(["a"]);
    expect(s.deselected.has(K("b"))).toBe(true);
  });
});

describe("R9-18 — selección por reserva + periodo", () => {
  const p1 = line({ bookingId: "a" });
  const p2 = line({
    bookingId: "a",
    periodStart: "2026-09-01",
    periodEnd: "2026-09-30",
    periodLabel: "Septiembre 2026",
  });

  it("dos periodos de la misma reserva se seleccionan por separado", () => {
    let s = reconcile(emptyRecurringSelection(), [p1, p2]);
    expect([...s.selected].sort()).toEqual([K("a"), K("a", "2026-09-01")]);

    s = toggleRecurringSelection(s, K("a", "2026-09-01"));
    expect([...s.selected]).toEqual([K("a")]);

    // Un refresh no resucita el periodo excluido ni afecta al otro.
    s = reconcile(s, [p1, p2]);
    expect([...s.selected]).toEqual([K("a")]);
  });

  it("‘seleccionar todos’ opera sobre las filas visibles del grupo", () => {
    let s = reconcile(emptyRecurringSelection(), [p1, p2]);
    s = toggleRecurringGroup(s, [K("a"), K("a", "2026-09-01")]);
    expect([...s.selected]).toEqual([]);
    s = toggleRecurringGroup(s, [K("a"), K("a", "2026-09-01")]);
    expect([...s.selected].sort()).toEqual([K("a"), K("a", "2026-09-01")]);
  });
});
