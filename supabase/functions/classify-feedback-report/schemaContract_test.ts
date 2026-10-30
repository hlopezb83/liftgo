// Contratos del handler con Zod: fixtures locales, sin AI ni base reales.
import { assert, assertEquals } from "@std/assert";
import { buildSupabaseMock } from "../_shared/test/supabaseClientMock.ts";
import { type ClassifyDeps, handleClassifyFeedbackReport } from "./handler.ts";

const ORG = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const USER = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const REPORT = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const ORIGIN = "https://liftgo.lovable.app";
const classification = {
  severity: "low",
  module: "Facturas",
  reasoning: "Motivo de prueba",
};

function request(body: unknown): Request {
  return new Request("https://example.invalid/classify-feedback-report", {
    method: "POST",
    headers: { "content-type": "application/json", origin: ORIGIN },
    body: JSON.stringify(body),
  });
}

function fixture(
  aiResult: unknown = classification,
  context: Record<string, unknown> = {},
) {
  const calls = { ai: 0, reports: 0 };
  const mock = buildSupabaseMock({
    selects: {
      organizations: { data: [{ id: ORG, is_active: true }], error: null },
      organization_memberships: {
        data: [{ organization_id: ORG, member_type: "internal" }],
        error: null,
      },
    },
    selectsByFilter: {
      feedback_reports: () => {
        calls.reports++;
        return {
          data: {
            id: REPORT,
            organization_id: ORG,
            type: "bug",
            title: "Reporte sintético",
            description: "Descripción sintética",
            reporter_type: "staff",
            severity: null,
            module: "Sin clasificar",
            context_json: context,
          },
          error: null,
        };
      },
    },
    updatesSeq: {
      feedback_reports: [{ data: { id: REPORT }, error: null }],
    },
  });
  const deps: ClassifyDeps = {
    authenticate: (_req, roles) => {
      assertEquals(roles, ["admin", "administrativo"]);
      return Promise.resolve({
        ok: true,
        userId: USER,
        adminClient: mock.client,
      });
    },
    enforceRateLimit: () => Promise.resolve(null),
    aiChat: () => {
      calls.ai++;
      return Promise.resolve({
        raw: null,
        text: JSON.stringify(aiResult) ?? null,
        toolArguments: null,
      });
    },
    now: () => new Date("2026-10-30T00:00:00Z"),
  };
  return { mock, calls, deps };
}

for (
  const invalid of [
    { field: "report_id", body: { report_id: "invalid-uuid" } },
    { field: "force", body: { report_id: REPORT, force: "true" } },
  ]
) {
  Deno.test(`classify esquema: ${invalid.field} inválido conserva árbol 400 sin leer reporte ni AI`, async () => {
    const f = fixture();
    const response = await handleClassifyFeedbackReport(
      request(invalid.body),
      f.deps,
    );
    assertEquals(response.status, 400);
    assertEquals(response.headers.get("access-control-allow-origin"), ORIGIN);
    const body = await response.json();
    assertEquals(body.error, "Invalid body");
    assertEquals(body.detail.errors, []);
    assertEquals(Object.keys(body.detail.properties), [invalid.field]);
    const errors = body.detail.properties[invalid.field].errors;
    assertEquals(errors.length, 1);
    assert(typeof errors[0] === "string" && errors[0].length > 0);
    assertEquals(f.calls, { ai: 0, reports: 0 });
    assertEquals(f.mock.updates, []);
    assertEquals(f.mock.inserts, []);
    assertEquals(f.mock.uploads, []);
  });
}

Deno.test("classify esquema: force omitido conserva 409 y no reclasifica", async () => {
  const previous = {
    severity: "high",
    module: "Reservas",
    reasoning: "Previo",
  };
  const f = fixture(classification, { ai_classification: previous });
  const response = await handleClassifyFeedbackReport(
    request({ report_id: REPORT }),
    f.deps,
  );
  assertEquals(response.status, 409);
  assertEquals(response.headers.get("access-control-allow-origin"), ORIGIN);
  assertEquals(await response.json(), {
    error: "El reporte ya tiene clasificación AI; reintenta con force: true",
    detail: { ai_classification: previous },
  });
  assertEquals(f.calls, { ai: 0, reports: 1 });
  assertEquals(f.mock.updates, []);
});

for (
  const invalid of [
    {
      name: "severity desconocida",
      value: { ...classification, severity: "urgent" },
    },
    {
      name: "module desconocido",
      value: { ...classification, module: "No existe" },
    },
    {
      name: "reasoning menor de 5",
      value: { ...classification, reasoning: "x".repeat(4) },
    },
    {
      name: "reasoning mayor de 400",
      value: { ...classification, reasoning: "x".repeat(401) },
    },
  ]
) {
  Deno.test(`classify esquema: AI con ${invalid.name} conserva 502 sin persistir`, async () => {
    const f = fixture(invalid.value);
    const response = await handleClassifyFeedbackReport(
      request({ report_id: REPORT }),
      f.deps,
    );
    assertEquals(response.status, 502);
    assertEquals(response.headers.get("access-control-allow-origin"), ORIGIN);
    assertEquals(await response.json(), { error: "Respuesta de AI inválida" });
    assertEquals(f.calls, { ai: 1, reports: 1 });
    assertEquals(f.mock.updates, []);
  });
}

for (const length of [5, 400]) {
  Deno.test(`classify esquema: reasoning de ${length} caracteres se acepta y persiste con scope`, async () => {
    const expected = { ...classification, reasoning: "x".repeat(length) };
    const f = fixture(expected);
    const response = await handleClassifyFeedbackReport(
      request({ report_id: REPORT }),
      f.deps,
    );
    assertEquals(response.status, 200);
    assertEquals((await response.json()).classification, expected);
    assertEquals(f.calls, { ai: 1, reports: 1 });
    assertEquals(f.mock.updates.length, 1);
    assertEquals(f.mock.updates[0].filters, [
      { col: "id", val: REPORT },
      { col: "organization_id", val: ORG },
    ]);
    assertEquals(f.mock.updates[0].patch.context_json, {
      ai_classification: {
        ...expected,
        model: "google/gemini-2.5-flash",
        classified_at: "2026-10-30T00:00:00.000Z",
      },
    });
  });
}
