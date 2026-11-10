import { fmtMx } from "./periods.ts";
import { loadRecurringPlanningData } from "./planningData.ts";
import {
  createRecurringPerformance,
  type RecurringPerformance,
} from "./performance.ts";
import { planRecurringInvoices } from "./planner.ts";
import { fiscalSnapshot, previewFingerprint } from "./planFingerprint.ts";
import type { PlanItem, RecurringPlan } from "./planTypes.ts";
import { assertNoLegacyVat } from "../_shared/legacyVat.ts";
import { requireServiceOrRole } from "../_shared/auth.ts";
import { handleCors } from "../_shared/cors.ts";
import { authenticateCronRequest } from "../_shared/cronAuth.ts";
import { jsonError, jsonResponse } from "../_shared/http.ts";
import {
  recurringChargeAmounts,
  recurringQuoteCharges,
} from "./quoteCharges.ts";
import { getAdminClient } from "../_shared/supabaseClients.ts";
import { resolveCallerOrganization } from "../_shared/orgContext.ts";
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.118.0";
import {
  futurePeriodLimit,
  type FuturePeriodOptions,
} from "./futurePeriods.ts";
import { groupPlanItems } from "./grouping.ts";
import { selectTargetItems } from "./selection.ts";
import {
  fromCents,
  resolveVatRatePercent,
  sumLineTaxCents,
  sumMoneyCents,
} from "../_shared/money.ts";

const TZ = "America/Monterrey";

function nowInMonterrey(): Date {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(new Date());
  const get = (t: string) =>
    Number(parts.find((p) => p.type === t)?.value ?? "0");
  return new Date(
    Date.UTC(
      get("year"),
      get("month") - 1,
      get("day"),
      get("hour"),
      get("minute"),
      get("second"),
    ),
  );
}

export type { PlanItem } from "./planTypes.ts";

export async function buildPlan(
  supabase: SupabaseClient,
  organizationId?: string | null,
  planningDate?: Date,
  futureOptions: FuturePeriodOptions = {},
  metrics?: RecurringPerformance,
): Promise<RecurringPlan> {
  const contexts = await loadRecurringPlanningData(
    supabase,
    organizationId,
    metrics,
  );
  const plan = () =>
    planRecurringInvoices(
      contexts,
      planningDate ?? nowInMonterrey(),
      futureOptions,
    );
  return metrics ? metrics.measure("plan", plan) : plan();
}

function errorMessage(error: unknown): string {
  if (typeof error === "string") {
    return error && error !== "[object Object]" ? error : "Error sin detalle";
  }
  if (error instanceof Error) return error.message || "Error sin detalle";
  if (typeof error === "object" && error !== null) {
    const e = error as Record<string, unknown>;
    const parts: string[] = [];
    if (e.message !== undefined) parts.push(errorMessage(e.message));
    if (typeof e.details === "string" && e.details) parts.push(e.details);
    if (typeof e.hint === "string" && e.hint) parts.push(e.hint);
    if (typeof e.code === "string" && e.code) parts.push(`(código ${e.code})`);
    if (parts.length > 0) return parts.join(" · ");
    try {
      return JSON.stringify(error).slice(0, 500);
    } catch {
      return "Error sin detalle";
    }
  }
  return error == null ? "Error sin detalle" : String(error);
}

