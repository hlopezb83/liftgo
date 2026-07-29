import { describe, it, expect } from "vitest";
import type { Row } from "@tanstack/react-table";
import { createLiftgoSortingFn, liftgoSortingFn } from "../sorting";

interface Item {
  value: string | number | null | undefined;
}

function row(value: Item["value"]): Row<Item> {
  return { getValue: () => value } as unknown as Row<Item>;
}

/** Ordena aplicando el mismo signo que TanStack: niega el resultado en desc. */
function sortLike(values: Item["value"][], desc: boolean): Item["value"][] {
  const fn = createLiftgoSortingFn<Item>(() => desc);
  return [...values].sort((a, b) => {
    const r = fn(row(a), row(b), "value");
    return desc ? -r : r;
  });
}

describe("createLiftgoSortingFn", () => {
  it("ordena números de menor a mayor en ascendente", () => {
    expect(sortLike([3, 1, 2], false)).toEqual([1, 2, 3]);
  });

  it("ordena números de mayor a menor en descendente", () => {
    expect(sortLike([3, 1, 2], true)).toEqual([3, 2, 1]);
  });

  it("deja los nulos al final en ascendente", () => {
    expect(sortLike([2, null, 1], false)).toEqual([1, 2, null]);
  });

  it("deja los nulos al final también en descendente", () => {
    expect(sortLike([2, null, 1], true)).toEqual([2, 1, null]);
  });

  it("trata undefined igual que null", () => {
    expect(sortLike([2, undefined, 1], false)).toEqual([1, 2, undefined]);
    expect(sortLike([2, undefined, 1], true)).toEqual([2, 1, undefined]);
  });

  it("devuelve 0 cuando ambos valores son nulos", () => {
    const fn = createLiftgoSortingFn<Item>(() => false);
    expect(fn(row(null), row(undefined), "value")).toBe(0);
  });

  it("compara texto ignorando acentos y mayúsculas", () => {
    expect(sortLike(["Álvarez", "bravo", "acosta"], false)).toEqual([
      "acosta",
      "Álvarez",
      "bravo",
    ]);
  });

  it("compara texto con números de forma natural", () => {
    expect(sortLike(["FAC-10", "FAC-2", "FAC-1"], false)).toEqual([
      "FAC-1",
      "FAC-2",
      "FAC-10",
    ]);
  });

  it("liftgoSortingFn es la variante ascendente", () => {
    const asUnknown = (v: Item["value"]) => row(v) as unknown as Row<unknown>;
    expect(liftgoSortingFn(asUnknown(1), asUnknown(null), "value")).toBeGreaterThan(0);
    expect(liftgoSortingFn(asUnknown(null), asUnknown(1), "value")).toBeLessThan(0);
  });

});
