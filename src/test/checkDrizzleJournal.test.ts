import { describe, expect, it } from "vitest";
import { collectJournalIssues, type JournalEntry } from "../../scripts/check-drizzle-journal";

const ok: JournalEntry[] = [
  { idx: 0, when: 100, tag: "0000_a" },
  { idx: 1, when: 200, tag: "0001_b" },
];

describe("collectJournalIssues", () => {
  it("no reporta hallazgos cuando journal y archivos coinciden", () => {
    expect(collectJournalIssues(["0000_a", "0001_b"], ok)).toEqual([]);
  });

  it("detecta archivos SQL sin entrada en el journal", () => {
    const issues = collectJournalIssues(["0000_a", "0001_b", "0002_c"], ok);
    expect(issues.some((i) => i.includes("0002_c"))).toBe(true);
  });

  it("detecta entradas del journal sin archivo SQL", () => {
    const issues = collectJournalIssues(["0000_a"], ok);
    expect(issues.some((i) => i.includes("sin archivo SQL"))).toBe(true);
  });

  it("detecta índices no continuos", () => {
    const issues = collectJournalIssues(
      ["0000_a", "0001_b"],
      [
        { idx: 0, when: 100, tag: "0000_a" },
        { idx: 2, when: 200, tag: "0001_b" },
      ],
    );
    expect(issues.some((i) => i.includes("continuos desde 0"))).toBe(true);
  });

  it("detecta `when` no entero y no creciente", () => {
    const noEntero = collectJournalIssues(
      ["0000_a", "0001_b"],
      [
        { idx: 0, when: 100, tag: "0000_a" },
        { idx: 1, when: "200", tag: "0001_b" },
      ],
    );
    expect(noEntero.some((i) => i.includes("no es entero"))).toBe(true);

    const noCreciente = collectJournalIssues(
      ["0000_a", "0001_b"],
      [
        { idx: 0, when: 200, tag: "0000_a" },
        { idx: 1, when: 200, tag: "0001_b" },
      ],
    );
    expect(noCreciente.some((i) => i.includes("estrictamente creciente"))).toBe(true);
  });

  it("detecta tags y archivos duplicados", () => {
    const issues = collectJournalIssues(
      ["0000_a", "0000_a"],
      [
        { idx: 0, when: 100, tag: "0000_a" },
        { idx: 1, when: 200, tag: "0000_a" },
      ],
    );
    expect(issues.some((i) => i.includes("Tags duplicados"))).toBe(true);
    expect(issues.some((i) => i.includes("Archivos SQL duplicados"))).toBe(true);
  });
});