export async function executePlan(
  supabase: SupabaseClient,
  items: PlanItem[],
  allowStaleRate = false,
) {
  const created: Array<{
    bookingIds: string[];
    invoiceId: string;
    invoiceNumber: string | null;
  }> = [];
  const alreadyExisting: typeof created = [];
  const failed: Array<{ bookingIds: string[]; error: string }> = [];
  // R6-F5: fail-closed. Un periodo cuya reserva se actualizó DESPUÉS del fin
  // del periodo pudo cambiar de tarifa; no se factura salvo confirmación
  // explícita del operador (allowStaleRate). El cron nunca la envía.
  const skippedStaleRate: Array<
    { bookingIds: string[]; periodStart: string; periodEnd: string }
  > = [];
  // B5-01: periodos catch-up facturados con tarifa posiblemente desactualizada
  // (sólo cuando el operador confirmó explícitamente).
  const rateWarnings: Array<
    { bookingIds: string[]; periodStart: string; periodEnd: string }
  > = [];

  const blockedBefore = new Map<string, string>();
  if (!allowStaleRate) {
    const stale = items.filter((i) => i.rateWarning);
    for (const i of stale) {
      const earliest = blockedBefore.get(i.bookingId);
      if (!earliest || i.startStr < earliest) {
        blockedBefore.set(i.bookingId, i.startStr);
      }
      skippedStaleRate.push({
        bookingIds: [i.bookingId],
        periodStart: i.startStr,
        periodEnd: i.endStr,
      });
    }
    items = items.filter((i) => !i.rateWarning);
  }

  const groups = groupPlanItems(items);

  for (
    const group of [...groups.values()].sort((a, b) =>
      a[0].startStr.localeCompare(b[0].startStr)
    )
  ) {
    const first = group[0];
    const bookingIds = group.map((i) => i.bookingId);

    try {
      if (
        group.some((item) =>
          item.isFuture && blockedBefore.has(item.bookingId) &&
          blockedBefore.get(item.bookingId)! < item.startStr
        )
      ) {
        throw new Error(
          "No se anticipó el período porque uno anterior no pudo generarse",
        );
      }
      // Multiempresa: los datos comerciales/fiscales de facturación viven en
      // organization_customers (organización + cliente); `customers` es sólo
      // la identidad global y ya no se usa aquí para el receptor del CFDI.
      const { data: customer, error: customerError } = await supabase
        .from("organization_customers")
        .select(
          "rfc, razon_social, regimen_fiscal, domicilio_fiscal_cp, uso_cfdi, tax_rate",
        )
        .eq("customer_id", first.customerId)
        .eq("organization_id", first.organizationId)
        .maybeSingle();
      if (customerError) throw customerError;
      if (group.some((item) => item.fiscalFingerprint)) {
        const currentFiscalFingerprint = await previewFingerprint(
          fiscalSnapshot(customer),
        );
        if (
          group.some((item) =>
            item.fiscalFingerprint &&
            item.fiscalFingerprint !== currentFiscalFingerprint
          )
        ) {
          throw new Error(
            "Los datos fiscales cambiaron; actualiza la vista previa",
          );
        }
      }

      // Re-read before every group/catch-up period. The SQL guard atomically
      // reserves these exact source quantities, including sibling bookings.
      const quoteIds = [
        ...new Set(
          group.map((i) => i.quoteId).filter((id): id is string => !!id),
        ),
      ];
      const { data: chargeAvailability, error: chargeError } = await supabase
        .rpc(
          "get_quote_charge_availability",
          { p_quote_ids: quoteIds },
        );
      if (chargeError) throw chargeError;
      const extraLines = recurringQuoteCharges(chargeAvailability, quoteIds);

      const rentalLines = group.map((i) => {
        const proratedLabel = i.isProrated
          ? ` — prorrateado ${i.proratedDays} días`
          : "";
        return {
          description: `${i.forkliftName || "Montacargas"} — Renta mensual (${
            fmtMx(i.billingStart)
          } al ${fmtMx(i.billingEnd)}${proratedLabel})${
            i.forkliftSerial ? ` (Serie: ${i.forkliftSerial})` : ""
          }`,
          line_kind: "rental",
          quantity: 1,
          unit_price: i.billedAmount,
          total: i.billedAmount,
        };
      });
      const lineItems = [...rentalLines, ...extraLines];
      const billedAmounts = [
        ...group.map((i) => i.billedAmount),
      ];

      // M23: tasa por cliente (frontera 8%, exento 0%) en vez de 16 fijo,
      // y aritmética en centavos enteros (_shared/money.ts) en vez de floats
      // con Math.round — elimina el drift de centavos acumulado por período.
      const rentalSubtotalCents = sumMoneyCents(billedAmounts);
      // R9-14: `resolveVatRatePercent` distingue "sin dato" (null/undefined/NaN
      // -> DEFAULT_VAT_RATE_PERCENT) de "0% explícito" (se respeta). Antes
      // `Number(customer?.tax_rate)` convertía null en 0 y generaba IVA 0%
      // inesperado cuando el cliente no tenía tasa capturada.
      const taxRate = resolveVatRatePercent(customer?.tax_rate);
      assertNoLegacyVat({ tax_rate: taxRate, line_items: lineItems });
      // A1-B2: IVA línea por línea (mismo criterio que computeTotals y que
      // Facturapi al timbrar). Redondear una sola vez sobre el subtotal
      // agregado generaba varianzas de centavos que dejaban la factura
      // recurrente en cfdi_status='error' (BL-A5).
      const chargeAmounts = extraLines.map((line) =>
        recurringChargeAmounts(line, taxRate)
      );
      const subtotalCents = rentalSubtotalCents +
        chargeAmounts.reduce((sum, line) => sum + line.netCents, 0);
      const taxAmountCents = sumLineTaxCents(billedAmounts, taxRate) +
        chargeAmounts.reduce((sum, line) => sum + line.taxCents, 0);

      const subtotal = fromCents(subtotalCents);
      const taxAmount = fromCents(taxAmountCents);
      const total = fromCents(subtotalCents + taxAmountCents);

      if (group.some((i) => i.rateWarning)) {
        rateWarnings.push({
          bookingIds,
          periodStart: first.startStr,
          periodEnd: first.endStr,
        });
      }

      // BL-B5 (Ola 2.2): RPC atómico — invoice + pivot + last_billed_date
      // en una sola transacción con advisory lock por reserva. Evita facturas
      // huérfanas si falla el pivot y previene duplicados en corridas paralelas.
      const { data: rpcResult, error: rpcErr } = await supabase.rpc(
        "create_recurring_invoice",
        {
          p_booking_ids: bookingIds,
          p_customer_id: first.customerId,
          p_customer_name: first.customerName,
          p_line_items: lineItems,
          p_subtotal: subtotal,
          p_tax_rate: taxRate,
          p_tax_amount: taxAmount,
          p_total: total,
          p_billing_period_start: first.startStr,
          p_billing_period_end: first.endStr,
          p_receptor_rfc: customer?.rfc ?? null,
          p_receptor_razon_social: customer?.razon_social ||
            first.customerName ||
            null,
          p_receptor_regimen_fiscal: customer?.regimen_fiscal ?? null,
          p_receptor_domicilio_fiscal_cp: customer?.domicilio_fiscal_cp ?? null,
          // Residual (b): sin default "G03"; el uso de CFDI debe venir del
          // cliente (la RPC rechaza el periodo si falta y se reporta el error).
          p_uso_cfdi: customer?.uso_cfdi ?? null,
          // Moneda y tipo de cambio pactados en la reserva.
          p_moneda: first.currency,
          p_tipo_cambio: first.tipoCambio,
        },
      );

      if (rpcErr) {
        throw rpcErr;
      }

      const row = Array.isArray(rpcResult) ? rpcResult[0] : rpcResult;
      if (!row?.invoice_id) throw new Error("RPC returned no invoice_id");

      const result = {
        bookingIds,
        invoiceId: row.invoice_id as string,
        invoiceNumber: (row.invoice_number as string) ?? null,
      };
      if (row.already_existed === true) alreadyExisting.push(result);
      else created.push(result);
    } catch (err) {
      const message = errorMessage(err);
      console.error("[generate-recurring-invoices] period failed", {
        bookingIds,
        message,
      });
      failed.push({ bookingIds, error: message });
      for (const item of group) {
        const earliest = blockedBefore.get(item.bookingId);
        if (!earliest || item.startStr < earliest) {
          blockedBefore.set(item.bookingId, item.startStr);
        }
      }
    }
  }

  return { created, alreadyExisting, failed, rateWarnings, skippedStaleRate };
}

