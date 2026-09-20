// Multiempresa (P1): classify-feedback-report corre con service_role, así que
// el aislamiento tiene que estar en el código. Estas pruebas son OFFLINE: no
// tocan red ni base de datos.
import {
  assertEquals,
  assertStrictEquals,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import { buildSupabaseMock } from "../_shared/test/supabaseClientMock.ts";
import {
  type ClassifyDeps,
  handleClassifyFeedbackReport,
} from "./handler.ts";

const ORG_A = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const REPORT_OTHER_ORG = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const USER = "cccccccc-cccc-cccc-cccc-cccccccccccc";

function makeReq(reportId: string, force = false): Request {
  return new Request("https://example.com/classify-feedback-report", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ report_id: reportId, force }),
  });
}

function buildDeps(
  mock: ReturnType<typeof buildSupabaseMock>,
  aiCalls: { n: number },
): ClassifyDeps {
  return {
    authenticate: () =>
      Promise.resolve({
        ok: true as const,
        userId: USER,
        adminClient: mock.client,
      }),
    enforceRateLimit: () => Promise.resolve(null),
    aiChat: () => {
      aiCalls.n += 1;
      return Promise.resolve({
        raw: null,
        text: JSON.stringify({
          severity: "low",
          module: "Facturas",
          reasoning: "prueba de aislamiento",
        }),
        toolArguments: null,
      });
    },
  };
}

Deno.test("classify: un report_id de otra empresa no llama a AI ni actualiza nada", async () => {
  const mock = buildSupabaseMock({
    selects: {
      organization_memberships: {
        data: [{ organization_id: ORG_A, member_type: "internal" }],
        error: null,
      },
      // La consulta filtra por organization_id: el reporte ajeno no aparece.
      feedback_reports: { data: null, error: null },
    },
  });
  const aiCalls = { n: 0 };

  const res = await handleClassifyFeedbackReport(
    makeReq(REPORT_OTHER_ORG),
    buildDeps(mock, aiCalls),
  );

  assertEquals(res.status, 404);
  assertStrictEquals(aiCalls.n, 0);
  assertEquals(mock.updates.length, 0);
  assertEquals(mock.uploads.length, 0);
});

Deno.test("classify: la lectura y la actualización filtran por organization_id", async () => {
  const reportId = "dddddddd-dddd-dddd-dddd-dddddddddddd";
  const mock = buildSupabaseMock({
    selects: {
      organization_memberships: {
        data: [{ organization_id: ORG_A, member_type: "internal" }],
        error: null,
      },
      feedback_reports: {
        data: {
          id: reportId,
          organization_id: ORG_A,
          type: "bug",
          title: "t",
          description: "d",
          reporter_type: "staff",
          severity: null,
          module: "Sin clasificar",
          context_json: {},
        },
        error: null,
      },
    },
  });
  const aiCalls = { n: 0 };

  const res = await handleClassifyFeedbackReport(
    makeReq(reportId),
    buildDeps(mock, aiCalls),
  );

  assertEquals(res.status, 200);
  assertStrictEquals(aiCalls.n, 1);
  const upd = mock.updates.find((u) => u.table === "feedback_reports");
  assertEquals(
    upd?.filters.some((f) => f.col === "organization_id" && f.val === ORG_A),
    true,
  );
});

Deno.test("classify: sin membresía interna falla cerrado y no consume AI", async () => {
  const mock = buildSupabaseMock({
    selects: { organization_memberships: { data: [], error: null } },
  });
  const aiCalls = { n: 0 };

  const res = await handleClassifyFeedbackReport(
    makeReq(REPORT_OTHER_ORG),
    buildDeps(mock, aiCalls),
  );

  assertEquals(res.status, 403);
  assertStrictEquals(aiCalls.n, 0);
  assertEquals(mock.updates.length, 0);
});

Deno.test("classify: error al resolver la empresa responde 503 (fail-closed)", async () => {
  const mock = buildSupabaseMock({
    selects: {
      organization_memberships: { data: null, error: { message: "down" } },
    },
  });
  const aiCalls = { n: 0 };

  const res = await handleClassifyFeedbackReport(
    makeReq(REPORT_OTHER_ORG),
    buildDeps(mock, aiCalls),
  );

  assertEquals(res.status, 503);
  assertStrictEquals(aiCalls.n, 0);
});
