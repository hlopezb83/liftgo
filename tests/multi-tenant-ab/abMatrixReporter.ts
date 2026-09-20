/**
 * Reporter del gate A/B: escribe una matriz resumida de comprobaciones.
 *
 * Solo usa el TÍTULO del test y su estado. No toca el contexto sembrado, así
 * que el artifact no contiene tokens, credenciales, rutas de Storage ni UUID.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { FullResult, Reporter, TestCase, TestResult } from "@playwright/test/reporter";

type Row = { area: string; check: string; status: string };

const JSON_OUT = "reports/multitenant-ab-matrix.json";
const MD_OUT = "reports/multitenant-ab-matrix.md";

export default class AbMatrixReporter implements Reporter {
  private rows: Row[] = [];

  onTestEnd(test: TestCase, result: TestResult): void {
    this.rows.push({
      area: test.parent.title || "general",
      check: test.title,
      status: result.status,
    });
  }

  onEnd(result: FullResult): void {
    const payload = { status: result.status, generatedAt: new Date().toISOString(), rows: this.rows };
    for (const file of [JSON_OUT, MD_OUT]) mkdirSync(dirname(file), { recursive: true });
    writeFileSync(JSON_OUT, JSON.stringify(payload, null, 2));
    const md = [
      "# Matriz A/B multiempresa",
      "",
      `Resultado global: **${result.status}**`,
      "",
      "| Área | Comprobación | Estado |",
      "| --- | --- | --- |",
      ...this.rows.map((r) => `| ${r.area} | ${r.check} | ${r.status} |`),
      "",
      "Sin tokens, credenciales, rutas de Storage ni identificadores reales.",
      "",
    ].join("\n");
    writeFileSync(MD_OUT, md);
  }
}