export type HandlerDependencies = {
  authenticateCronRequest?: typeof authenticateCronRequest;
  requireServiceOrRole?: typeof requireServiceOrRole;
  getAdminClient?: typeof getAdminClient;
  planningDate?: Date;
  performance?: RecurringPerformance;
};

function attachPerformance(
  response: Response,
  metrics: RecurringPerformance,
  outcome: "ok" | "error",
) {
  const { serverTiming, traceId } = metrics.finish(outcome);
  response.headers.set("Server-Timing", serverTiming);
  response.headers.set("X-Recurring-Trace", traceId);
  response.headers.set(
    "Access-Control-Expose-Headers",
    "Server-Timing, X-Recurring-Trace",
  );
  return response;
}

/** Importable HTTP boundary; only index.ts registers the Edge listener. */
export async function handleRequest(
  req: Request,
  dependencies: HandlerDependencies = {},
): Promise<Response> {
  const corsRes = handleCors(req);
  if (corsRes) return corsRes;
  const metrics = dependencies.performance ?? createRecurringPerformance();
  let instrumentPreview = false;

  try {
    // Lote C · DIFF 8 rest: auth timing-safe compartida para cron/service.
    const cronAuth = await metrics.measure(
      "auth_cron",
      () =>
        (dependencies.authenticateCronRequest ?? authenticateCronRequest)(req),
    );
    let supabase: SupabaseClient;
    // Multiempresa Fase 1: ejecuciones manuales (usuario autenticado) se
    // acotan SIEMPRE a la organización del caller (nunca al payload). El
    // cron (y el bypass service_role interno) procesan todas las
    // organizaciones; cada reserva conserva su propia organization_id y la
    // agrupación posterior (buildPlan/executePlan) nunca mezcla empresas.
    let scopeOrganizationId: string | null = null;
    if (cronAuth.ok) {
      supabase = (dependencies.getAdminClient ?? getAdminClient)();
    } else {
      const auth = await metrics.measure(
        "auth_user",
        () =>
          (dependencies.requireServiceOrRole ?? requireServiceOrRole)(req, [
            "admin",
            "administrativo",
          ]),
      );
      if (!auth.ok) return auth.response;
      supabase = auth.adminClient;
      if (auth.role !== "service_role") {
        const callerOrg = await metrics.measure(
          "auth_org",
          () =>
            resolveCallerOrganization(
              supabase,
              auth.userId,
            ),
        );
        if (!callerOrg.ok) {
          return jsonError(req, callerOrg.status, callerOrg.message);
        }
        scopeOrganizationId = callerOrg.organizationId;
      }
    }

    // Parse body (may be empty for legacy callers)
    let body: {
      preview?: boolean;
      bookingIds?: string[];
      // R9-18: selección explícita reserva + periodo desde el asistente.
      selections?: Array<
        {
          bookingId?: string;
          periodStart?: string;
          expectedFingerprint?: string;
        }
      >;
      allowStaleRate?: boolean;
      includeFuturePeriods?: boolean;
      futureThroughMonth?: string;
    } = {};
    try {
      const text = await req.text();
      if (text) body = JSON.parse(text);
    } catch {
      return jsonError(req, 400, "JSON inválido");
    }
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return jsonError(req, 400, "Se requiere un objeto JSON");
    }
    for (const key of ["preview", "allowStaleRate"] as const) {
      if (body[key] !== undefined && typeof body[key] !== "boolean") {
        return jsonError(req, 400, `${key} debe ser booleano`);
      }
    }
    try {
      futurePeriodLimit(body, dependencies.planningDate ?? nowInMonterrey());
    } catch (error) {
      return jsonError(req, 400, errorMessage(error));
    }
    if (
      body.selections !== undefined &&
      (!Array.isArray(body.selections) ||
        body.selections.some((selection) =>
          !selection || typeof selection !== "object" ||
          typeof selection.bookingId !== "string" || !selection.bookingId ||
          typeof selection.periodStart !== "string" ||
          !/^\d{4}-\d{2}-\d{2}$/.test(selection.periodStart) ||
          !Number.isFinite(Date.parse(`${selection.periodStart}T00:00:00Z`)) ||
          new Date(`${selection.periodStart}T00:00:00Z`).toISOString().slice(
              0,
              10,
            ) !== selection.periodStart
        ))
    ) return jsonError(req, 400, "Selección de períodos inválida");
    if (
      body.bookingIds !== undefined &&
      (!Array.isArray(body.bookingIds) ||
        body.bookingIds.some((id) => typeof id !== "string" || !id))
    ) {
      return jsonError(req, 400, "Selección de reservas inválida");
    }
    if (body.includeFuturePeriods === true) {
      if (!scopeOrganizationId) {
        return jsonError(
          req,
          403,
          "Anticipar períodos requiere un operador autenticado",
        );
      }
      if (
        body.bookingIds !== undefined ||
        (!body.preview && !Array.isArray(body.selections))
      ) {
        return jsonError(
          req,
          400,
          "Anticipar períodos requiere selección exacta de reserva y período",
        );
      }
    }

    // POLÍTICA (v7.412.0): la facturación recurrente NUNCA se genera sola.
    // Armar los borradores es una decisión del operador (puede juntar o
    // separar reservas en una misma factura), así que el cron sólo puede
    // consultar; cualquier intento de generar desde el cron es no-op.
    if (cronAuth.ok && !body.preview) {
      console.log(
        "[generate-recurring-invoices] cron generation disabled (manual-only policy)",
      );
      return jsonResponse(req, {
        success: true,
        skipped: "automatic_generation_disabled",
        invoicesCreated: 0,
        bookingsBilled: 0,
        created: [],
        alreadyExisting: [],
        failed: [],
        rateWarnings: [],
        skippedStaleRate: [],
      });
    }

    // Only a validated, tenant-scoped manual preview exposes diagnostics.
    // Cron/service results can span organizations and must not emit these counts.
    instrumentPreview = body.preview === true && !!scopeOrganizationId;
    const { lines, items: allItems, truncated, pendingCount } = await buildPlan(
      supabase,
      scopeOrganizationId,
      dependencies.planningDate,
      body,
      instrumentPreview ? metrics : undefined,
    );

    const eligibleLines = lines.filter((l) => l.eligible);
    const periodMonth = eligibleLines[0]?.periodStart?.slice(0, 7) ?? null;

    if (body.preview) {
      const response = () =>
        Promise.resolve(jsonResponse(req, {
          success: true,
          period: periodMonth,
          lines,
          truncated,
          pending_count: pendingCount,
        }));
      if (!instrumentPreview) return response();
      metrics.count("preview_lines", lines.length);
      metrics.count("eligible_lines", eligibleLines.length);
      metrics.count("pending_periods", pendingCount);
      return attachPerformance(
        await metrics.measure("serialize", response),
        metrics,
        "ok",
      );
    }

    // R9-18 (fix fail-open): decisión centralizada en `selection.ts`. Si el
    // caller envió `selections` (aunque venga vacío o con entradas
    // incompletas) se procesan EXCLUSIVAMENTE esas combinaciones.
    // Sin selector explícito no se escribe nada (fail-closed).
    const targetItems = selectTargetItems(allItems, body);
    if (targetItems === null) {
      return jsonResponse(req, {
        success: false,
        error: "Se requiere una selección explícita",
      }, { status: 400 });
    }

    if (
      body.includeFuturePeriods &&
      body.selections?.some((selection) =>
        !targetItems.some((item) =>
          item.bookingId === selection.bookingId &&
          item.startStr === selection.periodStart
        ) ||
        typeof selection.expectedFingerprint !== "string" ||
        !lines.some((line) =>
          line.eligible && line.bookingId === selection.bookingId &&
          line.periodStart === selection.periodStart &&
          line.previewFingerprint === selection.expectedFingerprint
        )
      )
    ) {
      return jsonError(
        req,
        409,
        "La selección cambió o ya no está disponible; actualiza la vista previa",
      );
    }

    // An advance must include every still-unbilled earlier period for that
    // booking. This is checked for the entire batch before any write; SQL
    // repeats the invariant under booking locks to cover concurrent changes.
    const selectedKeys = new Set(
      targetItems.map((item) => `${item.bookingId}|${item.startStr}`),
    );
    for (const item of targetItems) {
      if (
        !lines.some((line) =>
          line.bookingId === item.bookingId &&
          line.periodStart === item.startStr && line.isFuture
        )
      ) continue;
      if (
        lines.some((line) =>
          line.bookingId === item.bookingId &&
          line.periodStart < item.startStr &&
          (!line.eligible ||
            !selectedKeys.has(`${line.bookingId}|${line.periodStart}`))
        )
      ) {
        return jsonError(
          req,
          409,
          "Para anticipar un período debes seleccionar todos los períodos pendientes anteriores de la reserva",
        );
      }
    }

    // R6-F5: sólo un operador autenticado (no el cron) puede confirmar
    // facturar periodos cuya tarifa pudo cambiar después del periodo.
    const allowStaleRate = !!scopeOrganizationId &&
      body.allowStaleRate === true;

    const { created, alreadyExisting, failed, rateWarnings, skippedStaleRate } =
      await executePlan(
        supabase,
        targetItems,
        allowStaleRate,
      );
    const invoicesCreated = created.length;
    const bookingsBilled = created.reduce(
      (acc, c) => acc + c.bookingIds.length,
      0,
    );

    return jsonResponse(req, {
      success: true,
      invoicesCreated,
      bookingsBilled,
      created,
      alreadyExisting,
      failed,
      // B5-01: periodos catch-up facturados con posible tarifa desactualizada.
      rateWarnings,
      // R6-F5: periodos NO facturados por tarifa potencialmente desactualizada.
      skippedStaleRate,
      truncated,
      pending_count: pendingCount,
    });
  } catch (err) {
    console.error("[generate-recurring-invoices]", err);
    const response = jsonError(req, 500, "Internal server error");
    return instrumentPreview
      ? attachPerformance(response, metrics, "error")
      : response;
  }
}
