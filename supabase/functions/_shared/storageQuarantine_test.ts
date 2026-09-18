import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  evaluateManualResolution,
  filterOrphanLedgerToApproved,
  makeApprovedOrphanKeySet,
  type ManualResolutionRecord,
  summarizeQuarantine,
} from "./storageQuarantine.ts";
import { summarizeOrphanOwnership } from "./storageOrphanOwner.ts";

const ORG = "2f3d0e7a-9b8c-4a56-8a22-41d9e8f0c123";

const entries = [
  {
    bucketId: "supplier-bill-cfdi-xml",
    resolution: {
      status: "resolved" as const,
      organizationId: ORG,
      method: "supplier_bill_cfdi_uuid" as const,
    },
  },
  {
    bucketId: "supplier-bill-cfdi-xml",
    resolution: { status: "unresolved" as const, reason: "no_match" as const },
  },
  {
    bucketId: "supplier-bill-cfdi-xml",
    resolution: {
      status: "unresolved" as const,
      reason: "incomplete_lookup" as const,
    },
  },
  {
    bucketId: "supplier-payment-receipts",
    resolution: {
      status: "conflict" as const,
      reason: "multiple_organizations" as const,
    },
  },
  {
    bucketId: "cfdi-files",
    resolution: {
      status: "unresolved" as const,
      reason: "unsupported_bucket" as const,
    },
  },
];

Deno.test("storageQuarantine: separa lo listo de lo que exige decisión manual", () => {
  const summary = summarizeQuarantine(
    entries,
    summarizeOrphanOwnership(entries),
  );
  assertEquals(summary.ready, 1);
  assertEquals(summary.total, 4);
  assertEquals(summary.by_reason, {
    owner_not_found: 1,
    owner_conflict: 1,
    unknown_organization: 0,
    incomplete_lookup: 1,
    unsupported_bucket: 1,
    invalid_path: 0,
  });
  assertEquals(
    summary.by_bucket.sort((a, b) => a.bucket.localeCompare(b.bucket)),
    [
      { bucket: "cfdi-files", quarantined: 1 },
      { bucket: "supplier-bill-cfdi-xml", quarantined: 2 },
      { bucket: "supplier-payment-receipts", quarantined: 1 },
    ],
  );
});

Deno.test("storageQuarantine: una lectura incompleta nunca cuenta como lista", () => {
  const summary = summarizeQuarantine([
    {
      bucketId: "supplier-bill-cfdi-xml",
      resolution: {
        status: "unresolved",
        reason: "incomplete_lookup",
      },
    },
  ]);
  assertEquals(summary.ready, 0);
  assertEquals(summary.total, 1);
  assertEquals(summary.by_reason.incomplete_lookup, 1);
});

Deno.test("storageQuarantine: sin objetos no hay cuarentena ni rutas expuestas", () => {
  const summary = summarizeQuarantine([]);
  assertEquals(summary.total, 0);
  assertEquals(summary.ready, 0);
  assertEquals(summary.by_bucket, []);
});

