import { expect, it } from "vitest";
import { withAccountantColumns } from "../sheetColumns";

it("puts accounting fields first without removing or altering source data", () => {
  const row = { "Empresa ID": "org", ID: "00012", Alcance: "Periodo", Folio: "00017", Fecha: "2026-10-01", Cliente: "=not-a-formula", "Total original": 116, Extra: "keep me" };
  const result = withAccountantColumns({ name: "Ventas", headers: ["Empresa ID", "Alcance", "ID"], rows: [row] });
  expect(result.rows[0]).toBe(row);
  expect(result.headers?.slice(0, 4)).toEqual(["Folio", "Fecha", "Vencimiento", "Cliente"]);
  expect(result.headers?.slice(-3)).toEqual(["Empresa ID", "Alcance", "ID"]);
  expect(result.headers).toContain("Extra");
  expect(new Set(result.headers).size).toBe(result.headers?.length);
});

it("gives empty authorized sections meaningful headers, without fake zero records", () => {
  const result = withAccountantColumns({ name: "Compras", rows: [] });
  expect(result.headers).toContain("Total original");
  expect(result.headers).toContain("Proveedor RFC actual");
  expect(result.rows).toEqual([]);
});

it("does not change an unrelated sheet or invent its schema", () => {
  const sheet = { name: "Control", rows: [{ Concepto: "Empresa", Valor: "QA" }] };
  expect(withAccountantColumns(sheet)).toBe(sheet);
});