Deno.test("storageQuarantine: el resumen sólo contiene conteos agregados", () => {
  const summary = summarizeQuarantine(
    entries,
    summarizeOrphanOwnership(entries),
  );
  const serialized = JSON.stringify(summary);
  // Ni rutas, ni ids, ni tokens, ni URLs firmadas.
  assertEquals(serialized.includes(ORG), false);
  assertEquals(/https?:\/\//.test(serialized), false);
  assertEquals(/token/i.test(serialized), false);
  assertEquals(/\.(xml|pdf|jpg|png)/i.test(serialized), false);
  assertEquals(
    Object.keys(summary).sort(),
    ["by_bucket", "by_reason", "ready", "total"],
  );
  for (const bucket of summary.by_bucket) {
    assertEquals(Object.keys(bucket).sort(), ["bucket", "quarantined"]);
    assertEquals(typeof bucket.quarantined, "number");
  }
});

// --------------------------------------------------------------------------
// Resolución MANUAL explícita
// --------------------------------------------------------------------------

const OTHER_ORG = "8a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d";

function record(
  overrides: Partial<ManualResolutionRecord> = {},
): ManualResolutionRecord {
  return {
    bucket_id: "supplier-bill-cfdi-xml",
    source_path: "objeto-en-cuarentena.xml",
    organization_id: ORG,
    resolved_by: "operador@liftgo",
    justification: "Cotejado contra la factura del proveedor en bitácora.",
    revalidated_at: new Date().toISOString(),
    status: "active",
    ...overrides,
  };
}

const baseInput = {
  bucketId: "supplier-bill-cfdi-xml",
  sourcePath: "objeto-en-cuarentena.xml",
  derived: { status: "unresolved", reason: "no_match" } as const,
  activeOrganizationIds: [ORG],
  knownOrganizationIds: [ORG, OTHER_ORG],
};

Deno.test("manualResolution: sin registro nunca se autoriza la copia", () => {
  const decision = evaluateManualResolution({ ...baseInput, record: null });
  assertEquals(decision, {
    allowed: false,
    reason: "no_manual_resolution",
  });
});

Deno.test("manualResolution: registro activo, vigente y revalidado autoriza", () => {
  const decision = evaluateManualResolution({
    ...baseInput,
    record: record(),
  });
  assertEquals(decision, {
    allowed: true,
    organizationId: ORG,
    source: "manual_resolution",
  });
});

Deno.test("manualResolution: rechaza revocado, ajeno, inactivo y caduco", () => {
  assertEquals(
    evaluateManualResolution({
      ...baseInput,
      record: record({ status: "revoked" }),
    }),
    { allowed: false, reason: "revoked" },
  );
  assertEquals(
    evaluateManualResolution({
      ...baseInput,
      record: record({ source_path: "otro-objeto.xml" }),
    }),
    { allowed: false, reason: "identity_mismatch" },
  );
  assertEquals(
    evaluateManualResolution({
      ...baseInput,
      record: record({ organization_id: OTHER_ORG }),
    }),
    { allowed: false, reason: "inactive_organization" },
  );
  assertEquals(
    evaluateManualResolution({
      ...baseInput,
      record: record({
        organization_id: "0f0f0f0f-0f0f-4f0f-8f0f-0f0f0f0f0f0f",
      }),
    }),
    { allowed: false, reason: "unknown_organization" },
  );
  assertEquals(
    evaluateManualResolution({
      ...baseInput,
      record: record({
        revalidated_at: new Date(Date.now() - 48 * 60 * 60 * 1000)
          .toISOString(),
      }),
    }),
    { allowed: false, reason: "revalidation_expired" },
  );
  assertEquals(
    evaluateManualResolution({
      ...baseInput,
      record: record({ justification: "ok" }),
    }),
    { allowed: false, reason: "missing_justification" },
  );
});

Deno.test("manualResolution: una lectura incompleta invalida la decisión", () => {
  assertEquals(
    evaluateManualResolution({
      ...baseInput,
      derived: { status: "unresolved", reason: "incomplete_lookup" },
      record: record(),
    }),
    { allowed: false, reason: "incomplete_lookup" },
  );
});

Deno.test("manualResolution: no puede contradecir un dueño derivado", () => {
  assertEquals(
    evaluateManualResolution({
      ...baseInput,
      derived: {
        status: "resolved",
        organizationId: OTHER_ORG,
        method: "supplier_bill_cfdi_uuid",
      },
      record: record({ organization_id: ORG }),
    }),
    { allowed: false, reason: "contradicts_derived_owner" },
  );
});

Deno.test("manualResolution: la decisión es pura y no copia, actualiza ni borra", () => {
  const calls: string[] = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = ((input: RequestInfo | URL) => {
    calls.push(String(input));
    throw new Error("La evaluación de cuarentena no debe hacer E/S.");
  }) as typeof fetch;
  try {
    evaluateManualResolution({ ...baseInput, record: record() });
    evaluateManualResolution({ ...baseInput, record: null });
    summarizeQuarantine(entries, summarizeOrphanOwnership(entries));
  } finally {
    globalThis.fetch = originalFetch;
  }
  assertEquals(calls, []);
});

// --------------------------------------------------------------------------
// El ledger histórico NO autoriza: allowlist de esta ejecución
// --------------------------------------------------------------------------

interface FakeLedgerRow {
  id: string;
  bucket_id: string;
  source_path: string;
  organization_id: string;
  status: "planned" | "copied" | "failed";
}

/**
 * Réplica del recorrido real de `applyOrphanBatch`, sin E/S: pagina el ledger
 * y acumula filas aprobadas hasta llenar el lote o agotar las páginas. Con
 * allowlist vacía no se lee nada, así que `skipped` es 0 (nada se exploró).
 */
function simulateOrphanBatch(
  ledger: FakeLedgerRow[],
  approvedCandidates: Array<
    { bucketId: string; sourcePath: string; organizationId: string }
  >,
  batchSize = 100,
  pageSize = 2,
): { copied: string[]; skipped: number } {
  const approvedKeys = makeApprovedOrphanKeySet(approvedCandidates);
  if (approvedKeys.size === 0) return { copied: [], skipped: 0 };
  // Igual que la consulta real: `copied` es terminal y no entra al pendiente.
  const pending = ledger.filter((row) => row.status !== "copied");
  const collected: FakeLedgerRow[] = [];
  let skipped = 0;
  for (let offset = 0; offset < pending.length; offset += pageSize) {
    const page = pending.slice(offset, offset + pageSize);
    const { allowed, skipped: pageSkipped } = filterOrphanLedgerToApproved(
      page,
      approvedKeys,
    );
    skipped += pageSkipped;
    for (const row of allowed) {
      if (collected.length < batchSize) collected.push(row);
      else skipped++; // aprobada pero excede el lote
    }
    if (collected.length >= batchSize) break;
  }
  return { copied: collected.map((row) => row.id), skipped };
}

const LEDGER: FakeLedgerRow[] = [
  {
    id: "planned",
    bucket_id: "supplier-bill-cfdi-xml",
    source_path: "a.xml",
    organization_id: ORG,
    status: "planned",
  },
  {
    id: "copied",
    bucket_id: "supplier-bill-cfdi-xml",
    source_path: "b.xml",
    organization_id: ORG,
    status: "copied",
  },
  {
    id: "failed",
    bucket_id: "supplier-bill-cfdi-xml",
    source_path: "c.xml",
    organization_id: ORG,
    status: "failed",
  },
];

Deno.test("orphanBatch: con resolución vigente sí se procesa el objeto aprobado", () => {
  const result = simulateOrphanBatch(LEDGER, [
    {
      bucketId: "supplier-bill-cfdi-xml",
      sourcePath: "a.xml",
      organizationId: ORG,
    },
  ]);
  assertEquals(result.copied, ["planned"]);
  // La fila `copied` es terminal: ni se explora ni se cuenta como omitida.
  assertEquals(result.skipped, 1);
});

Deno.test("orphanBatch: resolución revocada/caduca deja el ledger viejo sin copiar", () => {
  // Primer apply: la resolución era válida y creó el ledger.
  const first = simulateOrphanBatch(LEDGER, [
    {
      bucketId: "supplier-bill-cfdi-xml",
      sourcePath: "a.xml",
      organizationId: ORG,
    },
  ]);
  assertEquals(first.copied, ["planned"]);

  // Segundo apply: la resolución fue revocada o caducó, así que no hay
  // candidatos aprobados. El ledger `planned/copied/failed` NO se procesa.
  for (
    const rejected of [
      record({ status: "revoked" }),
      record({
        revalidated_at: new Date(Date.now() - 48 * 60 * 60 * 1000)
          .toISOString(),
      }),
    ]
  ) {
    const decision = evaluateManualResolution({
      ...baseInput,
      record: rejected,
    });
    assertEquals(decision.allowed, false);
  }

  const second = simulateOrphanBatch(LEDGER, []);
  assertEquals(second.copied, []);
  // Allowlist vacía: no se lee el ledger, así que nada se cuenta como omitido.
  assertEquals(second.skipped, 0);
});

Deno.test("orphanBatch: una resolución que contradice al dueño derivado no rehabilita el ledger", () => {
  const decision = evaluateManualResolution({
    ...baseInput,
    derived: {
      status: "resolved",
      organizationId: OTHER_ORG,
      method: "supplier_bill_cfdi_uuid",
    },
    record: record(),
  });
  assertEquals(decision, {
    allowed: false,
    reason: "contradicts_derived_owner",
  });
  assertEquals(simulateOrphanBatch(LEDGER, []).copied, []);
});

Deno.test("orphanBatch: la empresa del ledger debe coincidir exactamente con la aprobada", () => {
  const result = simulateOrphanBatch(LEDGER, [
    {
      bucketId: "supplier-bill-cfdi-xml",
      sourcePath: "a.xml",
      organizationId: OTHER_ORG,
    },
  ]);
  assertEquals(result.copied, []);
  assertEquals(result.skipped, LEDGER.length);
});

Deno.test("orphanBatch: delete_sources no aprueba huérfanos (allowlist vacía)", () => {
  // `delete_sources` no carga resoluciones manuales ni candidatos huérfanos.
  const result = simulateOrphanBatch(LEDGER, []);
  assertEquals(result.copied, []);
  assertEquals(result.skipped, 0);
});

Deno.test("orphanBatch: filas no aprobadas antes que la aprobada no la ahogan (sin starvation)", () => {
  // Más filas revocadas/antiguas que el tamaño del lote, todas ANTES de la
  // única fila aprobada en el orden del ledger. Con un `.limit(batchSize)`
  // previo al filtrado, la aprobada jamás se procesaría.
  const stale: FakeLedgerRow[] = Array.from({ length: 6 }, (_, index) => ({
    id: `stale-${index}`,
    bucket_id: "supplier-bill-cfdi-xml",
    source_path: `stale-${index}.xml`,
    organization_id: ORG,
    status: "planned",
  }));
  const approvedRow: FakeLedgerRow = {
    id: "approved",
    bucket_id: "supplier-bill-cfdi-xml",
    source_path: "approved.xml",
    organization_id: ORG,
    status: "planned",
  };
  const ledger = [...stale, approvedRow];
  const batchSize = 3;

  const result = simulateOrphanBatch(
    ledger,
    [{
      bucketId: "supplier-bill-cfdi-xml",
      sourcePath: "approved.xml",
      organizationId: ORG,
    }],
    batchSize,
  );

  // La fila aprobada avanza aunque esté después de `batchSize` no aprobadas.
  assertEquals(result.copied, ["approved"]);
  // Las no aprobadas se omiten y no cambian (sus ids jamás aparecen en copied).
  assertEquals(result.skipped, stale.length);
  // Idempotente: una segunda corrida con la misma allowlist vuelve a omitir
  // las antiguas y sólo tomaría la aprobada (aquí ya procesada).
  const again = simulateOrphanBatch(ledger, [], batchSize);
  assertEquals(again.copied, []);
  assertEquals(again.skipped, 0);
});
